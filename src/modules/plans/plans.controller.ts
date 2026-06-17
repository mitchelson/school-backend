import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plans.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Role } from '@prisma/client';

@Controller('plans')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class PlansController {
  constructor(private plansService: PlansService) {}

  @Get()
  list(@CurrentUser('role') role: string) {
    return this.plansService.list(role === 'aluno');
  }

  @Post()
  @Roles('admin')
  create(
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: Role,
    @Body() dto: CreatePlanDto,
  ) {
    return this.plansService.create(dto, { id: actorId, role: actorRole });
  }

  @Patch(':id')
  @Roles('admin')
  update(
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: Role,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.plansService.update(id, dto, { id: actorId, role: actorRole });
  }
}
