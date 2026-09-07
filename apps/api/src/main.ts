import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { ApiResponseInterceptor } from './common/api-response.interceptor';
import { RequestLogInterceptor } from './common/request-log.interceptor';
import { validationExceptionFactory } from './common/validation';

function serveWebApp(app: NestExpressApplication) {
  const webDist = join(__dirname, '..', '..', 'web', 'dist');
  const indexFile = join(webDist, 'index.html');
  if (!existsSync(indexFile)) return;
  app.useStaticAssets(webDist, { index: false });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/swagger')) return next();
    if (req.path.includes('.') && !req.path.endsWith('.html')) return next();
    res.sendFile(indexFile);
  });
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.use(helmet({
    // 高德按 Referer 校验域名；默认 no-referrer 会导致 INVALID_USER_DOMAIN
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-eval'",
          "'unsafe-inline'",
          'https://webapi.amap.com',
          'https://jsapi.amap.com',
          // JSAPI 2.0 loads WebGL/plugin bundles from this runtime CDN.
          'https://jsapi-service.amap.com',
          'https://restapi.amap.com',
        ],
        workerSrc: ["'self'", 'blob:'],
        childSrc: ["'self'", 'blob:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'", 'https:', 'wss:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        frameSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));
  const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173').split(',').map((item) => item.trim()).filter(Boolean);
  const renderOrigin = process.env.RENDER_EXTERNAL_URL?.trim();
  if (renderOrigin && !allowedOrigins.includes(renderOrigin)) allowedOrigins.push(renderOrigin);
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => callback(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    exceptionFactory: validationExceptionFactory,
  }));
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new RequestLogInterceptor(), new ApiResponseInterceptor());

  const config = new DocumentBuilder()
    .setTitle('无人快递车监管平台 API')
    .setDescription('覆盖认证与 RBAC、监管档案、准入审批、运行监管、安全监管及分析研判的统一接口。')
    .setVersion(process.env.APP_VERSION ?? '1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  SwaggerModule.setup('swagger', app, SwaggerModule.createDocument(app, config));
  serveWebApp(app);
  const port = Number(process.env.PORT ?? 8080);
  await app.listen(port, '0.0.0.0');
}
bootstrap();
