import { randomUUID } from 'node:crypto';

export const PENDING_FIREBASE_UID_PREFIX = 'pending:';

export function createPendingFirebaseUid(): string {
  return `${PENDING_FIREBASE_UID_PREFIX}${randomUUID()}`;
}

export function isPendingFirebaseUid(uid: string | null | undefined): boolean {
  return Boolean(uid?.startsWith(PENDING_FIREBASE_UID_PREFIX));
}

/** UIDs do seed ou convites admin — podem ser vinculados no primeiro login real. */
export function isLinkablePlaceholderUid(uid: string | null | undefined): boolean {
  if (!uid) return false;
  return isPendingFirebaseUid(uid) || uid.endsWith('-placeholder');
}
