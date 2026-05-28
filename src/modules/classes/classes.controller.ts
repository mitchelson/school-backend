import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CancelClassDto, CreateClassDto, UpdateClassDto } from './dto/classes.dto';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('classes')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ClassesController {
  constructor(private classesService: ClassesService) {}

  @Get()
  list(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.classesService.list(
      Number(page) || 1,
      Number(limit) || 20,
      status,
      role === 'aluno' ? userId : undefined,
    );
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateClassDto) {
    return this.classesService.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateClassDto) {
    return this.classesService.update(id, dto);
  }

  @Patch(':id/cancel')
  @Roles('admin')
  cancel(@Param('id') id: string, @Body() dto: CancelClassDto) {
    return this.classesService.cancel(id, dto);
  }
}
