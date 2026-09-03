import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('运行状态')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: '服务与数据库健康检查' })
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'up',
        version: process.env.APP_VERSION ?? '1.0.0',
        uptimeSeconds: Math.floor(process.uptime()),
      };
    } catch {
      throw new ServiceUnavailableException('数据库连接异常');
    }
  }
}
