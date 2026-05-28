import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CancelClassDto,
  ClassMutationScope,
  CreateClassDto,
  UpdateClassDto,
} from './dto/classes.dto';
import { MpSellerService } from '../marketplace/mp-seller.service';
import {
  computeOccurrenceDates,
  formatDateOnly,
  inferWeekdaysConvention,
  isoWeekdayFromDate,
  normalizeWeekdaysToIso,
  parseIsoDateOnly,
  startOfDay,
  WEEKDAY_LABELS_PT,
  type WeekdaysConvention,
} from './class-series.utils';

type ClassRow = {
  id: string;
  seriesId: string | null;
  name: string;
  teacherName: string;
  date: Date;
  startTime: string;
  durationMinutes: number;
  maxStudents: number;
  location: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class ClassesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mpSeller: MpSellerService,
  ) {}

  async list(page = 1, limit = 20, status?: string, studentId?: string) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const where = status ? { status: status as Prisma.EnumClassStatusFilter } : undefined;

    const [classes, total] = await Promise.all([
      this.prisma.classInstance.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'asc' },
        include: {
          series: { select: { scheduleType: true, weekdays: true } },
          _count: {
            select: { attendances: { where: { status: { not: 'cancelled' } } } },
          },
        },
      }),
      this.prisma.classInstance.count({ where }),
    ]);

    let enrollmentMap: Record<string, { status: string; enrollmentSource: string }> = {};
    if (studentId) {
      const enrollments = await this.prisma.classAttendance.findMany({
        where: {
          studentId,
          classInstanceId: { in: classes.map((c) => c.id) },
          status: { not: 'cancelled' },
        },
        select: { classInstanceId: true, status: true, enrollmentSource: true },
      });
      enrollmentMap = Object.fromEntries(
        enrollments.map((e) => [
          e.classInstanceId,
          { status: e.status, enrollmentSource: e.enrollmentSource },
        ]),
      );
    }

    const data = classes.map((c) => {
      const en = enrollmentMap[c.id];
      return this.mapClassRow(c, en);
    });

    return { data, total, page, limit: take, hasMore: skip + take < total };
  }

  async create(dto: CreateClassDto) {
    await this.mpSeller.requireMpConnected();

    const scheduleType = dto.scheduleType ?? 'single';
    const dates = this.resolveCreateDates(dto, scheduleType);

    if (dates.length === 0) {
      throw new BadRequestException('Nenhuma data de aula gerada para o período informado.');
    }

    const base = {
      name: dto.name.trim(),
      teacherName: dto.teacherName.trim(),
      startTime: dto.startTime,
      durationMinutes: dto.durationMinutes,
      maxStudents: dto.maxStudents,
      location: dto.location?.trim() || null,
    };

    const isoWeekdays =
      scheduleType === 'single'
        ? []
        : this.resolveIsoWeekdays(dto.weekdays ?? [], dto.weekdaysConvention);

    const seriesData =
      scheduleType === 'single'
        ? null
        : {
            ...base,
            scheduleType: scheduleType as 'weekly' | 'biweekly',
            weekdays: isoWeekdays as Prisma.InputJsonValue,
          };

    const instances = await this.prisma.$transaction(async (tx) => {
      const series = seriesData
        ? await tx.classSeries.create({ data: seriesData })
        : null;

      const created: ClassRow[] = [];
      for (const date of dates) {
        const row = await tx.classInstance.create({
          data: {
            ...base,
            date,
            seriesId: series?.id ?? null,
          },
        });
        created.push(row);
      }

      if (series) {
        await tx.classSeries.update({
          where: { id: series.id },
          data: base,
        });
      }

      return { series, created };
    });

    return {
      seriesId: instances.series?.id ?? null,
      createdCount: instances.created.length,
      instances: instances.created.map((c) => this.mapClassRow(c)),
      instance: this.mapClassRow(instances.created[0]),
    };
  }

  async update(id: string, dto: UpdateClassDto) {
    const cls = await this.ensureExists(id);
    const scope: ClassMutationScope = dto.scope ?? 'single';

    if (scope === 'future' && !cls.seriesId) {
      throw new BadRequestException(
        'Esta aula não faz parte de uma série recorrente.',
      );
    }

    const data = this.buildUpdateData(dto, scope === 'future');

    if (scope === 'single') {
      const updated = await this.prisma.classInstance.update({
        where: { id },
        data,
      });
      if (cls.seriesId) {
        await this.syncSeriesTemplate(cls.seriesId);
      }
      return this.mapClassRow(updated);
    }

    const fromDate = this.futureCutoffDate(cls.date);
    const ids = await this.findFutureOpenInstanceIds(cls.seriesId!, fromDate);

    await this.prisma.classInstance.updateMany({
      where: { id: { in: ids } },
      data,
    });

    await this.syncSeriesTemplate(cls.seriesId!);

    const updated = await this.prisma.classInstance.findUniqueOrThrow({
      where: { id },
    });
    return {
      ...this.mapClassRow(updated),
      updatedCount: ids.length,
    };
  }

  async cancel(id: string, dto: CancelClassDto = {}) {
    const cls = await this.ensureExists(id);
    const scope: ClassMutationScope = dto.scope ?? 'single';

    if (scope === 'future' && !cls.seriesId) {
      throw new BadRequestException(
        'Esta aula não faz parte de uma série recorrente.',
      );
    }

    const targets =
      scope === 'single'
        ? [cls]
        : await this.loadFutureOpenInstances(cls.seriesId!, this.futureCutoffDate(cls.date));

    if (targets.length === 0) {
      return { success: true, cancelledCount: 0 };
    }

    const ids = targets.map((t) => t.id);

    await this.prisma.classInstance.updateMany({
      where: { id: { in: ids } },
      data: { status: 'cancelled' },
    });

    for (const target of targets) {
      const attendances = await this.prisma.classAttendance.findMany({
        where: {
          classInstanceId: target.id,
          status: { not: 'cancelled' },
        },
        select: { studentId: true },
      });
      const studentIds = attendances.map((a) => a.studentId);
      if (studentIds.length === 0) continue;

      await this.notifications.sendToMany(
        studentIds,
        'class_cancelled',
        'Aula cancelada',
        `A aula ${target.name} de ${formatDateOnly(target.date)} às ${target.startTime} foi cancelada.`,
      );
    }

    return { success: true, cancelledCount: targets.length };
  }

  private resolveCreateDates(
    dto: CreateClassDto,
    scheduleType: 'single' | 'weekly' | 'biweekly',
  ): Date[] {
    if (scheduleType === 'single') {
      return [parseIsoDateOnly(dto.date)];
    }

    const isoWeekdays = this.resolveIsoWeekdays(
      dto.weekdays ?? [],
      dto.weekdaysConvention,
    );
    if (isoWeekdays.length === 0) {
      throw new BadRequestException(
        'Informe ao menos um dia da semana para aulas recorrentes.',
      );
    }

    const weeksAhead = dto.weeksAhead ?? 8;
    return computeOccurrenceDates(scheduleType, isoWeekdays, weeksAhead);
  }

  private resolveIsoWeekdays(
    raw: number[],
    convention?: WeekdaysConvention,
  ): number[] {
    if (raw.length === 0) return [];
    const resolved = convention ?? inferWeekdaysConvention(raw);
    const iso = normalizeWeekdaysToIso(raw, resolved);
    return iso.filter((n) => n >= 1 && n <= 7);
  }

  /** A partir desta data (e nunca antes de hoje): aulas futuras da série. */
  private futureCutoffDate(instanceDate: Date): Date {
    const today = startOfDay(new Date());
    const d = startOfDay(instanceDate);
    return d >= today ? d : today;
  }

  private async findFutureOpenInstanceIds(
    seriesId: string,
    fromDate: Date,
  ): Promise<string[]> {
    const rows = await this.prisma.classInstance.findMany({
      where: {
        seriesId,
        status: 'open',
        date: { gte: fromDate },
      },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  private async loadFutureOpenInstances(seriesId: string, fromDate: Date) {
    return this.prisma.classInstance.findMany({
      where: {
        seriesId,
        status: 'open',
        date: { gte: fromDate },
      },
      include: {
        attendances: {
          where: { status: { not: 'cancelled' } },
          select: { studentId: true },
        },
      },
    });
  }

  private buildUpdateData(dto: UpdateClassDto, bulk: boolean) {
    const data: Prisma.ClassInstanceUpdateManyMutationInput = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.teacherName !== undefined) data.teacherName = dto.teacherName.trim();
    if (dto.startTime !== undefined) data.startTime = dto.startTime;
    if (dto.durationMinutes !== undefined) data.durationMinutes = dto.durationMinutes;
    if (dto.maxStudents !== undefined) data.maxStudents = dto.maxStudents;
    if (dto.location !== undefined) data.location = dto.location?.trim() || null;

    if (!bulk && dto.date !== undefined) {
      data.date = parseIsoDateOnly(dto.date);
    }

    return data;
  }

  private async syncSeriesTemplate(seriesId: string) {
    const sample = await this.prisma.classInstance.findFirst({
      where: { seriesId, status: 'open', date: { gte: startOfDay(new Date()) } },
      orderBy: { date: 'asc' },
    });
    if (!sample) return;

    await this.prisma.classSeries.update({
      where: { id: seriesId },
      data: {
        name: sample.name,
        teacherName: sample.teacherName,
        startTime: sample.startTime,
        durationMinutes: sample.durationMinutes,
        maxStudents: sample.maxStudents,
        location: sample.location,
      },
    });
  }

  private mapClassRow(
    c: ClassRow & {
      _count?: { attendances: number };
      series?: { scheduleType: string; weekdays: unknown } | null;
    },
    enrollment?: { status: string; enrollmentSource: string } | null,
  ) {
    const count = c._count?.attendances ?? 0;
    return {
      id: c.id,
      seriesId: c.seriesId,
      name: c.name,
      teacherName: c.teacherName,
      date: formatDateOnly(c.date),
      weekdayIso: isoWeekdayFromDate(c.date),
      weekdayLabel: WEEKDAY_LABELS_PT[isoWeekdayFromDate(c.date)] ?? null,
      startTime: c.startTime,
      durationMinutes: c.durationMinutes,
      maxStudents: c.maxStudents,
      location: c.location,
      status: c.status,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      availableSlots: c.maxStudents - count,
      enrollmentStatus: enrollment?.status ?? null,
      enrollmentSource: enrollment?.enrollmentSource ?? null,
      seriesScheduleType: c.series?.scheduleType ?? null,
      seriesWeekdays: c.series?.weekdays ?? null,
      seriesWeekdayLabels: this.weekdayLabelsFromJson(c.series?.weekdays),
    };
  }

  private weekdayLabelsFromJson(weekdays: unknown): string[] | null {
    if (!Array.isArray(weekdays)) return null;
    const labels = weekdays
      .map((n) => WEEKDAY_LABELS_PT[Number(n)])
      .filter((l): l is string => Boolean(l));
    return labels.length > 0 ? labels : null;
  }

  private async ensureExists(id: string) {
    const cls = await this.prisma.classInstance.findUnique({ where: { id } });
    if (!cls) throw new NotFoundException('Aula não encontrada');
    return cls;
  }
}
