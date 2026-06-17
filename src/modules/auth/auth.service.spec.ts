import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { FirebaseIdentity } from '../../common/guards/firebase-identity.guard';

const identity: FirebaseIdentity = {
  uid: 'firebase-uid-1',
  email: 'aluno@example.com',
  emailVerified: true,
  name: 'Aluno Teste',
  picture: null,
};

const userRow = {
  id: 'user-1',
  fullName: 'Aluno Teste',
  email: 'aluno@example.com',
  phone: null,
  cpf: null,
  role: 'aluno' as const,
  status: 'active' as const,
  createdAt: new Date('2026-01-01'),
};

describe('AuthService', () => {
  let service: AuthService;
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(AuthService);
    jest.clearAllMocks();
  });

  it('creates aluno on first Google session', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.user.create.mockResolvedValue(userRow);

    const result = await service.establishSession(identity);

    expect(result.needsProfileCompletion).toBe(true);
    expect(result.user.email).toBe('aluno@example.com');
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firebaseUid: 'firebase-uid-1',
          role: 'aluno',
        }),
      }),
    );
  });

  it('returns existing user by firebase uid', async () => {
    const withPhone = { ...userRow, phone: '11999999999' };
    prisma.user.findUnique.mockResolvedValueOnce(withPhone);
    prisma.user.findUniqueOrThrow.mockResolvedValueOnce(withPhone);

    const result = await service.establishSession(identity);

    expect(result.needsProfileCompletion).toBe(false);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects email already linked to another firebase uid', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'other',
        firebaseUid: 'other-uid',
        status: 'active',
      });

    await expect(service.establishSession(identity)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('links pending invite when email matches', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'invited',
        firebaseUid: 'pending:abc',
        status: 'active',
      });
    prisma.user.update.mockResolvedValue({
      ...userRow,
      phone: '11999999999',
      firebaseUid: identity.uid,
    });

    const result = await service.establishSession(identity);

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'invited' },
        data: expect.objectContaining({ firebaseUid: identity.uid }),
      }),
    );
    expect(result.needsProfileCompletion).toBe(false);
  });

  it('register requires matching email in token', async () => {
    await expect(
      service.register(identity, {
        fullName: 'Aluno',
        email: 'outro@example.com',
        phone: '11999999999',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('register rejects inactive account', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      firebaseUid: 'firebase-uid-1',
      status: 'inactive',
    });

    await expect(
      service.register(identity, {
        fullName: 'Aluno',
        email: 'aluno@example.com',
        phone: '11999999999',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
