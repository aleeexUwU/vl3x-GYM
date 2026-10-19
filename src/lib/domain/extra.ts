import { getEjercicio } from "./exercises";
import { candidatos } from "./generator";
import type { FiltroEjercicios } from "./limitations";
import { GRUPOS_GIMNASIO, TREN_SUPERIOR } from "./muscles";
import type { Coverage, Exercise, MuscleGroup } from "./types";

/**
 * "Extra si no estás muy cansado" tras la sesión: un aislamiento de 2 series para el
 * músculo que más lo agradece esta semana (menos series respecto a su mínimo), sin
 * repetir lo de hoy y evitando los músculos ya muy trabajados hoy.
 */
export function elegirExtra(
  hoy: string[],
  cobertura: Coverage,
  minimos: Coverage,
  filtro: FiltroEjercicios,
  prioridadSuperior: boolean,
): { grupo: MuscleGroup; ejercicio: Exercise } | null {
  const hechoHoy = (g: MuscleGroup) => hoy.reduce((t, id) => t + (getEjercicio(id)?.musculos[g] ?? 0), 0);
  let mejor: { grupo: MuscleGroup; ejercicio: Exercise; puntuacion: number } | null = null;
  for (const g of GRUPOS_GIMNASIO) {
    const lista = candidatos(g, filtro).lista.filter((e) => !hoy.includes(e.id));
    // Mejor un aislamiento: cansa menos y se recupera antes.
    const e = lista.find((x) => !x.compuesto) ?? lista[0];
    if (!e) continue;
    const ratio = cobertura[g] / Math.max(1, minimos[g]);
    const sesgo = prioridadSuperior && TREN_SUPERIOR.includes(g) ? 0.3 : 0;
    const puntuacion = ratio + 0.15 * hechoHoy(g) - sesgo;
    if (!mejor || puntuacion < mejor.puntuacion) mejor = { grupo: g, ejercicio: e, puntuacion };
  }
  return mejor && { grupo: mejor.grupo, ejercicio: mejor.ejercicio };
}
