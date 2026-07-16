import { randomBytes } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import { extname, isAbsolute, join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';

// Carpeta física donde se guardan las imágenes subidas. Configurable con
// UPLOAD_DIR (útil para montar un volumen persistente en producción).
export const UPLOAD_DIR = (() => {
  const configured = process.env.UPLOAD_DIR || 'uploads';
  const dir = isAbsolute(configured)
    ? configured
    : join(process.cwd(), configured);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
})();

// Prefijo público bajo el que se sirven los archivos (fuera del prefijo /api).
export const UPLOAD_PREFIX = '/uploads';

// URL base absoluta del backend. Necesaria porque la web (Next) y el app (Vite)
// corren en otro origen: una ruta relativa no resolvería a este servidor.
// En producción define PUBLIC_BASE_URL (p. ej. https://api.nosxotros.pe).
export const publicBaseUrl = () =>
  (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

// Multer expone el archivo con este shape; @types/multer no está instalado.
export interface UploadedImage {
  originalname: string;
  mimetype: string;
  size: number;
  filename: string;
  path: string;
}

export const imageMulterOptions = {
  storage: diskStorage({
    destination: UPLOAD_DIR,
    // Nombre aleatorio: nunca confiar en originalname (path traversal, colisiones).
    filename: (_req: unknown, file: UploadedImage, cb: (e: Error | null, name: string) => void) => {
      const ext = ALLOWED_MIME[file.mimetype] ?? extname(file.originalname).toLowerCase();
      cb(null, `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  fileFilter: (_req: unknown, file: UploadedImage, cb: (e: Error | null, ok: boolean) => void) => {
    if (!ALLOWED_MIME[file.mimetype]) {
      cb(new BadRequestException('Formato no permitido. Usa JPG, PNG, WEBP, GIF o AVIF.'), false);
      return;
    }
    cb(null, true);
  },
};
