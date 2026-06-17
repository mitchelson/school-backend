import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plans.dto';
import { MpSellerService } from '../marketplace/mp-seller.service';

@Injectable()
export class PlansService {
  constructor(
    private prisma: PrismaService,
    private mpSeller: MpSellerService,
    private audit: AuditService,
  ) {}

  async list(activeOnly: boolean) {
    return this.prisma.plan.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { priceInCents: 'asc' },
    });
  }

  async create(dto: CreatePlanDto, actor?: { id: string; role: Role }) {
    await this.mpSeller.requireMpConnected();
    const plan = await this.prisma.plan.create({ data: dto });
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'plan.created',
        entityType: 'plan',
        entityId: plan.id,
        metadata: { name: plan.name, priceInCents: plan.priceInCents },
      });
    }
    return plan;
  }

  async update(id: string, dto: UpdatePlanDto, actor?: { id: string; role: Role }) {
    await this.ensureExists(id);
    const plan = await this.prisma.plan.update({ where: { id }, data: dto });
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'plan.updated',
        entityType: 'plan',
        entityId: id,
        metadata: dto as Prisma.InputJsonValue,
      });
    }
    return plan;
  }

  private async ensureExists(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plano não encontrado');
  }
}
