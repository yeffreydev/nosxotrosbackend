import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthDto } from './dto/google-auth.dto';

@Injectable()
export class AuthService {
  private readonly googleClientId?: string;
  private readonly google: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    this.googleClientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    this.google = new OAuth2Client(this.googleClientId);
  }

  private sanitize<T extends { passwordHash?: string | null }>(user: T) {
    const { passwordHash, ...rest } = user as any;
    return rest;
  }

  private sign(user: User) {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('El email ya está registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const role = dto.role ?? Role.DONOR;

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash,
          fullName: dto.fullName,
          role,
          phone: dto.phone?.trim() || undefined,
          locale: dto.locale ?? 'es',
          ...(role === Role.VOLUNTEER
            ? { volunteerProfile: { create: {} } }
            : {}),
        },
        include: { volunteerProfile: true, organization: true },
      });
    } catch (err) {
      // El teléfono también es único: sin este mapeo el registro moría con un
      // 500 opaco y la persona no sabía qué dato cambiar.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const target = err.meta?.target;
        const fields = Array.isArray(target) ? target : [String(target ?? '')];
        throw new ConflictException(
          fields.includes('phone')
            ? 'Ese teléfono ya está registrado en otra cuenta'
            : 'El email ya está registrado',
        );
      }
      throw err;
    }

    await this.audit.log(user.id, 'register', 'User', user.id, { role });

    return {
      user: this.sanitize(user),
      accessToken: this.sign(user),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { volunteerProfile: true, organization: true },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas');
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Esta cuenta usa acceso con Google. Ingresa con Google.',
      );
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    await this.audit.log(user.id, 'login', 'User', user.id);

    return {
      user: this.sanitize(user),
      accessToken: this.sign(user),
    };
  }

  async googleLogin(dto: GoogleAuthDto) {
    if (!this.googleClientId) {
      throw new UnauthorizedException(
        'Acceso con Google no está configurado en el servidor.',
      );
    }

    let payload;
    try {
      const ticket = await this.google.verifyIdToken({
        idToken: dto.idToken,
        audience: this.googleClientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Token de Google inválido');
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Token de Google inválido');
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();

    // 1) por googleId (ya vinculado)  2) por email (vincular cuenta existente)
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
      include: { volunteerProfile: true, organization: true },
    });

    if (user) {
      if (!user.isActive) {
        throw new UnauthorizedException('Cuenta desactivada');
      }
      // vincular googleId / completar avatar la primera vez
      if (!user.googleId || (!user.avatarUrl && payload.picture)) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            googleId: user.googleId ?? googleId,
            avatarUrl: user.avatarUrl ?? payload.picture,
            emailVerified: user.emailVerified || !!payload.email_verified,
          },
          include: { volunteerProfile: true, organization: true },
        });
      }
      await this.audit.log(user.id, 'login_google', 'User', user.id);
    } else {
      const role = dto.role ?? Role.DONOR;
      user = await this.prisma.user.create({
        data: {
          email,
          googleId,
          fullName: payload.name ?? email.split('@')[0],
          avatarUrl: payload.picture,
          emailVerified: !!payload.email_verified,
          role,
          locale: 'es',
          ...(role === Role.VOLUNTEER
            ? { volunteerProfile: { create: {} } }
            : {}),
        },
        include: { volunteerProfile: true, organization: true },
      });
      await this.audit.log(user.id, 'register_google', 'User', user.id, {
        role,
      });
    }

    return {
      user: this.sanitize(user),
      accessToken: this.sign(user),
    };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { volunteerProfile: true, organization: true },
    });
    if (!user) throw new UnauthorizedException('Usuario no encontrado');
    return this.sanitize(user);
  }
}
