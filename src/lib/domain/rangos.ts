import { EJERCICIOS_GIMNASIO } from "./exercises";
import { GRUPOS_GIMNASIO } from "./muscles";
import { fuerzaEstimada, type ExerciseLog } from "./progression";
import type { MuscleGroup } from "./types";

/**
 * Sistema de rangos (idea de apps como Symmetry), basado en TU progreso: todo el mundo
 * empieza en Hierro y se sube con dos cosas a la vez, para que cuente la constancia y no
 * un día bueno:
 *  - mejora de fuerza en el ejercicio (1RM estimado, con reps en reserva) desde la primera
 *    sesión;
 *  - número de sesiones con ese ejercicio.
 * No compara con pesos "estándar": las máquinas y poleas cambian mucho entre gimnasios.
 * Cada músculo toma el mejor rango de sus ejercicios; el general es la media.
 */

export const RANGOS = ["Hierro", "Bronce", "Plata", "Oro", "Platino", "Diamante", "Élite"] as const;
export type Rango = (typeof RANGOS)[number];

/** Mejora de fuerza (actual / primera) necesaria para cada rango. */
const MEJORA = [1, 1.05, 1.15, 1.3, 1.5, 1.75, 2.1];
/** Sesiones con el ejercicio necesarias para cada rango. */
const SESIONES = [0, 2, 4, 7, 11, 16, 24];

export interface Nivel {
  rango: Rango;
  indice: number;
  /** Nivel continuo (p. ej. 2,4 = Plata y 40 % hacia Oro). */
  puntuacion: number;
  /** 0–1: progreso hasta el siguiente rango (1 en Élite). */
  progreso: number;
}

/** Posición continua de un valor en una escala de umbrales (0 = primer rango). */
function enEscala(valor: number, escala: number[]): number {
  for (let i = escala.length - 1; i >= 0; i--) {
    if (valor >= escala[i]) {
      if (i === escala.length - 1) return i;
      return i + (valor - escala[i]) / (escala[i + 1] - escala[i]);
    }
  }
  return 0;
}

export function nivelDe(puntuacion: number): Nivel {
  const max = RANGOS.length - 1;
  const p = Math.max(0, Math.min(max, puntuacion));
  const indice = Math.floor(p + 1e-9);
  return { rango: RANGOS[indice], indice, puntuacion: p, progreso: indice >= max ? 1 : p - indice };
}

/** Nivel de un ejercicio: el menor entre lo que da la mejora y lo que dan las sesiones. */
export function nivelEjercicio(mejora: number, sesiones: number): Nivel {
  return nivelDe(Math.min(enEscala(mejora, MEJORA), enEscala(sesiones, SESIONES)));
}

/** Qué falta para el siguiente rango (texto corto para la interfaz). */
export function requisitoSiguiente(n: Nivel, mejora: number, sesiones: number): string | null {
  const sig = n.indice + 1;
  if (sig >= RANGOS.length) return null;
  const faltas: string[] = [];
  if (mejora < MEJORA[sig]) faltas.push(`+${Math.round((MEJORA[sig] - 1) * 100)} % de fuerza (llevas +${Math.round((mejora - 1) * 100)} %)`);
  if (sesiones < SESIONES[sig]) faltas.push(`${SESIONES[sig]} sesiones (llevas ${sesiones})`);
  return faltas.length ? `${RANGOS[sig]}: ${faltas.join(" y ")}` : null;
}

export interface RangoEjercicio extends Nivel {
  exerciseId: string;
  fuerza: number;
  mejora: number;
  sesiones: number;
}

export interface Rangos {
  ejercicios: RangoEjercicio[];
  musculos: Partial<Record<MuscleGroup, Nivel>>;
  general: Nivel | null;
}

/** Rangos con todo el historial (o hasta una fecha, para comparar antes/después). */
export function calcularRangos(logs: ExerciseLog[], hasta?: string): Rangos {
  const porEjercicio = new Map<string, ExerciseLog[]>();
  for (const l of logs) {
    if (hasta && l.fecha > hasta) continue;
    if (fuerzaEstimada(l) <= 0) continue;
    porEjercicio.set(l.exerciseId, [...(porEjercicio.get(l.exerciseId) ?? []), l]);
  }
  const ejercicios: RangoEjercicio[] = [];
  for (const [id, ls] of porEjercicio) {
    if (!EJERCICIOS_GIMNASIO.some((e) => e.id === id)) continue;
    const orden = [...ls].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const primera = fuerzaEstimada(orden[0]);
    const fuerza = Math.max(...orden.map(fuerzaEstimada));
    const mejora = primera > 0 ? fuerza / primera : 1;
    const sesiones = new Set(orden.map((l) => l.fecha)).size;
    ejercicios.push({ exerciseId: id, fuerza, mejora, sesiones, ...nivelEjercicio(mejora, sesiones) });
  }
  const musculos: Partial<Record<MuscleGroup, Nivel>> = {};
  for (const g of GRUPOS_GIMNASIO) {
    const delGrupo = ejercicios.filter((r) => (EJERCICIOS_GIMNASIO.find((e) => e.id === r.exerciseId)!.musculos[g] ?? 0) >= 1);
    if (!delGrupo.length) continue;
    musculos[g] = nivelDe(Math.max(...delGrupo.map((r) => r.puntuacion)));
  }
  const ps = Object.values(musculos).map((n) => n!.puntuacion);
  return {
    ejercicios: ejercicios.sort((a, b) => b.puntuacion - a.puntuacion),
    musculos,
    general: ps.length ? nivelDe(ps.reduce((s, p) => s + p, 0) / ps.length) : null,
  };
}

export interface Subida {
  tipo: "ejercicio" | "musculo" | "general";
  id: string;
  de: Rango | null;
  a: Rango;
}

/** Qué ha subido de rango entre dos cálculos (para el resumen de la sesión). Los nuevos en Hierro no cuentan. */
export function subidas(antes: Rangos, despues: Rangos): Subida[] {
  const out: Subida[] = [];
  for (const r of despues.ejercicios) {
    const a = antes.ejercicios.find((x) => x.exerciseId === r.exerciseId);
    if ((a && r.indice > a.indice) || (!a && r.indice > 0)) out.push({ tipo: "ejercicio", id: r.exerciseId, de: a?.rango ?? null, a: r.rango });
  }
  for (const [g, n] of Object.entries(despues.musculos)) {
    const a = antes.musculos[g as MuscleGroup];
    if ((a && n!.indice > a.indice) || (!a && n!.indice > 0)) out.push({ tipo: "musculo", id: g, de: a?.rango ?? null, a: n!.rango });
  }
  if (despues.general && antes.general && despues.general.indice > antes.general.indice) {
    out.push({ tipo: "general", id: "general", de: antes.general.rango, a: despues.general.rango });
  }
  return out;
}
