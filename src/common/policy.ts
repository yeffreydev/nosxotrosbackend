import { normalizeKey } from './text.util';

/**
 * Política de plataforma: NO se reciben medicamentos.
 *
 * Los fármacos exigen receta, cadena de frío y control sanitario que los
 * centros de acopio no pueden garantizar. Se bloquea en todas las puertas de
 * entrada: donaciones en especie, inventario de acopio, categorías y metas de
 * campaña. Los botiquines de primeros auxilios sí se aceptan.
 */
const MEDICINE_RE =
  /\b(medicament\w*|medicina\w*|farmaco\w*|farmacia\w*|pastilla\w*|jarabe\w*|antibiotic\w*|analgesic\w*|paracetamol|ibuprofeno|amoxicilina|aspirina)\b/;

export function isMedicineText(value?: string | null): boolean {
  if (!value) return false;
  return MEDICINE_RE.test(normalizeKey(value));
}

export const NO_MEDICINE_MSG =
  'No recibimos medicamentos: la plataforma no acepta fármacos ni en donaciones ni en el inventario de acopio.';
