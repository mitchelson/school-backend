import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlatformSettingsService } from '../marketplace/platform-settings.service';
import { SplitCalculatorService } from '../marketplace/split-calculator.service';
import { AuditService } from '../audit/audit.service';
import { UpdatePlatformFeeDto } from './dto/platform-fee.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { Role, Prisma } from '@prisma/client';

@Controller('platform')
export class PlatformController {
  constructor(
    private settings: PlatformSettingsService,
    private splitCalc: SplitCalculatorService,
    private audit: AuditService,
  ) {}

  @Get('fee')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('owner')
  async getFee() {
    const totalFeePercent = await this.settings.getTotalFeePercent();
    const [mpFeePercentPix, mpFeePercentCard, mpFeePercentCardInstallments] =
      await Promise.all([
        this.settings.getMpFeePercentPix(),
        this.settings.getMpFeePercentCard(),
        this.settings.getMpFeePercentCardInstallments(),
      ]);

    return {
      totalFeePercent,
      sellerNetPercent: Math.max(0, 100 - totalFeePercent),
      platformFeePercent: totalFeePercent,
      mpFeePercentPix,
      mpFeePercentCard,
      mpFeePercentCardInstallments,
    };
  }

  @Get('fee/preview')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('owner')
  async previewFee(
    @Query('amountInCents') amountInCents = '10000',
    @Query('paymentMethod') paymentMethod: 'pix' | 'card' = 'pix',
  ) {
    const gross = Math.max(100, parseInt(amountInCents, 10) || 10000);
    const method = paymentMethod === 'card' ? 'card' : 'pix';
    return this.splitCalc.calculate(gross, method);
  }

  @Patch('fee')
  @UseGuards(FirebaseAuthGuard, RolesGuard)
  @Roles('owner')
  async updateFee(
    @CurrentUser('id') actorId: string,
    @CurrentUser('role') actorRole: Role,
    @Body() dto: UpdatePlatformFeeDto,
  ) {
    const hasAny =
      dto.platformFeePercent !== undefined ||
      dto.mpFeePercentPix !== undefined ||
      dto.mpFeePercentCard !== undefined ||
      dto.mpFeePercentCardInstallments !== undefined;

    if (!hasAny) {
      throw new BadRequestException('Informe ao menos um campo para atualizar.');
    }

    if (dto.platformFeePercent !== undefined) {
      await this.settings.setPlatformFeePercent(dto.platformFeePercent);
    }
    if (dto.mpFeePercentPix !== undefined) {
      await this.settings.setMpFeePercentPix(dto.mpFeePercentPix);
    }
    if (dto.mpFeePercentCard !== undefined) {
      await this.settings.setMpFeePercentCard(dto.mpFeePercentCard);
    }
    if (dto.mpFeePercentCardInstallments !== undefined) {
      await this.settings.setMpFeePercentCardInstallments(
        dto.mpFeePercentCardInstallments,
      );
    }

    await this.audit.log({
      actorId,
      actorRole: actorRole,
      action: 'platform.fee_updated',
      entityType: 'platform_setting',
      metadata: dto as Prisma.InputJsonValue,
    });

    return this.getFee();
  }
}
