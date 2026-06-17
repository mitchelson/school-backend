import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FirebaseService } from '../../infrastructure/firebase/firebase.service';

export type FirebaseIdentity = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
};

@Injectable()
export class FirebaseIdentityGuard implements CanActivate {
  constructor(private firebase: FirebaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token não fornecido');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded: DecodedIdToken = await this.firebase.verifyToken(token);
      request.firebaseIdentity = this.toIdentity(decoded);
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  private toIdentity(decoded: DecodedIdToken): FirebaseIdentity {
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
      name: decoded.name ?? null,
      picture: decoded.picture ?? null,
    };
  }
}
