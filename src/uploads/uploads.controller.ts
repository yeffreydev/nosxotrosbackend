import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  imageMulterOptions,
  publicBaseUrl,
  UPLOAD_PREFIX,
  UploadedImage,
} from './uploads.constants';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  // Subida de imágenes (portada de campaña, QR de pago, foto de avance).
  // Requiere sesión: sube cualquier usuario autenticado y luego usa la URL
  // devuelta en coverPhoto / qrImageUrl / photoUrl.
  @Post('image')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', imageMulterOptions))
  uploadImage(@UploadedFile() file?: UploadedImage) {
    return this.shape(file);
  }

  // Comprobante de una donación: lo sube el donante desde la web pública, que
  // por diseño no tiene cuenta. Mismos límites que el resto (imagen, 5 MB).
  @Public()
  @Post('receipt')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(FileInterceptor('file', imageMulterOptions))
  uploadReceipt(@UploadedFile() file?: UploadedImage) {
    return this.shape(file);
  }

  private shape(file?: UploadedImage) {
    if (!file) throw new BadRequestException('No se recibió ninguna imagen (campo "file").');
    return {
      filename: file.filename,
      mimetype: file.mimetype,
      size: file.size,
      url: `${publicBaseUrl()}${UPLOAD_PREFIX}/${file.filename}`,
    };
  }
}
