import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { UPLOAD_DIR, UPLOAD_PREFIX } from './uploads/uploads.constants';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api');

  // Imágenes subidas: se sirven fuera del prefijo /api → GET /uploads/<archivo>.
  app.useStaticAssets(UPLOAD_DIR, {
    prefix: `${UPLOAD_PREFIX}/`,
    maxAge: '7d',
    index: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  // CORS_ORIGIN: lista separada por comas (web + frontend). Vacío o "*" = refleja
  // cualquier origen. Con credentials:true NO se puede usar "*" literal, hay que
  // reflejar el origen real de la petición.
  const allowed = (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowAny = allowed.length === 0 || allowed.includes('*');
  app.enableCors({
    origin: allowAny
      ? true
      : (origin, cb) => {
          // Sin origen (curl, apps móviles, same-origin) o en la lista → permitir.
          // Origen no listado: sin cabeceras CORS (el navegador lo bloquea) en
          // vez de lanzar un error que Express convierte en 500.
          cb(null, !origin || allowed.includes(origin));
        },
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('NOSXOTROS API')
    .setDescription('API del Ecosistema Social / ERP social de respuesta a emergencias (Arequipa)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  // En el VPS: HOST=127.0.0.1 → solo nginx llega a Node; el puerto no queda expuesto.
  await app.listen(port, process.env.HOST || '0.0.0.0');
}

bootstrap();
