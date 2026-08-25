/**
 * Clave normalizada de un nombre de producto / necesidad.
 *
 * "Frazadas  de lana" → "frazadas de lana". Sin acentos, sin mayúsculas y sin
 * espacios de más: es la identidad con la que se agrupa el inventario y con la
 * que una meta de campaña se enlaza con lo que entra al almacén.
 */
export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Unidad de medida normalizada ("Kg " → "kg"). Vacío → "unidad". */
export function normalizeUnit(value?: string | null): string {
  const unit = (value ?? '').trim().toLowerCase();
  return unit || 'unidad';
}
