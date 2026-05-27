import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async send(studentId: string, type: NotificationType, title: string, body: string) {
    return this.prisma.notification.create({
      data: { studentId, type, title, body },
    });
  }

  async sendToMany(studentIds: string[], type: NotificationType, title: string, body: string) {
    if (studentIds.length === 0) return;
    await this.prisma.notification.createMany({
      data: studentIds.map((studentId) => ({ studentId, type, title, body })),
    });
  }

  async getUnread(studentId: string) {
    return this.prisma.notification.findMany({
      where: { studentId, read: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async markAsRead(id: string, studentId: string) {
    return this.prisma.notification.updateMany({
      where: { id, studentId },
      data: { read: true },
    });
  }
}
