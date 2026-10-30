import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { VercelRequest, VercelResponse } from '@vercel/node';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Invalid rate-limit configuration');
  }
  if (redis) return redis;
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    retry: false,
    signal: () => AbortSignal.timeout(2000),
  });
  return redis;
}

export function getClientIp(req: VercelRequest): string {
  // x-real-ip is set by Vercel's edge and cannot be spoofed by clients
  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') return realIp;

  // fallback: take the rightmost IP in x-forwarded-for (last trusted proxy)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',');
    return ips[ips.length - 1].trim();
  }

  return req.socket?.remoteAddress ?? 'unknown';
}

const limiters = new Map<string, Ratelimit>();

export async function checkRateLimit(
  identifier: string,
  key: string,
  requests: number,
  windowSeconds: number,
): Promise<{ limited: boolean; unavailable: boolean }> {
  try {
    const client = getRedis();

    if (!client) throw new Error('Rate-limit configuration missing');

    if (!limiters.has(key)) {
      limiters.set(
        key,
        new Ratelimit({
          redis: client,
          limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
          prefix: `rl:${key}`,
          timeout: 2000,
          ephemeralCache: false,
        }),
      );
    }

    const limiter = limiters.get(key)!;
    const { success, reason } = await limiter.limit(identifier);
    // The SDK returns success:true on timeout; that must never authorize email.
    if (reason === 'timeout') throw new Error('Rate-limit timeout');
    return { limited: !success, unavailable: false };
  } catch {
    console.error('Email rate-limit service unavailable', { endpoint: key });
    return { limited: false, unavailable: true };
  }
}

export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  key: string,
  requests: number,
  windowSeconds: number,
): Promise<boolean> {
  const result = await checkRateLimit(getClientIp(req), key, requests, windowSeconds);
  if (result.unavailable) {
    res.setHeader('Retry-After', '60');
    res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
    return false;
  }
  if (result.limited) {
    res.setHeader('Retry-After', String(windowSeconds));
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return false;
  }
  return true;
}
