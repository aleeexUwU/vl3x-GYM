import { EJERCICIOS_ABDOMINALES, EJERCICIOS_GIMNASIO, getEjercicio } from "./exercises";
import { GRUPOS_GIMNASIO } from "./muscles";
import { fuerzaEstimada, seriesHechas, type ExerciseLog } from "./progression";
import type { MuscleGroup } from "./types";

/**
 * Sistema de rangos inspirado en Symmetry, pero contra TI MISMO (no hay datos de miles de
 * personas con máquinas a una mano): todo el mundo empieza en Hierro y sube mejorando
 * respecto a la primera vez.
 *  - Gimnasio: 1RM estimado (peso y reps, con reps en reserva) relativo al peso corporal
 *    con escala alométrica (peso^0,67, como en powerlifting): ganar fuerza sin engordar vale más.
 *  - Core: reps o segundos completados; cada variante más difícil vale un 50 % más.
 *  - Rendimiento MANTENIDO, no un día suelto: la media de tus 2 mejores sesiones entre las
 *    4 últimas. La puntuación no baja del 85 % de su máximo (un mal día o una temporada
 *    sin ir no te hunden).
 *  - Divisiones I, II y III en cada rango (Élite sin divisiones).
 *  - Músculo: media de sus ejercicios ponderada por las series que haces de cada uno.
 *    Zonas (pecho, espalda, hombros, brazos, piernas, core) y general = media de zonas,
 *    para premiar un físico equilibrado y no solo tu mejor ejercicio.
 */

export const RANGOS = ["Hierro", "Bronce", "Plata", "Oro", "Platino", "Diamante", "Élite"] as const;
export type Rango = (typeof RANGOS)[number];

/** Mejora necesaria (actual / primera vez) para cada rango. */
export const MEJORA = [1, 1.05, 1.15, 1.3, 1.5, 1.75, 2.1];
const DIVISIONES = ["I", "II", "III"] as const;
/** Exponente alométrico del peso corporal. */
const ALOMETRIA = 0.67;
/** La puntuación no baja de este porcentaje de su máximo. */
const SUELO = 0.85;

export interface Nivel {
  rango: Rango;
  indice: number;
  /** 0, 1 o 2 (I, II, III); null en Élite. */
  division: number | null;
  /** "Plata II" o "Élite". */
  nombre: string;
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
  const progreso = indice >= max ? 1 : p - indice;
  const division = indice >= max ? null : Math.min(2, Math.floor(progreso * 3 + 1e-9));
  const nombre = division == null ? RANGOS[indice] : `${RANGOS[indice]} ${DIVISIONES[division]}`;
  return { rango: RANGOS[indice], indice, division, nombre, puntuacion: p, progreso };
}

/** Nivel de un ejercicio: solo por cuánto ha mejorado el rendimiento. */
export function nivelEjercicio(mejora: number): Nivel {
  return nivelDe(enEscala(mejora, MEJORA));
}

/** Mejora necesaria para la siguiente división (o rango). */
export function mejoraSiguiente(n: Nivel): { nombre: string; mejora: number } | null {
  if (n.division == null) return null;
  const objetivo = n.indice + (n.division + 1) / 3;
  const sig = nivelDe(objetivo + 1e-6);
  const i = Math.floor(objetivo + 1e-9);
  const mejora = i >= MEJORA.length - 1 ? MEJORA[MEJORA.length - 1] : MEJORA[i] + (objetivo - i) * (MEJORA[i + 1] - MEJORA[i]);
  return { nombre: sig.nombre, mejora };
}

export interface RangoEjercicio extends Nivel {
  exerciseId: string;
  modulo: "gimnasio" | "abdominales";
  /** Rendimiento mantenido (1RM estimado en kg, o puntos de core). */
  fuerza: number;
  mejora: number;
  sesiones: number;
  /** Series hechas en total (peso del ejercicio en el rango del músculo). */
  series: number;
  /** Qué hacer para la siguiente división, en concreto. */
  objetivo: string | null;
}

