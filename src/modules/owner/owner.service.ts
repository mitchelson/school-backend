import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const USER_LIST_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
  mpUserId: true,
  mpConnectedAt: true,
  mpAccountEmail: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class OwnerService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async getSummary() {
    const [
      users,
      students,
      admins,
      owners,
      plans,
      classesOpen,
      paymentsPaid,
      paymentsPending,
      mpConnected,
      enrollments,
      subscriptionsActive,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'aluno' } }),
      this.prisma.user.count({ where: { role: 'admin' } }),
      this.prisma.user.count({ where: { role: 'owner' } }),
      this.prisma.plan.count(),
      this.prisma.classInstance.count({ where: { status: 'open' } }),
      this.prisma.payment.count({ where: { status: 'paid' } }),
      this.prisma.payment.count({ where: { status: 'pending' } }),
      this.prisma.user.count({ where: { mpConnectedAt: { not: null } } }),
      this.prisma.classAttendance.count({ where: { status: { not: 'cancelled' } } }),
      this.prisma.subscription.count({ where: { status: 'active' } }),
    ]);

    return {
      users,
      students,
      admins,
      owners,
      plans,
      classesOpen,
      paymentsPaid,
      paymentsPending,
      mpConnected,
      enrollments,
      subscriptionsActive,
    };
  }

  async listUsers(search?: string, role?: Role, page = 1, limit = 30) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: USER_LIST_SELECT,
        skip,
        take,
        orderBy: [{ role: 'asc' }, { fullName: 'asc' }],
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit: take, hasMore: skip + take < total };
  }

  async updateUserRole(actorId: string, userId: string, role: Role) {
    if (actorId === userId) {
      throw new ForbiddenException('Você não pode alterar sua própria role.');
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException('Usuário não encontrado');

    if (target.role === 'owner' && role !== 'owner') {
      const ownerCount = await this.prisma.user.count({ where: { role: 'owner' } });
      if (ownerCount <= 1) {
        throw new BadRequestException('Não é possível remover o único owner do sistema.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: USER_LIST_SELECT,
    });

    await this.audit.log({
      actorId,
      actorRole: 'owner',
      action: 'user.role_updated',
      entityType: 'user',
      entityId: userId,
      metadata: { previousRole: target.role, newRole: role },
    });

    return updated;
  }

  listAuditLogs(page = 1, limit = 50) {
    return this.audit.listForOwner(page, limit);
  }

  async listMpAccounts() {
    return this.prisma.user.findMany({
      where: { role: { in: ['admin', 'owner'] } },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        mpUserId: true,
        mpConnectedAt: true,
        mpAccountEmail: true,
        mpAccountNickname: true,
        mpAccountName: true,
        mpAccountSiteId: true,
        mpProfileSyncedAt: true,
        mpTokenExpiresAt: true,
      },
      orderBy: [{ mpConnectedAt: 'desc' }, { fullName: 'asc' }],
    });
  }

  async listPayments(page = 1, limit = 30, status?: string) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const where = status ? { status: status as Prisma.EnumPaymentStatusFilter } : undefined;

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { fullName: true, email: true } },
          plan: { select: { name: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, total, page, limit: take, hasMore: skip + take < total };
  }

  async listPlans() {
    return this.prisma.plan.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { subscriptions: true, payments: true } },
      },
    });
  }

  async listClasses(page = 1, limit = 30, status?: string) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const where = status ? { status: status as Prisma.EnumClassStatusFilter } : undefined;

    const [data, total] = await Promise.all([
      this.prisma.classInstance.findMany({
        where,
        skip,
        take,
        orderBy: [{ date: 'desc' }, { startTime: 'asc' }],
        include: {
          series: { select: { id: true, scheduleType: true } },
          _count: {
            select: { attendances: { where: { status: { not: 'cancelled' } } } },
          },
        },
      }),
      this.prisma.classInstance.count({ where }),
    ]);

    return { data, total, page, limit: take, hasMore: skip + take < total };
  }

  async listEnrollments(page = 1, limit = 30) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const [data, total] = await Promise.all([
      this.prisma.classAttendance.findMany({
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { id: true, fullName: true, email: true, role: true } },
          classInstance: {
            select: {
              id: true,
              name: true,
              date: true,
              startTime: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.classAttendance.count(),
    ]);

    return { data, total, page, limit: take, hasMore: skip + take < total };
  }

  async listSubscriptions(page = 1, limit = 30, status?: string) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;
    const where = status
      ? { status: status as Prisma.EnumSubscriptionStatusFilter }
      : undefined;

    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take,
        orderBy: { updatedAt: 'desc' },
        include: {
          student: { select: { id: true, fullName: true, email: true } },
          plan: { select: { id: true, name: true, priceInCents: true } },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { data, total, page, limit: take, hasMore: skip + take < total };
  }
}
