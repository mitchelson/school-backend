import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class CreditsService {
  constructor(private prisma: PrismaService) {}

  async getBalance(studentId: string) {
    const record = await this.prisma.studentTokenBalance.findUnique({
      where: { studentId },
    });
    return { balance: record?.balance ?? 0 };
  }

  async addCredits(studentId: string, quantity: number) {
    return this.prisma.studentTokenBalance.upsert({
      where: { studentId },
      update: { balance: { increment: quantity } },
      create: { studentId, balance: quantity },
    });
  }
}
