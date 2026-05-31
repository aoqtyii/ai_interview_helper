import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { RequestWithId } from './request-id.middleware';

type ErrorBody = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  requestId: string;
  timestamp: string;
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const statusCode = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = this.toBody(exception, statusCode, request);

    if (!(exception instanceof HttpException)) {
      console.error('Unhandled request error', {
        requestId: body.requestId,
        path: body.path,
        error: exception
      });
    }

    response.status(statusCode).json(body);
  }

  private toBody(exception: unknown, statusCode: number, request: RequestWithId): ErrorBody {
    const response = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = this.messageFromResponse(response);
    const error = this.errorFromResponse(response, statusCode);

    return {
      statusCode,
      error,
      message,
      path: request.originalUrl,
      requestId: request.requestId ?? 'unknown',
      timestamp: new Date().toISOString()
    };
  }

  private messageFromResponse(response: unknown) {
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object' && 'message' in response) {
      const message = (response as { message?: unknown }).message;
      if (Array.isArray(message) && message.every((item) => typeof item === 'string')) return message;
      if (typeof message === 'string') return message;
    }

    return 'Internal server error';
  }

  private errorFromResponse(response: unknown, statusCode: number) {
    if (response && typeof response === 'object' && 'error' in response) {
      const error = (response as { error?: unknown }).error;
      if (typeof error === 'string') return error;
    }

    return HttpStatus[statusCode] ?? 'Error';
  }
}
