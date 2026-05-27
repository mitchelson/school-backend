import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  async checkin(studentId: string, classInstanceId: string) {
    const enrollment = await this.prisma.classAttendance.findUnique({
      where: { studentId_classInstanceId: { studentId, classInstanceId } },
      include: { classInstance: true },
    });

    if (!enrollment || enrollment.status !== 'enrolled') {
      throw new BadRequestException('Você não está inscrito nesta aula');
    }

    if (enrollment.checkedInAt) {
      throw new ConflictException('Check-in já realizado');
    }

    // Validate check-in window: classStart - 30min to classStart + 15min
    const classStart = this.getClassDateTime(
      enrollment.classInstance.date,
      enrollment.classInstance.startTime,
    );
    const now = new Date();
    const windowStart = new Date(classStart.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(classStart.getTime() + 15 * 60 * 1000);

    if (now < windowStart) {
      throw new BadRequestException(
        `Check-in disponível a partir de ${windowStart.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
      );
    }

    if (now > windowEnd) {
      throw new BadRequestException('Janela de check-in encerrada');
    }

    return this.prisma.classAttendance.update({
      where: { id: enrollment.id },
      data: { status: 'confirmed', checkedInAt: now },
    });
  }

  async listByClass(classInstanceId: string) {
    return this.prisma.classAttendance.findMany({
      where: { classInstanceId, status: { not: 'cancelled' } },
      include: { student: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  private getClassDateTime(date: Date, startTime: string): Date {
    const [hours, minutes] = startTime.split(':').map(Number);
    const dt = new Date(date);
    dt.setHours(hours, minutes, 0, 0);
    return dt;
  }
}
