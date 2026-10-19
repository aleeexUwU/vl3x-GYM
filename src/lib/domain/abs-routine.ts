import { diasEntre, sumarDias } from "./dates";
import { ejercicio } from "./exercises";
import { ejercicioPermitido, type FiltroEjercicios } from "./limitations";
import { coberturaVacia } from "./muscles";
import type { CoreCategory, Coverage, Exercise } from "./types";

export const CATEGORIAS_CORE: CoreCategory[] = ["recto", "oblicuos", "transverso", "lumbar"];

export const CATEGORIA_NOMBRE: Record<CoreCategory, string> = {
  recto: "Recto abdominal",
  oblicuos: "Oblicuos",
  transverso: "Transverso / estabilidad",
  lumbar: "Zona lumbar",
};

export interface AbsItem {
  exerciseId: string;
  categoria: CoreCategory;
  series: number;
  /** Reps o segundos por serie, según `medida`. */
  objetivo: number;
  medida: Exercise["medida"];
  descansoSeg: number;
  /** Nivel dentro de la cadena de progresión (0 = variante base). */
  nivel: number;
}

/** Lo que se hizo de un ejercicio en una sesión de core (para adaptar la siguiente). */
export interface RegistroCore {
  fecha: string;
  exerciseId: string;
  series: number;
  objetivo: number;
  hechas: number;
  /** Reps o segundos reales de cada serie (si se anotaron). */
  reales?: number[];
}

/** Sesiones anteriores, tal como se guardan (solo lo necesario). */
export interface SesionCoreHistorial {
  fecha: string;
  items: Omit<RegistroCore, "fecha">[];
}

export interface AbsRoutine {
  fecha: string;
  semana: number;
  items: AbsItem[];
  duracionEstimadaMin: number;
}


/** Semanas que tarda una variante en llegar a su tope (reps o segundos máximos). */
function semanasHastaTope(e: Exercise): number {
  const inc = e.incrementoSemanal ?? 2;
  return Math.ceil((e.repsMax - e.repsMin) / inc);
}

/**
 * Progresión semanal: +reps/+segundos cada semana; al llegar al tope pasa a la
 * variante más difícil (si la hay y está permitida) empezando por su base.
 */
export function resolverProgresion(
  base: Exercise,
  semanas: number,
  permitido: (e: Exercise) => boolean = () => true,
): { ejercicio: Exercise; objetivo: number; nivel: number } {
  let e = base;
  let w = Math.max(0, semanas);
  let nivel = 0;
  for (;;) {
    const tope = semanasHastaTope(e);
    const sig = e.siguiente ? ejercicio(e.siguiente) : undefined;
    if (w <= tope || !sig || !permitido(sig)) {
      const objetivo = Math.min(e.repsMax, e.repsMin + (e.incrementoSemanal ?? 2) * w);
      return { ejercicio: e, objetivo, nivel };
    }
    w -= tope + 1;
    e = sig;
    nivel += 1;
  }
}

function tiempoSerieSeg(item: Pick<AbsItem, "medida" | "objetivo">): number {
  return item.medida === "segundos" ? item.objetivo : item.objetivo * 2.5;
}

/** Variantes de una progresión desde un ejercicio base (crunch → brazos arriba → encogido). */
function cadena(base: Exercise): Exercise[] {
  const out = [base];
  while (out.length < 10 && out[out.length - 1].siguiente) out.push(ejercicio(out[out.length - 1].siguiente!));
  return out;
}

/** Cómo salió un registro: completo (todas las series al objetivo) y % de lo pedido. */
function resultado(r: RegistroCore): { completo: boolean; ratio: number; minimo: number } {
  const reales = r.reales?.length
    ? r.reales.slice(0, r.series)
    : Array.from({ length: r.series }, (_, i) => (i < r.hechas ? r.objetivo : 0));
  while (reales.length < r.series) reales.push(0);
  const hecho = reales.reduce((t, v) => t + Math.min(v, r.objetivo), 0);
  return { completo: reales.every((v) => v >= r.objetivo), ratio: hecho / (r.objetivo * r.series), minimo: Math.min(...reales) };
}

/**
 * Progresión según lo que HICISTE (como en el gimnasio), no según el calendario:
 *  - todas las series al objetivo → sube (+2 reps / +5 s; si te sobró mucho, salta a lo que hiciste);
 *  - te faltó poco (≥ 80 %) → repite;
 *  - fallo claro dos veces seguidas → baja un paso (y, si ya estabas abajo, vuelve a la variante anterior);
 *  - en el tope, 2 sesiones seguidas completas → pasa a la variante más difícil.
 */
