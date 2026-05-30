import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { AppModule } from './app.module';
import { IngestionService } from './modules/ingestion/ingestion.service';

async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const ingestion = app.get(IngestionService);
  const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });

  new Worker(
    'ingestion',
    async (job) => {
      if (job.name === 'run-feed' && job.data.feedId) return ingestion.runFeed(job.data.feedId);
      return ingestion.runAll();
    },
    { connection: connection as never }
  );

  await ingestion.runAll().catch((error) => {
    console.error('Initial ingestion failed', error);
  });
}

void bootstrapWorker();
