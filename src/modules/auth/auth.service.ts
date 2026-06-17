import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { FirebaseIdentity } from '../../common/guards/firebase-identity.guard';
import { RegisterDto } from './dto/register.dto';
import { EstablishSessionDto } from './dto/session.dto';
import { isLinkablePlaceholderUid } from './pending-firebase-uid';

const USER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  cpf: true,
  role: true,
  status: true,
  createdAt: true,
} as const;

export type AuthSessionResult = {
  user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    cpf: string | null;
    role: 'owner' | 'admin' | 'aluno';
    status: 'active' | 'inactive';
    createdAt: Date;
  };
  needsProfileCompletion: boolean;
};

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async establishSession(
    identity: FirebaseIdentity,
    dto: EstablishSessionDto = {},
  ): Promise<AuthSessionResult> {
    const email = this.resolveEmail(identity, dto.email);
    this.assertEmailVerifiedForSocial(identity);

    const existingByUid = await this.prisma.user.findUnique({
      where: { firebaseUid: identity.uid },
      select: USER_SELECT,
    });

    if (existingByUid) {
      this.assertActive(existingByUid.status);
      const updated = await this.maybePatchProfile(existingByUid.id, dto, existingByUid);
      return this.toSessionResult(updated);
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, firebaseUid: true, status: true },
    });

    if (existingByEmail) {
      if (existingByEmail.firebaseUid !== identity.uid) {
        if (isLinkablePlaceholderUid(existingByEmail.firebaseUid)) {
          this.assertActive(existingByEmail.status);
          const user = await this.prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              firebaseUid: identity.uid,
              ...(dto.fullName?.trim() ? { fullName: dto.fullName.trim() } : {}),
              ...(dto.phone ? { phone: dto.phone } : {}),
              ...(!dto.fullName?.trim() && identity.name?.trim()
                ? { fullName: identity.name.trim() }
                : {}),
            },
            select: USER_SELECT,
          });
          return this.toSessionResult(user);
        }
        throw new ConflictException(
          'Este email já está cadastrado com outro método de login. Use email e senha ou fale com a administração.',
        );
      }
      this.assertActive(existingByEmail.status);
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: existingByEmail.id },
        select: USER_SELECT,
      });
      return this.toSessionResult(user);
    }

    const fullName =
      dto.fullName?.trim() ||
      identity.name?.trim() ||
      email.split('@')[0] ||
      'Aluno';

    const user = await this.prisma.user.create({
      data: {
        firebaseUid: identity.uid,
        fullName,
        email,
        phone: dto.phone ?? null,
        role: 'aluno',
        status: 'active',
      },
      select: USER_SELECT,
    });

    return this.toSessionResult(user);
  }

  async register(identity: FirebaseIdentity, dto: RegisterDto): Promise<AuthSessionResult> {
    const email = dto.email.trim().toLowerCase();
    this.assertEmailMatchesIdentity(identity, email);

    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { firebaseUid: true, status: true },
    });

    if (existing) {
      if (existing.firebaseUid !== identity.uid) {
        if (isLinkablePlaceholderUid(existing.firebaseUid)) {
          this.assertActive(existing.status);
          const user = await this.prisma.user.update({
            where: { email },
            data: {
              firebaseUid: identity.uid,
              fullName: dto.fullName.trim(),
              phone: dto.phone,
            },
            select: USER_SELECT,
          });
          return this.toSessionResult(user);
        }
        throw new ConflictException('Email já cadastrado');
      }
      this.assertActive(existing.status);
      const user = await this.prisma.user.update({
        where: { email },
        data: {
          fullName: dto.fullName.trim(),
          phone: dto.phone,
        },
        select: USER_SELECT,
      });
      return this.toSessionResult(user);
    }

    const byUid = await this.prisma.user.findUnique({
      where: { firebaseUid: identity.uid },
      select: USER_SELECT,
    });
    if (byUid) {
      throw new ConflictException('Conta já cadastrada');
    }

    const user = await this.prisma.user.create({
      data: {
        firebaseUid: identity.uid,
        fullName: dto.fullName.trim(),
        email,
        phone: dto.phone,
        role: 'aluno',
        status: 'active',
      },
      select: USER_SELECT,
    });

    return this.toSessionResult(user);
  }

  async getMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: USER_SELECT,
    });
  }

  private resolveEmail(identity: FirebaseIdentity, dtoEmail?: string): string {
    const email = (dtoEmail ?? identity.email)?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException(
        'Email não disponível na conta. Conceda permissão de email ou use cadastro por senha.',
      );
    }
    return email;
  }

  private assertEmailMatchesIdentity(identity: FirebaseIdentity, email: string): void {
    const tokenEmail = identity.email?.trim().toLowerCase();
    if (!tokenEmail || tokenEmail !== email) {
      throw new BadRequestException('Email não corresponde à conta autenticada');
    }
  }

  private assertEmailVerifiedForSocial(identity: FirebaseIdentity): void {
    if (identity.email && !identity.emailVerified) {
      throw new BadRequestException('Confirme seu email antes de continuar');
    }
  }

  private assertActive(status: string): void {
    if (status !== 'active') {
      throw new UnauthorizedException('Conta inativa');
    }
  }

  private async maybePatchProfile(
    userId: string,
    dto: EstablishSessionDto,
    current: { fullName: string; phone: string | null },
  ) {
    const data: { fullName?: string; phone?: string } = {};
    if (dto.fullName?.trim() && dto.fullName.trim() !== current.fullName) {
      data.fullName = dto.fullName.trim();
    }
    if (dto.phone && !current.phone) {
      data.phone = dto.phone;
    }
    if (Object.keys(data).length === 0) {
      return this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: USER_SELECT,
      });
    }
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: USER_SELECT,
    });
  }

  private toSessionResult(user: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    cpf: string | null;
    role: 'owner' | 'admin' | 'aluno';
    status: 'active' | 'inactive';
    createdAt: Date;
  }): AuthSessionResult {
    return {
      user,
      needsProfileCompletion: !user.phone?.trim(),
    };
  }
}
