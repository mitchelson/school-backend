import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateClassDto, UpdateClassDto } from './dto/classes.dto';

@Injectable()
export class ClassesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async list(page = 1, limit = 20, status?: string, studentId?: string) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const where = status ? { status: status as any } : undefined;

    const [classes, total] = await Promise.all([
      this.prisma.classInstance.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'asc' },
        include: { _count: { select: { attendances: { where: { status: { not: 'cancelled' } } } } } },
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
      return {
        ...c,
        availableSlots: c.maxStudents - c._count.attendances,
        enrollmentStatus: en?.status ?? null,
        enrollmentSource: en?.enrollmentSource ?? null,
        _count: undefined,
      };
    });

    return { data, total, page, limit: take, hasMore: skip + take < total };
  }

  async create(dto: CreateClassDto) {
    return this.prisma.classInstance.create({
      data: {
        name: dto.name,
        teacherName: dto.teacherName,
        date: new Date(dto.date),
        startTime: dto.startTime,
        durationMinutes: dto.durationMinutes,
        maxStudents: dto.maxStudents,
        location: dto.location,
      },
    });
  }

  async update(id: string, dto: UpdateClassDto) {
    await this.ensureExists(id);
    return this.prisma.classInstance.update({
      where: { id },
      data: {
        ...dto,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });
  }

  async cancel(id: string) {
    const cls = await this.prisma.classInstance.findUnique({
      where: { id },
      include: { attendances: { where: { status: { not: 'cancelled' } }, select: { studentId: true } } },
    });
    if (!cls) throw new NotFoundException('Aula não encontrada');

    await this.prisma.classInstance.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    // Notify enrolled students
    const studentIds = cls.attendances.map((a) => a.studentId);
    await this.notifications.sendToMany(
      studentIds,
      'class_cancelled',
      'Aula cancelada',
      `A aula ${cls.name} de ${cls.date.toLocaleDateString('pt-BR')} às ${cls.startTime} foi cancelada.`,
    );

    return { success: true };
  }

  private async ensureExists(id: string) {
    const cls = await this.prisma.classInstance.findUnique({ where: { id } });
    if (!cls) throw new NotFoundException('Aula não encontrada');
  }
}
