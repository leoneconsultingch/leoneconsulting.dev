import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { VercelRequest } from '@vercel/node';

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
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
): Promise<{ limited: boolean; fallback: boolean }> {
  const client = getRedis();

  // No Redis configured: fail open (allow request, log warning)
  if (!client) {
    console.warn('Upstash Redis not configured — rate limiting disabled');
    return { limited: false, fallback: true };
  }

  if (!limiters.has(key)) {
    limiters.set(
      key,
      new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
        prefix: `rl:${key}`,
      }),
    );
  }

  const limiter = limiters.get(key)!;
  const { success } = await limiter.limit(identifier);
  return { limited: !success, fallback: false };
}
