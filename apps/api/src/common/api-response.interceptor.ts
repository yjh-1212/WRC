import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { map, Observable } from 'rxjs';

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse();
    const requestId = response.req?.headers?.['x-request-id'] ?? randomUUID();
    response.setHeader('x-request-id', requestId);
    return next.handle().pipe(map((data) => ({ code: 0, message: 'success', data, timestamp: new Date().toISOString(), requestId })));
  }
}
