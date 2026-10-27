import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';

export async function createApplication(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const allowedOrigins = (
    process.env.CORS_ORIGINS ??
    'http://localhost:8081,http://127.0.0.1:8081'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.useStaticAssets(resolve(process.cwd(), 'public'), { index: false });
  await app.init();
  return app;
}
