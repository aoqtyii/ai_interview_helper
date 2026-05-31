import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AppModule } from './app.module';
import { IngestionService } from './modules/ingestion/ingestion.service';

const HEALTH_FILE = process.env.WORKER_HEALTH_FILE ?? '/tmp/aih-worker-health.json';

async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ingestion = app.get(IngestionService);
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });

  const worker = new Worker(
    'ingestion',
    async (job) => {
      if (job.name === 'run-feed' && job.data.feedId) return ingestion.runFeed(job.data.feedId);
      return ingestion.runAll();
    },
    { connection: connection as never }
  );

  worker.on('error', (error) => {
    console.error('Worker error', error);
  });

  await worker.waitUntilReady();
  writeWorkerHeartbeat();
  const heartbeat = setInterval(writeWorkerHeartbeat, 10_000);
  heartbeat.unref();

  async function shutdown() {
    clearInterval(heartbeat);
    await worker.close();
    await connection.quit();
    await app.close();
  }

  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0));
  });

  await ingestion.runAll().catch((error) => {
    console.error('Initial ingestion failed', error);
  });
}

function writeWorkerHeartbeat() {
  writeFileSync(HEALTH_FILE, JSON.stringify({ checkedAt: new Date().toISOString() }));
}

void bootstrapWorker().catch((error) => {
  console.error('Worker bootstrap failed', error);
  process.exit(1);
});
