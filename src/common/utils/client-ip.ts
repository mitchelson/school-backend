import type { Request } from 'express';

export function resolveClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

export function isIpAllowed(clientIp: string, allowed: string[]): boolean {
  if (allowed.length === 0) return true;

  const normalized = normalizeIp(clientIp);
  return allowed.some((entry) => {
    const rule = entry.trim();
    if (!rule) return false;
    if (rule === normalized) return true;
    if (rule.endsWith('*')) {
      const prefix = rule.slice(0, -1);
      return normalized.startsWith(prefix);
    }
    return false;
  });
}

function normalizeIp(ip: string): string {
  return ip.replace(/^::ffff:/, '');
}
