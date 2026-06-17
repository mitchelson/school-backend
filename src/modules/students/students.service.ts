import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateStudentDto, UpdateStudentDto } from './dto/students.dto';
import { createPendingFirebaseUid } from '../auth/pending-firebase-uid';

const SELECT_FIELDS = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  cpf: true,
  role: true,
  status: true,
  createdAt: true,
};

@Injectable()
export class StudentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(search?: string, page = 1, limit = 20) {
    const take = Math.min(limit, 100);
    const skip = (page - 1) * take;

    const where = {
      role: 'aluno' as const,
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: SELECT_FIELDS,
        skip,
        take,
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit: take, hasMore: skip + take < total };
  }

  async getById(id: string) {
    const student = await this.prisma.user.findUnique({
      where: { id, role: 'aluno' },
      select: {
        ...SELECT_FIELDS,
        subscription: { include: { plan: true } },
        tokenBalance: true,
      },
    });

    if (!student) throw new NotFoundException('Aluno não encontrado');
    return student;
  }

  async create(dto: CreateStudentDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email já cadastrado');
    }

    return this.prisma.user.create({
      data: {
        firebaseUid: createPendingFirebaseUid(),
        fullName: dto.fullName.trim(),
        email,
        phone: dto.phone,
        role: 'aluno',
      },
      select: SELECT_FIELDS,
    });
  }

  async update(id: string, dto: UpdateStudentDto) {
    await this.ensureExists(id);
    return this.prisma.user.update({
      where: { id },
      data: dto,
      select: SELECT_FIELDS,
    });
  }

  async deactivate(id: string, actor?: { id: string; role: Role }) {
    await this.ensureExists(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'inactive' },
      select: SELECT_FIELDS,
    });
    if (actor) {
      await this.audit.log({
        actorId: actor.id,
        actorRole: actor.role,
        action: 'student.deactivated',
        entityType: 'user',
        entityId: id,
        metadata: { email: user.email },
      });
    }
    return user;
  }

  async getMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: SELECT_FIELDS,
    });
  }

  async updateMe(userId: string, dto: UpdateStudentDto) {
    const data: { fullName?: string; phone?: string; cpf?: string | null } = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.cpf !== undefined) {
      data.cpf = dto.cpf.replace(/\D/g, '') || null;
    }
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: SELECT_FIELDS,
    });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id, role: 'aluno' } });
    if (!user) throw new NotFoundException('Aluno não encontrado');
  }
}
