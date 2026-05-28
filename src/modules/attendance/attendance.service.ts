import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { getCheckinWindow } from '../classes/class-series.utils';

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

    const now = new Date();
    const { windowStart, windowEnd, isOpen } = getCheckinWindow(
      enrollment.classInstance.date,
      enrollment.classInstance.startTime,
      now,
    );

    if (!isOpen && now < windowStart) {
      throw new BadRequestException(
        `Check-in disponível a partir de ${windowStart.toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        })}`,
      );
    }

    if (!isOpen && now > windowEnd) {
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
}
