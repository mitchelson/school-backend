import {
  Controller, Get, Post, Patch, Param, Body, Query, UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { CreateStudentDto, UpdateStudentDto, StudentQueryDto } from './dto/students.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('students')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Get()
  @Roles('admin')
  list(@Query() query: StudentQueryDto) {
    return this.studentsService.list(
      query.search,
      Number(query.page) || 1,
      Number(query.limit) || 20,
    );
  }

  @Get('me')
  getMe(@CurrentUser('id') userId: string) {
    return this.studentsService.getMe(userId);
  }

  @Patch('me')
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.updateMe(userId, dto);
  }

  @Get(':id')
  @Roles('admin')
  getById(@Param('id') id: string) {
    return this.studentsService.getById(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateStudentDto) {
    return this.studentsService.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles('admin')
  deactivate(@Param('id') id: string) {
    return this.studentsService.deactivate(id);
  }
}
