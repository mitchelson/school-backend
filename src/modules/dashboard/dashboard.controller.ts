import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('dashboard')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('student')
  @Roles('aluno')
  getStudentDashboard(@CurrentUser('id') userId: string) {
    return this.dashboardService.getStudentDashboard(userId);
  }

  @Get('manager')
  @Roles('admin')
  getManagerDashboard() {
    return this.dashboardService.getManagerDashboard();
  }
}
