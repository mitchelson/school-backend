import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { buildClassStartInstant } from '../classes/class-series.utils';
import { NotificationsService } from '../notifications/notifications.service';

type EnrollOutcome =
  | { outcome: 'enrolled'; enrollment: Awaited<ReturnType<EnrollmentsService['enrollInternal']>> }
  | { outcome: 'waitlisted'; waitlist: { id: string; position: number } };

@Injectable()
export class EnrollmentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async enroll(studentId: string, classInstanceId: string): Promise<EnrollOutcome> {
    const classInstance = await this.loadOpenClass(classInstanceId);
    const availableSlots = await this.countAvailableSlots(classInstance);

    if (availableSlots <= 0) {
      return this.joinWaitlist(studentId, classInstanceId, classInstance);
    }

    const enrollment = await this.enrollInternal(studentId, classInstanceId, classInstance);
    return { outcome: 'enrolled', enrollment };
  }

  async joinWaitlist(
    studentId: string,
    classInstanceId: string,
    classInstance?: Awaited<ReturnType<EnrollmentsService['loadOpenClass']>>,
  ): Promise<EnrollOutcome> {
    const cls = classInstance ?? (await this.loadOpenClass(classInstanceId));

    const existingEnrollment = await this.prisma.classAttendance.findUnique({
      where: { studentId_classInstanceId: { studentId, classInstanceId } },
    });
    if (existingEnrollment && existingEnrollment.status !== 'cancelled') {
      throw new ConflictException('Já inscrito nesta aula');
    }

    await this.assertEnrollmentEligible(studentId, cls.date);

    const existingWaitlist = await this.prisma.classWaitlistEntry.findUnique({
      where: { studentId_classInstanceId: { studentId, classInstanceId } },
    });

    if (existingWaitlist?.status === 'waiting') {
      throw new ConflictException('Você já está na lista de espera desta aula');
    }

    const waitlist = await this.prisma.$transaction(async (tx) => {
      const waitingCount = await tx.classWaitlistEntry.count({
        where: { classInstanceId, status: 'waiting' },
      });
      const position = waitingCount + 1;

      if (existingWaitlist) {
        return tx.classWaitlistEntry.update({
          where: { id: existingWaitlist.id },
          data: { status: 'waiting', position },
        });
      }

      return tx.classWaitlistEntry.create({
        data: { studentId, classInstanceId, status: 'waiting', position },
      });
    });

    await this.notifications.send(
      studentId,
      'waitlist_joined',
      'Lista de espera',
      `Você entrou na lista de espera da aula ${cls.name} (${waitlist.position}º). Avisaremos se uma vaga abrir.`,
    );

    return { outcome: 'waitlisted', waitlist: { id: waitlist.id, position: waitlist.position } };
  }

  async cancelWaitlist(studentId: string, classInstanceId: string) {
    const entry = await this.prisma.classWaitlistEntry.findUnique({
      where: { studentId_classInstanceId: { studentId, classInstanceId } },
    });

    if (!entry || entry.status !== 'waiting') {
      throw new BadRequestException('Você não está na lista de espera desta aula');
    }

    await this.prisma.classWaitlistEntry.update({
      where: { id: entry.id },
      data: { status: 'cancelled' },
    });

    await this.reindexWaitlistPositions(classInstanceId);
    return { success: true };
  }

  async listMyEnrollments(studentId: string, scope: 'today' | 'upcoming' | 'all' = 'upcoming') {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const dateFilter =
      scope === 'today'
        ? { gte: todayStart, lte: todayEnd }
        : scope === 'upcoming'
          ? { gte: todayStart }
          : undefined;

    const enrollments = await this.prisma.classAttendance.findMany({
      where: {
        studentId,
        status: { in: ['enrolled', 'confirmed'] },
        classInstance: {
          status: 'open',
          ...(dateFilter && { date: dateFilter }),
        },
      },
      include: { classInstance: true },
      orderBy: { classInstance: { date: 'asc' } },
    });

    return enrollments.map((e) => ({
      id: e.id,
      enrollmentStatus: e.status,
      enrollmentSource: e.enrollmentSource,
      checkedInAt: e.checkedInAt,
      class: {
        id: e.classInstance.id,
        name: e.classInstance.name,
        teacherName: e.classInstance.teacherName,
        date: e.classInstance.date.toISOString(),
        startTime: e.classInstance.startTime,
        durationMinutes: e.classInstance.durationMinutes,
        location: e.classInstance.location,
        status: e.classInstance.status,
      },
    }));
  }

  async cancelEnrollment(studentId: string, classInstanceId: string) {
    const enrollment = await this.prisma.classAttendance.findUnique({
      where: { studentId_classInstanceId: { studentId, classInstanceId } },
      include: { classInstance: true },
    });

    if (!enrollment || enrollment.status === 'cancelled') {
      throw new BadRequestException('Inscrição não encontrada');
    }

    const classStart = buildClassStartInstant(
      enrollment.classInstance.date,
      enrollment.classInstance.startTime,
    );
    if (new Date() >= classStart) {
      throw new ForbiddenException('Não é possível cancelar após o início da aula');
    }

    await this.prisma.classAttendance.update({
      where: { id: enrollment.id },
      data: { status: 'cancelled' },
    });

    await this.promoteNextFromWaitlist(classInstanceId);
    return { success: true };
  }

  private async enrollInternal(
    studentId: string,
    classInstanceId: string,
    classInstance?: Awaited<ReturnType<EnrollmentsService['loadOpenClass']>>,
  ) {
    const cls = classInstance ?? (await this.loadOpenClass(classInstanceId));
    const availableSlots = await this.countAvailableSlots(cls);
    if (availableSlots <= 0) {
      throw new BadRequestException('Sem vagas disponíveis');
    }

    const existing = await this.prisma.classAttendance.findUnique({
      where: { studentId_classInstanceId: { studentId, classInstanceId } },
    });

    if (existing && existing.status !== 'cancelled') {
      throw new ConflictException('Já inscrito nesta aula');
    }

    const enrollmentSource = await this.determineSource(studentId, cls.date);

    const result = await this.prisma.$transaction(async (tx) => {
      if (enrollmentSource === 'credit') {
        const balance = await tx.studentTokenBalance.findUnique({ where: { studentId } });
        if (!balance || balance.balance <= 0) {
          throw new BadRequestException('Sem créditos disponíveis');
        }
        await tx.studentTokenBalance.update({
          where: { studentId },
          data: { balance: { decrement: 1 } },
        });
      }

      if (existing && existing.status === 'cancelled') {
        return tx.classAttendance.update({
          where: { id: existing.id },
          data: { status: 'enrolled', enrollmentSource },
        });
      }

      return tx.classAttendance.create({
        data: { studentId, classInstanceId, status: 'enrolled', enrollmentSource },
      });
    });

    await this.notifications.send(
      studentId,
      'enrollment_confirmed',
      'Inscrição confirmada',
      `Você está inscrito na aula ${cls.name} - ${cls.date.toLocaleDateString('pt-BR')} às ${cls.startTime}`,
    );

    return result;
  }

  private async promoteNextFromWaitlist(classInstanceId: string): Promise<void> {
    const classInstance = await this.prisma.classInstance.findUnique({
      where: { id: classInstanceId },
      include: { _count: { select: { attendances: { where: { status: { not: 'cancelled' } } } } } },
    });

    if (!classInstance || classInstance.status !== 'open') return;

    const availableSlots = classInstance.maxStudents - classInstance._count.attendances;
    if (availableSlots <= 0) return;

    const next = await this.prisma.classWaitlistEntry.findFirst({
      where: { classInstanceId, status: 'waiting' },
      orderBy: { createdAt: 'asc' },
    });

    if (!next) return;

    try {
      await this.enrollInternal(next.studentId, classInstanceId, classInstance);
      await this.prisma.classWaitlistEntry.update({
        where: { id: next.id },
        data: { status: 'promoted' },
      });
      await this.notifications.send(
        next.studentId,
        'waitlist_promoted',
        'Vaga liberada!',
        `Uma vaga abriu na aula ${classInstance.name}. Sua inscrição foi confirmada automaticamente.`,
      );
      await this.reindexWaitlistPositions(classInstanceId);
    } catch {
      await this.prisma.classWaitlistEntry.update({
        where: { id: next.id },
        data: { status: 'cancelled' },
      });
      await this.reindexWaitlistPositions(classInstanceId);
      await this.promoteNextFromWaitlist(classInstanceId);
    }
  }

  private async reindexWaitlistPositions(classInstanceId: string) {
    const waiting = await this.prisma.classWaitlistEntry.findMany({
      where: { classInstanceId, status: 'waiting' },
      orderBy: { createdAt: 'asc' },
    });

    await this.prisma.$transaction(
      waiting.map((entry, index) =>
        this.prisma.classWaitlistEntry.update({
          where: { id: entry.id },
          data: { position: index + 1 },
        }),
      ),
    );
  }

  private async loadOpenClass(classInstanceId: string) {
    const classInstance = await this.prisma.classInstance.findUnique({
      where: { id: classInstanceId },
      include: { _count: { select: { attendances: { where: { status: { not: 'cancelled' } } } } } },
    });

    if (!classInstance || classInstance.status !== 'open') {
      throw new BadRequestException('Aula não disponível');
    }

    return classInstance;
  }

  private countAvailableSlots(
    classInstance: { maxStudents: number; _count: { attendances: number } },
  ) {
    return classInstance.maxStudents - classInstance._count.attendances;
  }

  private async assertEnrollmentEligible(studentId: string, classDate: Date) {
    try {
      await this.determineSource(studentId, classDate);
    } catch (err) {
      if (err instanceof ForbiddenException || err instanceof BadRequestException) {
        throw err;
      }
      throw new BadRequestException('Não é possível entrar na lista de espera no momento');
    }
  }

  private async determineSource(studentId: string, classDate: Date): Promise<'plan' | 'credit'> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { studentId },
      include: { plan: true },
    });

    if (subscription && subscription.status === 'active' && new Date() <= subscription.validUntil) {
      const weeklyCount = await this.getWeeklyCount(studentId, classDate);
      const limit = subscription.plan.weeklyLimit;

      if (limit === 0 || weeklyCount < limit) {
        return 'plan';
      }
    }

    const balance = await this.prisma.studentTokenBalance.findUnique({ where: { studentId } });
    if (!balance || balance.balance <= 0) {
      if (!subscription || subscription.status !== 'active' || new Date() > subscription.validUntil) {
        throw new ForbiddenException('Plano expirado. Realize o pagamento para continuar.');
      }
      throw new BadRequestException('Limite semanal atingido e sem créditos disponíveis');
    }

    return 'credit';
  }

  private async getWeeklyCount(studentId: string, referenceDate: Date): Promise<number> {
    const { start, end } = this.getWeekBounds(referenceDate);

    return this.prisma.classAttendance.count({
      where: {
        studentId,
        status: { not: 'cancelled' },
        enrollmentSource: 'plan',
        classInstance: { date: { gte: start, lte: end } },
      },
    });
  }

  private getWeekBounds(date: Date) {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;

    const start = new Date(d);
    start.setDate(d.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }
}
