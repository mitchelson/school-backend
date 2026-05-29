import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import {
  canPurchaseOrRenewPlan,
  daysUntilValidUntil,
  PLAN_RENEW_WINDOW_DAYS,
} from '../subscriptions/subscription.utils';

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
      const daysRemaining = daysUntilValidUntil(subscription.validUntil, now);
      const status = now <= subscription.validUntil ? ('active' as const) : ('expired' as const);
      subscriptionData = {
        planId: subscription.planId,
        planName: subscription.plan.name,
        weeklyLimit: subscription.plan.weeklyLimit,
        validUntil: subscription.validUntil.toISOString(),
        daysRemaining,
        status,
      };
    }

    const weeklyLimit = subscription?.plan.weeklyLimit ?? null;

    const pendingPayments = await this.prisma.payment.count({
      where: { studentId, status: 'pending' },
    });

    return {
      subscription: subscriptionData,
      creditBalance: tokenBalance?.balance ?? 0,
      upcomingClasses,
      weeklyUsage: {
        used: weeklyCount,
        limit: weeklyLimit === 0 ? null : weeklyLimit,
      },
      paymentAlerts: {
        pendingCount: pendingPayments,
        subscriptionExpired: subscriptionData?.status === 'expired',
        subscriptionExpiringSoon:
          subscriptionData?.status === 'active' &&
          (subscriptionData?.daysRemaining ?? 99) <= PLAN_RENEW_WINDOW_DAYS &&
          (subscriptionData?.daysRemaining ?? 0) > 0,
        canPurchasePlan: subscription
          ? canPurchaseOrRenewPlan(subscription.validUntil, now)
          : true,
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
      overduePayments,
      revenueByPurpose,
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
      this.prisma.payment.aggregate({
        where: { status: 'pending', createdAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
        _count: true,
        _sum: { amountInCents: true },
      }),
      this.prisma.payment.groupBy({
        by: ['purpose'],
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
      monthlyRevenue: {
        total: monthlyRevenue._sum.amountInCents ?? 0,
        subscriptions:
          revenueByPurpose.find((r) => r.purpose === 'plan')?._sum.amountInCents ?? 0,
        credits:
          revenueByPurpose.find((r) => r.purpose === 'credits')?._sum.amountInCents ?? 0,
      },
      overduePayments: {
        count: overduePayments._count,
        totalAmountInCents: overduePayments._sum.amountInCents ?? 0,
      },
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
