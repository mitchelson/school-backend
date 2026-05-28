import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class TokenCryptoService {
  constructor(private config: ConfigService) {}

  encrypt(plain: string): string {
    const key = this.getKey();
    if (!key) return plain;

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  decrypt(stored: string | null | undefined): string | null {
    if (!stored) return null;
    if (!stored.startsWith('v1:')) return stored;

    const key = this.getKey();
    if (!key) return null;

    try {
      const [, ivB64, tagB64, dataB64] = stored.split(':');
      if (!ivB64 || !tagB64 || !dataB64) return null;

      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      const dec = Buffer.concat([
        decipher.update(Buffer.from(dataB64, 'base64')),
        decipher.final(),
      ]);
      return dec.toString('utf8');
    } catch {
      return null;
    }
  }

  private getKey(): Buffer | null {
    const raw = this.config.get<string>('PII_ENCRYPTION_KEY')?.trim();
    if (!raw || raw.length < 32) return null;
    return Buffer.from(raw.slice(0, 32));
  }
}
