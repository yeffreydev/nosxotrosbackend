import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private strip<T extends { passwordHash?: string | null }>(u: T) {
    const { passwordHash, ...rest } = u as any;
    return rest;
  }

  async findAll(role?: Role) {
    const users = await this.prisma.user.findMany({
      where: role ? { role } : undefined,
      include: { volunteerProfile: true, organization: true },
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.strip(u));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { volunteerProfile: true, organization: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return this.strip(user);
  }

  async create(dto: CreateUserDto, creator: AuthUser) {
    // Solo un ADMIN puede crear otro ADMIN (evita escalada de privilegios).
    if (dto.role === Role.ADMIN && creator.role !== Role.ADMIN) {
      throw new ForbiddenException('No puedes crear usuarios ADMIN');
    }
    const passwordHash = dto.password
      ? await bcrypt.hash(dto.password, 10)
      : undefined;
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email.trim(),
          fullName: dto.fullName,
          phone: dto.phone?.trim() || undefined,
          role: dto.role,
          passwordHash,
          ...(dto.role === Role.VOLUNTEER
            ? { volunteerProfile: { create: {} } }
            : {}),
        },
      });
      return this.strip(user);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese correo o teléfono');
      }
      throw e;
    }
  }
}
