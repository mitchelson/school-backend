import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plans.dto';

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async list(activeOnly: boolean) {
    return this.prisma.plan.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { priceInCents: 'asc' },
    });
  }

  async create(dto: CreatePlanDto) {
    return this.prisma.plan.create({ data: dto });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.ensureExists(id);
    return this.prisma.plan.update({ where: { id }, data: dto });
  }

  private async ensureExists(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plano não encontrado');
  }
}
