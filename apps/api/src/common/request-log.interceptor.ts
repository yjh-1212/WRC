import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: { id?: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const supplied = request.headers['x-request-id'];
    const requestId = typeof supplied === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomUUID();
    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);
    const startedAt = Date.now();
    const write = (statusCode: number) => this.logger.log(JSON.stringify({
      requestId,
      method: request.method,
      path: request.path,
      statusCode,
      durationMs: Date.now() - startedAt,
      userId: request.user?.id ?? null,
    }));
    return next.handle().pipe(tap({ next: () => write(response.statusCode), error: (error) => write(typeof error?.getStatus === 'function' ? error.getStatus() : 500) }));
  }
}
