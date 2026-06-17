import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OwnerService } from './owner.service';
import {
  OwnerListQueryDto,
  OwnerUsersQueryDto,
  UpdateUserRoleDto,
} from './dto/owner.dto';
import { OwnerInboxQueryDto, SendOwnerEmailDto } from './dto/owner-email.dto';
import { ResendEmailService } from '../../infrastructure/email/resend-email.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('owner')
@UseGuards(FirebaseAuthGuard, RolesGuard)
@Roles('owner')
export class OwnerController {
  constructor(
    private ownerService: OwnerService,
    private emailService: ResendEmailService,
  ) {}

  @Get('summary')
  summary() {
    return this.ownerService.getSummary();
  }

  @Get('users')
  listUsers(@Query() query: OwnerUsersQueryDto) {
    return this.ownerService.listUsers(
      query.search,
      query.role,
      Number(query.page) || 1,
      Number(query.limit) || 30,
    );
  }

  @Patch('users/:id/role')
  updateUserRole(
    @CurrentUser('id') actorId: string,
    @Param('id') userId: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.ownerService.updateUserRole(actorId, userId, dto.role);
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: OwnerListQueryDto) {
    return this.ownerService.listAuditLogs(
      Number(query.page) || 1,
      Number(query.limit) || 50,
    );
  }

  @Get('mp-accounts')
  listMpAccounts() {
    return this.ownerService.listMpAccounts();
  }

  @Get('payments')
  listPayments(@Query() query: OwnerListQueryDto) {
    return this.ownerService.listPayments(
      Number(query.page) || 1,
      Number(query.limit) || 30,
      query.status,
    );
  }

  @Get('plans')
  listPlans() {
    return this.ownerService.listPlans();
  }

  @Get('classes')
  listClasses(@Query() query: OwnerListQueryDto) {
    return this.ownerService.listClasses(
      Number(query.page) || 1,
      Number(query.limit) || 30,
      query.status,
    );
  }

  @Get('enrollments')
  listEnrollments(@Query() query: OwnerListQueryDto) {
    return this.ownerService.listEnrollments(
      Number(query.page) || 1,
      Number(query.limit) || 30,
    );
  }

  @Get('subscriptions')
  listSubscriptions(@Query() query: OwnerListQueryDto) {
    return this.ownerService.listSubscriptions(
      Number(query.page) || 1,
      Number(query.limit) || 30,
      query.status,
    );
  }

  @Get('email/config')
  emailConfig() {
    return this.emailService.getOwnerConfig();
  }

  @Post('email/send')
  sendEmail(@Body() dto: SendOwnerEmailDto) {
    return this.emailService.sendCustomEmail(dto);
  }

  @Get('email/inbox')
  listInbox(@Query() query: OwnerInboxQueryDto) {
    return this.emailService.listReceivedEmails(Number(query.limit) || 30);
  }

  @Get('email/inbox/:id')
  getInboxEmail(@Param('id') id: string) {
    return this.emailService.getReceivedEmail(id);
  }
}
