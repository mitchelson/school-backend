import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EnrollmentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async enroll(studentId: string, classInstanceId: string) {
    // 1. Validate class is open and has slots
    const classInstance = await this.prisma.classInstance.findUnique({
      where: { id: classInstanceId },
      include: { _count: { select: { attendances: { where: { status: { not: 'cancelled' } } } } } },
    });

    if (!classInstance || classInstance.status !== 'open') {
      throw new BadRequestException('Aula não disponível');
    }

    const availableSlots = classInstance.maxStudents - classInstance._count.attendances;
    if (availableSlots <= 0) {
      throw new BadRequestException('Sem vagas disponíveis');
    }

    // 2. Check duplicate
    const existing = await this.prisma.classAttendance.findUnique({
      where: { studentId_classInstanceId: { studentId, classInstanceId } },
    });

    if (existing && existing.status !== 'cancelled') {
      throw new ConflictException('Já inscrito nesta aula');
    }

    // 3. Determine enrollment source (plan or credit)
    const enrollmentSource = await this.determineSource(studentId, classInstance.date);

    // 4. Atomic transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Deduct credit if needed
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

      // Create or reactivate enrollment
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

    // Send notification (outside transaction - non-critical)
    await this.notifications.send(
      studentId,
      'enrollment_confirmed',
      'Inscrição confirmada',
      `Você está inscrito na aula ${classInstance.name} - ${classInstance.date.toLocaleDateString('pt-BR')} às ${classInstance.startTime}`,
    );

    return result;
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

    // Check if class hasn't started
    const classStart = this.getClassDateTime(enrollment.classInstance.date, enrollment.classInstance.startTime);
    if (new Date() >= classStart) {
      throw new ForbiddenException('Não é possível cancelar após o início da aula');
    }

    // Cancel - does NOT return credit or weekly usage
    return this.prisma.classAttendance.update({
      where: { id: enrollment.id },
      data: { status: 'cancelled' },
    });
  }

  private async determineSource(studentId: string, classDate: Date): Promise<'plan' | 'credit'> {
    // Check subscription validity
    const subscription = await this.prisma.subscription.findUnique({
      where: { studentId },
      include: { plan: true },
    });

    if (subscription && subscription.status === 'active' && new Date() <= subscription.validUntil) {
      // Check weekly limit
      const weeklyCount = await this.getWeeklyCount(studentId, classDate);
      const limit = subscription.plan.weeklyLimit;

      if (limit === 0 || weeklyCount < limit) {
        return 'plan';
      }
    }

    // Fallback to credits
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

  private getClassDateTime(date: Date, startTime: string): Date {
    const [hours, minutes] = startTime.split(':').map(Number);
    const dt = new Date(date);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  }
}
