import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import IORedis from 'ioredis';

const HEALTH_FILE = process.env.WORKER_HEALTH_FILE ?? '/tmp/aih-worker-health.json';
const MAX_HEARTBEAT_AGE_MS = Number(process.env.WORKER_HEALTH_MAX_AGE_MS ?? 30_000);

async function main() {
  assertFreshHeartbeat();

  const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    connectTimeout: 2_000,
    commandTimeout: 2_000,
    maxRetriesPerRequest: 0
  });
  const prisma = new PrismaClient();

  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error('Redis ping failed');
    await prisma.$queryRaw`SELECT 1`;
  } finally {
    await redis.quit().catch(() => redis.disconnect());
    await prisma.$disconnect();
  }
}

function assertFreshHeartbeat() {
  const payload = JSON.parse(readFileSync(HEALTH_FILE, 'utf8')) as { checkedAt?: string };
  if (!payload.checkedAt) throw new Error('Worker heartbeat is missing checkedAt');

  const ageMs = Date.now() - new Date(payload.checkedAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs > MAX_HEARTBEAT_AGE_MS) {
    throw new Error(`Worker heartbeat is stale: ${ageMs}ms`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
