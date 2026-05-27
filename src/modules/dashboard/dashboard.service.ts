import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStudentDashboard(studentId: string) {
    const [subscription, tokenBalance, upcomingClasses, weeklyCount] = await Promise.all([
      this.prisma.subscription.findUnique({
        where: { studentId },
        include: { plan: true },
      }),
      this.prisma.studentTokenBalance.findUnique({ where: { studentId } }),
      this.getUpcomingClasses(studentId),
      this.getWeeklyCount(studentId),
    ]);

    const now = new Date();
    let subscriptionData = null;
    if (subscription) {
      const daysRemaining = Math.max(0, Math.ceil(
        (subscription.validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      ));
      subscriptionData = {
        planName: subscription.plan.name,
        validUntil: subscription.validUntil.toISOString(),
        daysRemaining,
        status: now <= subscription.validUntil ? 'active' as const : 'expired' as const,
      };
    }

    const weeklyLimit = subscription?.plan.weeklyLimit ?? null;

    return {
      subscription: subscriptionData,
      creditBalance: tokenBalance?.balance ?? 0,
      upcomingClasses,
      weeklyUsage: {
        used: weeklyCount,
        limit: weeklyLimit === 0 ? null : weeklyLimit, // 0 = unlimited → null
      },
    };
  }

  async getManagerDashboard() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      totalActiveStudents,
      subscriptionsByPlan,
      upcomingClasses,
      expiredSubs,
      monthlyRevenue,
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: 'aluno', status: 'active' } }),
      this.prisma.subscription.groupBy({
        by: ['planId'],
        where: { status: 'active' },
        _count: true,
      }),
      this.prisma.classInstance.findMany({
        where: { date: { gte: now, lte: weekFromNow }, status: 'open' },
        include: { _count: { select: { attendances: { where: { status: { not: 'cancelled' } } } } } },
        orderBy: { date: 'asc' },
        take: 10,
      }),
      this.prisma.subscription.findMany({
        where: { status: 'active', validUntil: { lt: now } },
        include: { student: { select: { fullName: true } } },
      }),
      this.prisma.payment.aggregate({
        where: { status: 'paid', paidAt: { gte: monthStart } },
        _sum: { amountInCents: true },
      }),
    ]);

    // Resolve plan names for subscriptions
    const planIds = subscriptionsByPlan.map((s) => s.planId);
    const plans = await this.prisma.plan.findMany({ where: { id: { in: planIds } } });
    const planMap = Object.fromEntries(plans.map((p) => [p.id, p.name]));

    return {
      totalActiveStudents,
      subscriptionsByPlan: subscriptionsByPlan.map((s) => ({
        planName: planMap[s.planId] ?? 'Desconhecido',
        count: s._count,
      })),
      upcomingClasses: upcomingClasses.map((c) => ({
        id: c.id,
        name: c.name,
        date: c.date.toISOString(),
        startTime: c.startTime,
        enrolledCount: c._count.attendances,
        maxStudents: c.maxStudents,
      })),
      expiredSubscriptions: {
        count: expiredSubs.length,
        students: expiredSubs.map((s) => ({
          name: s.student.fullName,
          expiredSince: s.validUntil.toISOString(),
        })),
      },
      monthlyRevenue: { total: monthlyRevenue._sum.amountInCents ?? 0 },
    };
  }

  private async getUpcomingClasses(studentId: string) {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const enrollments = await this.prisma.classAttendance.findMany({
      where: {
        studentId,
        status: { in: ['enrolled', 'confirmed'] },
        classInstance: { date: { gte: now, lte: weekFromNow }, status: 'open' },
      },
      include: { classInstance: true },
      orderBy: { classInstance: { date: 'asc' } },
      take: 5,
    });

    return enrollments.map((e) => ({
      id: e.classInstance.id,
      name: e.classInstance.name,
      date: e.classInstance.date.toISOString(),
      startTime: e.classInstance.startTime,
      location: e.classInstance.location,
    }));
  }

  private async getWeeklyCount(studentId: string) {
    const now = new Date();
    const day = now.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + diffToMonday);
    weekStart.setHours(0, 0, 0, 0);

    return this.prisma.classAttendance.count({
      where: {
        studentId,
        status: { not: 'cancelled' },
        enrollmentSource: 'plan',
        classInstance: { date: { gte: weekStart } },
      },
    });
  }
}
