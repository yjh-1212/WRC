import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { foreignKeyMessage, uniqueConflictMessage } from './validation';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const request = host.switchToHttp().getRequest();
    const mapped = this.mapException(exception);
    const requestId = request.headers['x-request-id'] ?? randomUUID();
    if (mapped.status >= 500) this.logger.error(`[${requestId}] ${request.method} ${request.path}`, exception instanceof Error ? exception.stack : String(exception));
    response.status(mapped.status).json({
      code: mapped.status,
      message: mapped.message,
      data: null,
      timestamp: new Date().toISOString(),
      requestId,
    });
  }

  private mapException(exception: unknown): { status: number; message: string } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const raw = typeof body === 'string' ? body : (body as { message?: string | string[] })?.message;
      const message = Array.isArray(raw) ? raw.join('；') : raw;
      return { status, message: message || exception.message || '请求处理失败' };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') return { status: HttpStatus.CONFLICT, message: uniqueConflictMessage(exception.meta?.target) };
      if (exception.code === 'P2003') return { status: HttpStatus.BAD_REQUEST, message: foreignKeyMessage(exception.meta?.field_name ?? exception.meta?.constraint) };
      if (exception.code === 'P2025') return { status: HttpStatus.NOT_FOUND, message: '记录不存在或已删除' };
      if (exception.code === 'P2000') return { status: HttpStatus.BAD_REQUEST, message: '有字段内容过长，请缩短后再提交' };
      if (exception.code === 'P2011') return { status: HttpStatus.BAD_REQUEST, message: '有必填字段未填写' };
      if (exception.code === 'P2014') return { status: HttpStatus.BAD_REQUEST, message: '存在关联数据，当前操作无法完成' };
      return { status: HttpStatus.BAD_REQUEST, message: '数据保存失败，请检查填写内容' };
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return { status: HttpStatus.BAD_REQUEST, message: '数据格式不正确，请检查填写内容' };
    }
    if (exception instanceof SyntaxError) {
      return { status: HttpStatus.BAD_REQUEST, message: '请求内容格式不正确，请检查后再提交' };
    }
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: '服务器内部错误' };
  }
}
