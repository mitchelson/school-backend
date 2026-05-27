import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { CreateStudentDto, UpdateStudentDto } from './dto/students.dto';

const SELECT_FIELDS = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  createdAt: true,
};

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.user.create({
      data: {
        firebaseUid: dto.firebaseUid,
        fullName: dto.fullName,
        email: dto.email,
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

  async deactivate(id: string) {
    await this.ensureExists(id);
    return this.prisma.user.update({
      where: { id },
      data: { status: 'inactive' },
      select: SELECT_FIELDS,
    });
  }

  async getMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: SELECT_FIELDS,
    });
  }

  async updateMe(userId: string, dto: UpdateStudentDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: SELECT_FIELDS,
    });
  }

  private async ensureExists(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id, role: 'aluno' } });
    if (!user) throw new NotFoundException('Aluno não encontrado');
  }
}