export type Zona = "pecho" | "espalda" | "hombros" | "brazos" | "piernas" | "core";
export const ZONA_NOMBRE: Record<Zona, string> = {
  pecho: "Pecho",
  espalda: "Espalda",
  hombros: "Hombros",
  brazos: "Brazos",
  piernas: "Piernas",
  core: "Core",
};
const ZONA_DE: Record<MuscleGroup, Zona> = {
  pecho: "pecho",
  dorsal: "espalda",
  espalda_alta: "espalda",
  lumbar: "espalda",
  hombro_anterior: "hombros",
  hombro_lateral: "hombros",
  hombro_posterior: "hombros",
  biceps: "brazos",
  triceps: "brazos",
  antebrazo: "brazos",
  cuadriceps: "piernas",
  isquios: "piernas",
  gluteos: "piernas",
  aductores: "piernas",
  abductores: "piernas",
  gemelos: "piernas",
  core: "core",
};

export interface Rangos {
  ejercicios: RangoEjercicio[];
  musculos: Partial<Record<MuscleGroup, Nivel>>;
  zonas: Partial<Record<Zona, Nivel>>;
  general: Nivel | null;
}

/** Lo mínimo de una sesión de core para puntuarla. */
export interface SesionCore {
  fecha: string;
  items: { exerciseId: string; series: number; objetivo: number; hechas: number }[];
}

export interface OpcionesRangos {
  /** Solo lo hecho hasta esta fecha (para comparar antes/después). */
  hasta?: string;
  core?: SesionCore[];
  /** Registros de peso corporal (para la escala alométrica). */
  pesos?: { fecha: string; kg: number }[];
}

/** Ejercicio con el que empieza cada progresión de core (crunch → crunch brazos arriba → ...). */
function raizCore(id: string): { raiz: string; paso: number } {
  let raiz = id;
  let paso = 0;
  for (let i = 0; i < 10; i++) {
    const previo = EJERCICIOS_ABDOMINALES.find((e) => e.siguiente === raiz);
    if (!previo) break;
    raiz = previo.id;
    paso++;
  }
  return { raiz, paso };
}

interface Registro {
  fecha: string;
  valor: number;
  series: number;
}

/**
 * Rendimiento mantenido tras la última sesión: media de las 2 mejores de las 4 últimas,
 * con suelo del 85 % del máximo alcanzado. Devuelve el actual y la referencia (primera vez).
 */
function mantenido(regs: Registro[]): { actual: number; primera: number } {
  const orden = [...regs].sort((a, b) => a.fecha.localeCompare(b.fecha));
  // Varias entradas el mismo día cuentan como la mejor de ese día.
  const porDia = new Map<string, number>();
  for (const r of orden) porDia.set(r.fecha, Math.max(porDia.get(r.fecha) ?? 0, r.valor));
  const valores = [...porDia.values()];
  let maximo = 0;
  let actual = valores[0];
  for (let i = 0; i < valores.length; i++) {
    const ventana = valores.slice(Math.max(0, i - 3), i + 1).sort((a, b) => b - a);
    const m = ventana.length >= 2 ? (ventana[0] + ventana[1]) / 2 : ventana[0];
    maximo = Math.max(maximo, m);
    actual = Math.max(m, maximo * SUELO);
  }
  return { actual, primera: valores[0] };
}

/** Peso corporal en una fecha (el último registrado antes; si no hay, el primero). */
function pesoEn(pesos: { fecha: string; kg: number }[], fecha: string): number | null {
  if (!pesos.length) return null;
  let kg = pesos[0].kg;
  for (const p of pesos) if (p.fecha <= fecha) kg = p.kg;
  return kg;
}

const fmtKg = (kg: number) => `${String(Math.round(kg * 10) / 10).replace(".", ",")} kg`;

