/**
 * Días del calendario, no instantes.
 *
 * La disponibilidad de un voluntario se declara por día ("el sábado 12", "los
 * martes de 8 a 13"), no por un momento exacto. Mezclar las dos cosas rompe la
 * pregunta "¿con qué voluntarios cuento hoy?": `new Date('2026-08-04')` es
 * medianoche UTC, y leída en hora de Perú (UTC-5) cae el 3 de agosto, así que
 * "los martes" se convertía en "los lunes".
 *
 * Regla única: un día del calendario se representa siempre como medianoche UTC
 * de la fecha escrita, y su día de la semana se saca en UTC.
 */

const DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Medianoche UTC del día del calendario que representa `value`.
 *
 * Acepta "2026-07-28" y también un ISO completo, del que toma la fecha tal como
 * viene escrita ("2026-07-28T15:30:00Z" → 2026-07-28). Devuelve null si no es
 * una fecha reconocible, para que quien llame responda un 400 claro.
 */
export function startOfCalendarDay(value: string | Date): Date | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }
  const match = DATE_PREFIX.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(day.getTime()) ? null : day;
}

/** Hoy como día del calendario, según la hora local del servidor (Arequipa). */
export function todayCalendarDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** El día siguiente: cierra el rango [día, siguiente) de una consulta. */
export function nextCalendarDay(day: Date): Date {
  const next = new Date(day);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Día de la semana de un día del calendario: 0=domingo … 6=sábado. */
export function calendarWeekday(day: Date): number {
  return day.getUTCDay();
}
