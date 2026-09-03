import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const message = status === HttpStatus.INTERNAL_SERVER_ERROR
      ? '服务器内部错误'
      : typeof body === 'string' ? body : (body as any)?.message ?? '请求处理失败';
    const requestId = request.headers['x-request-id'] ?? randomUUID();
    if (status >= 500) this.logger.error(`[${requestId}] ${request.method} ${request.path}`, exception instanceof Error ? exception.stack : String(exception));
    response.status(status).json({ code: status, message: Array.isArray(message) ? message.join('；') : message, data: null, timestamp: new Date().toISOString(), requestId });
  }
}
