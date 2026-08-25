import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  calendarWeekday,
  nextCalendarDay,
  startOfCalendarDay,
  todayCalendarDay,
} from './date.util';

/** Tramo horario en el que un voluntario dijo que puede venir ese día. */
export interface AvailabilitySlot {
  id: string;
  startTime: string;
  endTime: string;
  note: string | null;
  /** true = viene de unos días fijos de la semana; false = de una fecha suelta. */
  recurring: boolean;
}

/**
 * "¿Con qué voluntarios cuento hoy?".
 *
 * Cruza la disponibilidad declarada con un día del calendario. Un voluntario
 * cuenta para ese día si tiene:
 *   - un horario puntual con esa fecha, o
 *   - unos días fijos de la semana que incluyen ese día, vigentes según
 *     validFrom/validTo.
 *
 * Vive en `common` porque lo usan tanto el tablero de voluntarios de la campaña
 * como el de metas: dos copias de esta cuenta acababan dando números distintos.
 */
@Injectable()
export class VolunteerAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Día del calendario pedido (por defecto hoy). Lanza 400 si la fecha no vale. */
  resolveDay(dateISO?: string): Date {
    if (!dateISO) return todayCalendarDay();
    const day = startOfCalendarDay(dateISO);
    if (!day) throw new BadRequestException('Fecha inválida');
    return day;
  }

  /** Tramos disponibles de cada voluntario ese día, ya ordenados por hora. */
  async slotsByVolunteer(
    volunteerIds: string[],
    day: Date,
  ): Promise<Map<string, AvailabilitySlot[]>> {
    const slots = new Map<string, AvailabilitySlot[]>();
    if (volunteerIds.length === 0) return slots;

    const end = nextCalendarDay(day);
    const schedules = await this.prisma.volunteerSchedule.findMany({
      where: {
        volunteerId: { in: volunteerIds },
        OR: [
          { date: { gte: day, lt: end } },
          { date: null, weekdays: { has: calendarWeekday(day) } },
        ],
      },
      orderBy: { startTime: 'asc' },
    });

    for (const s of schedules) {
      // Una recurrencia fuera de su vigencia no cuenta para este día.
      const vigente =
        s.date != null ||
        ((!s.validFrom || s.validFrom <= day) && (!s.validTo || s.validTo >= day));
      if (!vigente) continue;
      const list = slots.get(s.volunteerId) ?? [];
      list.push({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        note: s.note,
        recurring: s.date == null,
      });
      slots.set(s.volunteerId, list);
    }
    return slots;
  }

  /** Cuántos voluntarios de una campaña están disponibles ese día. */
  async countForCampaign(campaignId: string, dateISO?: string): Promise<number> {
    const enrollments = await this.prisma.campaignVolunteer.findMany({
      where: { campaignId, volunteerId: { not: null } },
      select: { volunteerId: true },
    });
    const ids = enrollments
      .map((e) => e.volunteerId)
      .filter((id): id is string => !!id);
    if (ids.length === 0) return 0;
    const slots = await this.slotsByVolunteer(ids, this.resolveDay(dateISO));
    return slots.size;
  }
}
