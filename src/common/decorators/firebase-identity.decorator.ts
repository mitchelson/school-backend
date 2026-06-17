import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FirebaseIdentity } from '../guards/firebase-identity.guard';

export const CurrentFirebaseIdentity = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): FirebaseIdentity => {
    const request = ctx.switchToHttp().getRequest();
    return request.firebaseIdentity;
  },
);
