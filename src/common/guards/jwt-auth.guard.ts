import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  private isPublic(context: ExecutionContext): boolean {
    return !!this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  canActivate(context: ExecutionContext) {
    // Always run passport; handleRequest decides whether to throw.
    // For public routes a valid token still populates request.user (optional auth).
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: any,
    user: any,
    _info: any,
    context: ExecutionContext,
  ): TUser {
    if (this.isPublic(context)) {
      return (user || undefined) as TUser;
    }
    if (err || !user) {
      throw err || new UnauthorizedException('Token inválido o ausente');
    }
    return user as TUser;
  }
}
