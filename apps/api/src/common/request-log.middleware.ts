import { NextFunction, Response } from 'express';
import { appLogger } from './logger';
import { RequestWithId } from './request-id.middleware';

export function requestLogMiddleware(request: RequestWithId, response: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();

  response.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    appLogger.info(
      {
        event: 'http_request',
        requestId: request.requestId ?? 'unknown',
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Math.round(durationMs)
      },
      'HTTP request completed'
    );
  });

  next();
}
