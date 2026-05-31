import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

export type RequestWithId = Request & {
  requestId?: string;
};

export function requestIdMiddleware(request: RequestWithId, response: Response, next: NextFunction) {
  const incoming = request.header('x-request-id')?.trim();
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();

  request.requestId = requestId;
  response.setHeader('x-request-id', requestId);
  next();
}