/** Gimnasio: rango de cada ejercicio con peso. */
function rangosGimnasio(logs: ExerciseLog[], opts: OpcionesRangos): RangoEjercicio[] {
  const pesos = [...(opts.pesos ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const porEjercicio = new Map<string, ExerciseLog[]>();
  for (const l of logs) {
    if (opts.hasta && l.fecha > opts.hasta) continue;
    if (fuerzaEstimada(l) <= 0 || !EJERCICIOS_GIMNASIO.some((e) => e.id === l.exerciseId)) continue;
    porEjercicio.set(l.exerciseId, [...(porEjercicio.get(l.exerciseId) ?? []), l]);
  }
  const out: RangoEjercicio[] = [];
  for (const [id, ls] of porEjercicio) {
    // Fuerza relativa: 1RM / peso^0,67 (sin pesos registrados, el 1RM tal cual).
    const relativa = (l: ExerciseLog) => {
      const bw = pesoEn(pesos, l.fecha);
      return bw ? fuerzaEstimada(l) / bw ** ALOMETRIA : fuerzaEstimada(l);
    };
    const regs = ls.map((l) => ({ fecha: l.fecha, valor: relativa(l), series: seriesHechas(l).length }));
    const { actual, primera } = mantenido(regs);
    const mejora = primera > 0 ? actual / primera : 1;
    const nivel = nivelEjercicio(mejora);
    const ultimo = [...ls].sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1)!;
    const bwHoy = pesoEn(pesos, ultimo.fecha);
    const escala = bwHoy ? bwHoy ** ALOMETRIA : 1;
    const sig = mejoraSiguiente(nivel);
    let objetivo: string | null = null;
    if (sig) {
      // 1RM que haría falta mantener (el rango usa la media de tus 2 mejores sesiones).
      const e1rmObjetivo = sig.mejora * primera * escala;
      const peso = Math.max(0, ...seriesHechas(ultimo).map((s) => s.pesoKg ?? 0));
      const tope = Math.max(getEjercicio(id)!.repsMax, 12);
      let reps = peso > 0 ? Math.ceil((e1rmObjetivo / peso - 1) * 30) : 0;
      let kg = peso;
      if (reps > tope || peso <= 0) {
        reps = 8;
        kg = Math.ceil(e1rmObjetivo / (1 + 8 / 30) / 2.5) * 2.5;
      }
      objetivo = `${sig.nombre}: 2 sesiones con ${fmtKg(kg)} × ${Math.max(1, reps)} reps (al fallo) o equivalente`;
    }
    out.push({
      exerciseId: id,
      modulo: "gimnasio",
      fuerza: actual * escala,
      mejora,
      sesiones: new Set(ls.map((l) => l.fecha)).size,
      series: regs.reduce((t, r) => t + r.series, 0),
      objetivo,
      ...nivel,
    });
  }
  return out;
}

/** Core: cada progresión (crunch → variantes) cuenta como un ejercicio. */
function rangosCore(sesiones: SesionCore[], hasta?: string): RangoEjercicio[] {
  const porRaiz = new Map<string, (Registro & { actual: string; paso: number })[]>();
  for (const s of sesiones) {
    if (hasta && s.fecha > hasta) continue;
    for (const it of s.items) {
      if (!it.hechas || !getEjercicio(it.exerciseId)) continue;
      const { raiz, paso } = raizCore(it.exerciseId);
      const valor = it.objetivo * 1.5 ** paso * Math.min(1, it.hechas / Math.max(1, it.series));
      porRaiz.set(raiz, [...(porRaiz.get(raiz) ?? []), { fecha: s.fecha, valor, series: it.hechas, actual: it.exerciseId, paso }]);
    }
  }
  const out: RangoEjercicio[] = [];
  for (const regs of porRaiz.values()) {
    const { actual, primera } = mantenido(regs);
    const mejora = primera > 0 ? actual / primera : 1;
    const nivel = nivelEjercicio(mejora);
    const ultimo = [...regs].sort((a, b) => a.fecha.localeCompare(b.fecha)).at(-1)!;
    const e = getEjercicio(ultimo.actual)!;
    const sig = mejoraSiguiente(nivel);
    const unidad = e.medida === "segundos" ? "s" : "reps";
    const objetivo = sig
      ? `${sig.nombre}: 2 sesiones con ${Math.ceil((sig.mejora * primera) / 1.5 ** ultimo.paso)} ${unidad} por serie (o una variante más difícil)`
      : null;
    out.push({
      exerciseId: ultimo.actual,
      modulo: "abdominales",
      fuerza: actual,
      mejora,
      sesiones: new Set(regs.map((r) => r.fecha)).size,
      series: regs.reduce((t, r) => t + r.series, 0),
      objetivo,
      ...nivel,
    });
  }
  return out;
}

/** Media de puntuaciones ponderada por series. */
function mediaPonderada(rs: RangoEjercicio[]): number {
  const peso = rs.reduce((t, r) => t + Math.max(1, r.series), 0);
  return rs.reduce((t, r) => t + r.puntuacion * Math.max(1, r.series), 0) / peso;
}

/** Rangos con todo el historial (o hasta una fecha, para comparar antes/después). */
export function calcularRangos(logs: ExerciseLog[], opts: OpcionesRangos = {}): Rangos {
  const gym = rangosGimnasio(logs, opts);
  const core = rangosCore(opts.core ?? [], opts.hasta);

  const musculos: Partial<Record<MuscleGroup, Nivel>> = {};
  for (const g of GRUPOS_GIMNASIO) {
    const delGrupo = gym.filter((r) => (getEjercicio(r.exerciseId)!.musculos[g] ?? 0) >= 1);
    if (delGrupo.length) musculos[g] = nivelDe(mediaPonderada(delGrupo));
  }
  if (core.length) musculos.core = nivelDe(mediaPonderada(core));

  const porZona = new Map<Zona, number[]>();
  for (const [g, n] of Object.entries(musculos)) {
    const z = ZONA_DE[g as MuscleGroup];
    porZona.set(z, [...(porZona.get(z) ?? []), n!.puntuacion]);
  }
  const zonas: Partial<Record<Zona, Nivel>> = {};
  for (const [z, ps] of porZona) zonas[z] = nivelDe(ps.reduce((s, p) => s + p, 0) / ps.length);
  const pz = Object.values(zonas).map((n) => n!.puntuacion);
  return {
    ejercicios: [...gym, ...core].sort((a, b) => b.puntuacion - a.puntuacion),
    musculos,
    zonas,
    general: pz.length ? nivelDe(pz.reduce((s, p) => s + p, 0) / pz.length) : null,
  };
}

export interface Subida {
  tipo: "ejercicio" | "musculo" | "zona" | "general";
  id: string;
  de: string | null;
  a: Nivel;
}

/** Posición de división (sube con cada I → II → III → siguiente rango). */
const escalon = (n: Nivel) => n.indice * 3 + (n.division ?? 0);

/** Qué ha subido de rango o división entre dos cálculos. Los nuevos en Hierro I no cuentan. */
export function subidas(antes: Rangos, despues: Rangos): Subida[] {
  const out: Subida[] = [];
  const comparar = (tipo: Subida["tipo"], id: string, a: Nivel | undefined, d: Nivel) => {
    if ((a && escalon(d) > escalon(a)) || (!a && escalon(d) > 0)) out.push({ tipo, id, de: a?.nombre ?? null, a: d });
  };
  for (const r of despues.ejercicios) comparar("ejercicio", r.exerciseId, antes.ejercicios.find((x) => x.exerciseId === r.exerciseId), r);
  for (const [g, n] of Object.entries(despues.musculos)) comparar("musculo", g, antes.musculos[g as MuscleGroup], n!);
  for (const [z, n] of Object.entries(despues.zonas)) comparar("zona", z, antes.zonas[z as Zona], n!);
  if (despues.general && antes.general) comparar("general", "general", antes.general, despues.general);
  return out;
}