export function progresionAdaptativa(
  base: Exercise,
  registros: RegistroCore[],
  permitido: (e: Exercise) => boolean = () => true,
): { ejercicio: Exercise; objetivo: number; nivel: number } | null {
  const vars = cadena(base);
  const propios = registros
    .filter((r) => vars.some((v) => v.id === r.exerciseId) && r.hechas > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const ultimo = propios.at(-1);
  if (!ultimo) return null;
  const nivel = vars.findIndex((v) => v.id === ultimo.exerciseId);
  const e = vars[nivel];
  const inc = e.incrementoSemanal ?? (e.medida === "segundos" ? 5 : 2);
  const res = resultado(ultimo);
  const anterior = propios.at(-2);
  const resAnt = anterior && anterior.exerciseId === e.id ? resultado(anterior) : null;

  if (res.completo) {
    if (ultimo.objetivo >= e.repsMax) {
      const sig = vars[nivel + 1];
      const dosEnTope = resAnt?.completo && anterior!.objetivo >= e.repsMax;
      if (sig && permitido(sig) && dosEnTope) return { ejercicio: sig, objetivo: sig.repsMin, nivel: nivel + 1 };
      return { ejercicio: e, objetivo: e.repsMax, nivel };
    }
    return { ejercicio: e, objetivo: Math.min(e.repsMax, Math.max(ultimo.objetivo + inc, res.minimo)), nivel };
  }
  if (res.ratio >= 0.8 || !resAnt || resAnt.ratio >= 0.8) return { ejercicio: e, objetivo: ultimo.objetivo, nivel };
  // Fallo claro dos veces: un paso atrás.
  const bajado = ultimo.objetivo - inc;
  if (bajado >= e.repsMin) return { ejercicio: e, objetivo: bajado, nivel };
  const prev = vars[nivel - 1];
  if (prev) return { ejercicio: prev, objetivo: prev.repsMax, nivel: nivel - 1 };
  return { ejercicio: e, objetivo: e.repsMin, nivel };
}

/**
 * Líneas fijas de cada día: los abdominales clásicos van SIEMPRE y por delante.
 * Cada línea tiene sus raíces en orden de preferencia: se usa la primera permitida.
 * La plancha alterna por días entre la normal y la variante a un brazo.
 */
const LINEAS_FIJAS: { categoria: CoreCategory; raices: (d: number) => string[] }[] = [
  { categoria: "recto", raices: () => ["crunch"] },
  {
    categoria: "transverso",
    raices: (d) =>
      d % 2 === 0 ? ["plancha_antebrazos", "plancha_un_brazo_rodillas"] : ["plancha_un_brazo_rodillas", "plancha_antebrazos"],
  },
  { categoria: "recto", raices: () => ["elevacion_piernas", "crunch_inverso"] },
];

/** Complemento que rota cada día (oblicuos y zona lumbar), detrás de los clásicos. */
const EXTRAS: { categoria: CoreCategory; id: string }[] = [
  { categoria: "oblicuos", id: "plancha_lateral_derecha" },
  { categoria: "oblicuos", id: "toque_talones" },
  { categoria: "lumbar", id: "superman" },
];

/** Series por ejercicio: 3 desde el principio. */
export const SERIES_CORE = 3;

/**
 * Rutina de core del día: crunch, plancha (normal o a un brazo) y elevación de
 * piernas tumbado, siempre; más un complemento rotativo si cabe en 15 min.
 * Cada semana suben reps/segundos y, al tope, se pasa a la variante más difícil.
 */
export function rutinaAbdominales(
  fecha: string,
  inicio: string,
  filtro: FiltroEjercicios,
  historial: SesionCoreHistorial[] = [],
): AbsRoutine {
  const d = Math.max(0, diasEntre(inicio, fecha));
  const semana = Math.floor(d / 7);
  const permitido = (e: Exercise) => ejercicioPermitido(e, filtro);
  const registros: RegistroCore[] = historial
    .filter((s) => s.fecha < fecha)
    .flatMap((s) => s.items.map((it) => ({ ...it, fecha: s.fecha })));

  const items: AbsItem[] = [];
  const usados = new Set<string>();
  const anadir = (base: Exercise, categoria: CoreCategory) => {
    // Con historial, según lo que hiciste; sin él (primera vez), por semanas.
    const { ejercicio: ej, objetivo, nivel } = progresionAdaptativa(base, registros, permitido) ?? resolverProgresion(base, semana, permitido);
    if (usados.has(ej.id)) return;
    usados.add(ej.id);
    items.push({ exerciseId: ej.id, categoria, series: SERIES_CORE, objetivo, medida: ej.medida, descansoSeg: ej.descansoSeg, nivel });
  };

  for (const linea of LINEAS_FIJAS) {
    const base = linea.raices(d).map((id) => ejercicio(id)).find(permitido);
    if (base) anadir(base, linea.categoria);
  }
  const extras = EXTRAS.map((x) => ({ ...x, e: ejercicio(x.id) })).filter((x) => permitido(x.e));
  if (extras.length) {
    const x = extras[d % extras.length];
    anadir(x.e, x.categoria);
  }

  const fijos = items.length - (extras.length ? 1 : 0);
  const segundos = () => items.reduce((t, it) => t + it.series * (tiempoSerieSeg(it) + it.descansoSeg) + 20, 0);
  // Mantener la sesión en 10–15 min: primero se acortan descansos y luego se quita el complemento.
  if (segundos() > 15 * 60) items.forEach((it) => (it.descansoSeg = 20));
  while (segundos() > 15 * 60 && items.length > fijos) items.pop();
  return { fecha, semana, items, duracionEstimadaMin: Math.round(segundos() / 60) };
}

/** Series semanales por grupo que aporta la rutina de casa (para la cobertura del gimnasio). */
export function coberturaAbdominalesSemana(
  desde: string,
  inicio: string,
  filtro: FiltroEjercicios,
  diasPorSemana = 7,
): Coverage {
  const cov = coberturaVacia();
  const fechas = Array.from({ length: 7 }, (_, i) => sumarDias(desde, i));
  const factor = Math.min(7, Math.max(0, diasPorSemana)) / 7;
  for (const f of fechas) {
    const r = rutinaAbdominales(f, inicio, filtro);
    for (const it of r.items) {
      const e = ejercicio(it.exerciseId);
      for (const [g, w] of Object.entries(e.musculos)) {
        cov[g as keyof Coverage] += it.series * (w ?? 0) * factor;
      }
    }
  }
  return cov;
}

