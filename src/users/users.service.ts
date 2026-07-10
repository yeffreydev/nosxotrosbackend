import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
}
