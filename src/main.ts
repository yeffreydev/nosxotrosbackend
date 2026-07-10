import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

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
          if (!origin || allowed.includes(origin)) cb(null, true);
          else cb(new Error(`Origen no permitido por CORS: ${origin}`), false);
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
  await app.listen(port);
}

bootstrap();
