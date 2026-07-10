import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Protege rutas de superadmin: exige un JWT con claim `superadmin: true`. */
@Injectable()
export class SuperadminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const auth: string | undefined = req.headers?.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Token de superadmin ausente');
    try {
      const payload = this.jwt.verify(token);
      if (!payload?.superadmin) {
        throw new UnauthorizedException('No autorizado');
      }
      return true;
    } catch {
      throw new UnauthorizedException('Token de superadmin inválido');
    }
  }
}
