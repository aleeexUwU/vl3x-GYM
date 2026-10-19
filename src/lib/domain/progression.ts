import { diasEntre } from "./dates";
import type { Exercise, Experience, LoadType, Profile, Settings } from "./types";

export interface SetLog {
  pesoKg: number | null;
  reps: number | null;
  rir?: number | null;
  hecho: boolean;
}

/** Registro de un ejercicio en una sesión (lo que la progresión necesita saber). */
export interface ExerciseLog {
  fecha: string;
  exerciseId: string;
  repsMin: number;
  repsMax: number;
  series: SetLog[];
  buenaTecnica: boolean;
  descarga?: boolean;
}

export type EstadoProgresion = "calibracion" | "subir" | "mantener" | "bajar" | "descarga";

export interface Sugerencia {
  estado: EstadoProgresion;
  pesoKg: number | null;
  repsObjetivo: number;
  mensaje: string;
}

export type Incrementos = Settings["incrementos"];

export const INCREMENTOS_POR_DEFECTO: Incrementos = {
  mancuerna: 2,
  maquina: 5,
  polea: 2.5,
  kettlebell: 4,
  smith: 2.5,
};

export function incrementoPara(tipo: LoadType, inc: Incrementos): number {
  switch (tipo) {
    case "mancuerna":
      return inc.mancuerna;
    case "maquina":
      return inc.maquina;
    case "polea":
      return inc.polea;
    case "kettlebell":
      return inc.kettlebell;
    case "barra":
      return inc.smith;
    case "smith":
      return inc.smith;
    default:
      return 0;
  }
}

export function redondearPeso(kg: number): number {
  return Math.max(0, Math.round(kg * 2) / 2);
}

/** Peso de partida muy conservador para la calibración (semana 1). */
export function pesoInicial(e: Exercise, perfil: Pick<Profile, "pesoKg" | "sexo" | "experiencia">): number | null {
  if (e.cargaInicial == null) return null;
  const pc = perfil.pesoKg ?? 75;
  let f = Math.min(1.3, Math.max(0.7, pc / 75));
  if (perfil.sexo === "mujer") f *= 0.65;
  const exp: Record<Experience, number> = { principiante: 0.8, intermedio: 1, avanzado: 1.2 };
  f *= exp[perfil.experiencia];
  return redondearPeso(e.cargaInicial * f);
}

const seriesHechas = (l: ExerciseLog) => l.series.filter((s) => s.hecho && s.reps != null);

/** Peso de trabajo de una sesión: el máximo usado en series completadas. */
export function pesoTrabajo(l: ExerciseLog): number | null {
  const pesos = seriesHechas(l)
    .map((s) => s.pesoKg)
    .filter((p): p is number => p != null);
  return pesos.length ? Math.max(...pesos) : null;
}

/**
 * La calibración termina cuando hay una serie dentro del rango con 1–4 reps en
 * reserva (o sin RIR anotado). Devuelve el peso de partida o null si aún no.
 */
export function pesoCalibrado(l: ExerciseLog, rango: { repsMin: number; repsMax: number } = l): number | null {
  const validas = seriesHechas(l).filter(
    (s) => s.reps! >= rango.repsMin && s.reps! <= rango.repsMax + 2 && (s.rir == null || (s.rir >= 1 && s.rir <= 4)),
  );
  if (validas.length === 0) return null;
  // Preferimos las series con 2–3 RIR, que es lo que pide la calibración.
  const ideales = validas.filter((s) => s.rir != null && s.rir >= 2 && s.rir <= 3);
  const base = ideales.length ? ideales : validas;
  const pesos = base.map((s) => s.pesoKg ?? 0);
  return Math.max(...pesos);
}

/** e1RM de Epley para comparar rendimiento entre sesiones. */
export function e1rm(peso: number, reps: number): number {
  return peso * (1 + reps / 30);
}

/**
 * Peso que encaja en un rango a partir de un 1RM estimado: el que permitiría hacer
 * repsMax + 1 repeticiones al fallo (así el rango se hace con 1–3 en reserva).
 */
export function pesoParaRango(unoRm: number, rango: { repsMin: number; repsMax: number }): number {
  return redondearPeso(unoRm / (1 + (rango.repsMax + 1) / 30));
}

/**
 * Fuerza estimada (1RM) contando las repeticiones en reserva anotadas (RIR, hasta 4):
 * 50 kg × 8 con 2 en reserva ≈ 50 kg × 10 al fallo.
 */
export function fuerzaEstimada(l: ExerciseLog): number {
  let best = 0;
  for (const s of seriesHechas(l)) {
    if (s.pesoKg != null && s.pesoKg > 0) best = Math.max(best, e1rm(s.pesoKg, s.reps! + Math.min(4, s.rir ?? 0)));
  }
  return best;
}

export function mejorE1rm(l: ExerciseLog): number {
  let best = 0;
  for (const s of seriesHechas(l)) {
    if (s.pesoKg != null && s.pesoKg > 0) best = Math.max(best, e1rm(s.pesoKg, s.reps!));
  }
  return best;
}

/**
 * Peso y reps sugeridos para la próxima sesión de un ejercicio.
 * - Sin historial (o calibración sin cerrar): calibración guiada.
 * - Doble progresión: todas las series al tope del rango con buena técnica → subir.
 * - Dos sesiones seguidas sin llegar al mínimo → bajar; una → mantener.
 */
export function sugerirCarga(
  e: Exercise,
  rango: { repsMin: number; repsMax: number },
  historial: ExerciseLog[],
  inc: Incrementos,
  perfil: Pick<Profile, "pesoKg" | "sexo" | "experiencia">,
): Sugerencia {
  const paso = incrementoPara(e.tipoCarga, inc);
  const logs = historial
    .filter((l) => l.exerciseId === e.id && !l.descarga && seriesHechas(l).length > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const sinCarga = e.cargaInicial == null;

  if (sinCarga) {
    // Peso corporal o banda: progresión por repeticiones.
    const ultimo = logs.at(-1);
    if (!ultimo) {
      return { estado: "calibracion", pesoKg: null, repsObjetivo: rango.repsMin, mensaje: "Primera vez: céntrate en la técnica." };
    }
    const reps = seriesHechas(ultimo).map((s) => s.reps!);
    const todasTope = reps.length > 0 && reps.every((r) => r >= rango.repsMax);
    if (todasTope && ultimo.buenaTecnica) {
      return {
        estado: "subir",
        pesoKg: null,
        repsObjetivo: rango.repsMax,
        mensaje: "Llegaste al tope: añade carga (banda más dura, mancuerna o lastre) o una pausa de 2 s por repetición.",
      };
    }
    return {
      estado: "mantener",
      pesoKg: null,
      repsObjetivo: Math.min(rango.repsMax, Math.max(...reps) + 1),
      mensaje: "Intenta sumar una repetición por serie.",
    };
  }

  // ¿Hay ya un peso calibrado?
  let calibrado: number | null = null;
  for (const l of logs) {
    const c = pesoCalibrado(l, rango);
    if (c != null) {
      calibrado = c;
      break;
    }
  }

  if (calibrado == null) {
    const ultimo = logs.at(-1);
    const inicial = pesoInicial(e, perfil) ?? 0;
    if (!ultimo) {
      return {
        estado: "calibracion",
        pesoKg: inicial,
        repsObjetivo: rango.repsMin,
        mensaje: `Calibración: empieza con ${inicial} kg y sube serie a serie hasta un peso con el que te queden 2–3 repeticiones en reserva haciendo ${rango.repsMin}–${rango.repsMax}.`,
      };
    }
    const hechas = seriesHechas(ultimo);
    // Con series reales con peso se adapta a lo que hiciste (aunque fuera fuera de rango),
    // en vez de ir subiendo o bajando a ciegas.
    const fuerza = fuerzaEstimada(ultimo);
    // Si todo fue muy ligero (más de 4 en reserva), la estimación no es fiable: se sigue calibrando.
    const pocoFiable = hechas.every((s) => s.rir != null && s.rir > 4);
    if (fuerza > 0 && !pocoFiable) {
      const nuevo = pesoParaRango(fuerza, rango);
      return {
        estado: "mantener",
        pesoKg: nuevo,
        repsObjetivo: rango.repsMin,
        mensaje: `Ajustado a lo que hiciste la última vez (1RM estimado ${Math.round(fuerza)} kg): ${nuevo} kg para ${rango.repsMin}–${rango.repsMax} reps.`,
      };
    }
    const pesoUlt = pesoTrabajo(ultimo) ?? inicial;
    const demasiadoLigero = hechas.every((s) => s.reps! > rango.repsMax || (s.rir != null && s.rir > 4));
    const nuevo = redondearPeso(demasiadoLigero ? pesoUlt + paso * 2 : Math.max(0, pesoUlt - paso));
    return {
      estado: "calibracion",
      pesoKg: nuevo,
      repsObjetivo: rango.repsMin,
      mensaje: demasiadoLigero
        ? "Sigue la calibración: el último peso fue ligero, empieza más arriba."
        : "Sigue la calibración: el último peso fue demasiado; empieza algo más ligero.",
    };
  }

  const ultimo = logs.at(-1)!;
  const W = pesoTrabajo(ultimo) ?? calibrado;
  const hechas = seriesHechas(ultimo).filter((s) => (s.pesoKg ?? 0) >= W);

  // Si cambiaste de rango o la última vez te salieron muchas más reps de las previstas,
  // el peso se recalcula con tu fuerza real en vez de subir solo un escalón.
  const cambioRango = ultimo.repsMin !== rango.repsMin || ultimo.repsMax !== rango.repsMax;
  const muySobrado = hechas.length > 0 && hechas.every((s) => s.reps! >= rango.repsMax + 3);
  if (cambioRango || muySobrado) {
    const fuerza = fuerzaEstimada(ultimo);
    const nuevo = pesoParaRango(fuerza, rango);
    if (fuerza > 0 && nuevo !== W) {
      return {
        estado: nuevo > W ? "subir" : "mantener",
        pesoKg: nuevo,
        repsObjetivo: rango.repsMin,
        mensaje: cambioRango
          ? `Nuevo rango ${rango.repsMin}–${rango.repsMax}: con tu fuerza (1RM estimado ${Math.round(fuerza)} kg) te toca ${nuevo} kg.`
          : `Te sobraron muchas reps: sube a ${nuevo} kg (1RM estimado ${Math.round(fuerza)} kg).`,
      };
    }
  }
  const todasTope = hechas.length > 0 && hechas.every((s) => s.reps! >= rango.repsMax);
  if (todasTope && ultimo.buenaTecnica) {
    const nuevo = redondearPeso(W + paso);
    return {
      estado: "subir",
      pesoKg: nuevo,
      repsObjetivo: rango.repsMin,
      mensaje: `¡Tope del rango en todas las series! Sube a ${nuevo} kg y vuelve a ${rango.repsMin} reps.`,
    };
  }

  const falloMinimo = (l: ExerciseLog) => {
    const w = pesoTrabajo(l);
    return seriesHechas(l).some((s) => (s.pesoKg ?? 0) >= (w ?? 0) && s.reps! < rango.repsMin);
  };
  const ultimos2 = logs.slice(-2);
  if (ultimos2.length === 2 && ultimos2.every(falloMinimo)) {
    const nuevo = redondearPeso(W - paso);
    return {
      estado: "bajar",
      pesoKg: nuevo,
      repsObjetivo: rango.repsMin,
      mensaje: `Dos sesiones sin llegar a ${rango.repsMin} reps: baja a ${nuevo} kg y reconstruye.`,
    };
  }

  const mejores = hechas.map((s) => s.reps!);
  const objetivo = Math.min(rango.repsMax, (mejores.length ? Math.min(...mejores) : rango.repsMin) + 1);
  return {
    estado: "mantener",
    pesoKg: W,
    repsObjetivo: Math.max(rango.repsMin, objetivo),
    mensaje: falloMinimo(ultimo)
      ? "La última vez no llegaste al mínimo: mantén el peso y céntrate en la técnica."
      : `Mantén ${W} kg e intenta sumar repeticiones hasta ${rango.repsMax}.`,
  };
}

export interface EvaluacionDescarga {
  sugerir: boolean;
  motivo: string | null;
}

/**
 * Descarga cada N semanas (6–8) o antes si cae el rendimiento: 3 o más ejercicios
 * con el mejor e1RM de su última sesión >5 % por debajo de su mejor marca reciente.
 */
export function evaluarDescarga(
  hoy: string,
  settings: Pick<Settings, "inicioPrograma" | "ultimaDescarga" | "semanasDescarga" | "descargaHasta">,
  historial: ExerciseLog[],
): EvaluacionDescarga {
  if (settings.descargaHasta && settings.descargaHasta >= hoy) return { sugerir: false, motivo: null };
  const desde = settings.ultimaDescarga ?? settings.inicioPrograma;
  const semanas = Math.floor(diasEntre(desde, hoy) / 7);
  if (semanas >= settings.semanasDescarga) {
    return {
      sugerir: true,
      motivo: `Llevas ${semanas} semanas entrenando sin descarga. Toca una semana suave para recuperar.`,
    };
  }

  const porEjercicio = new Map<string, ExerciseLog[]>();
  for (const l of historial) {
    if (l.descarga) continue;
    const arr = porEjercicio.get(l.exerciseId) ?? [];
    arr.push(l);
    porEjercicio.set(l.exerciseId, arr);
  }
  let caidas = 0;
  for (const logs of porEjercicio.values()) {
    if (logs.length < 3) continue;
    logs.sort((a, b) => a.fecha.localeCompare(b.fecha));
    const ultimo = mejorE1rm(logs.at(-1)!);
    const previos = Math.max(...logs.slice(-4, -1).map(mejorE1rm));
    if (previos > 0 && ultimo < previos * 0.95) caidas += 1;
  }
  if (caidas >= 3) {
    return {
      sugerir: true,
      motivo: `El rendimiento ha bajado en ${caidas} ejercicios. Una semana de descarga suele arreglarlo.`,
    };
  }
  return { sugerir: false, motivo: null };
}

/** Prescripción en semana de descarga: mitad de series, 90 % del peso y +1 RIR. */
export function aplicarDescarga<T extends { series: number; rir: number }>(pe: T): T {
  return { ...pe, series: Math.max(1, Math.round(pe.series / 2)), rir: pe.rir + 1 };
}

export function pesoDescarga(peso: number | null): number | null {
  return peso == null ? null : redondearPeso(peso * 0.9);
}

/**
 * Rampa de entrada para quien retoma: en las 2 primeras semanas se quita una
 * serie a los ejercicios de 3 o más series.
 */
export function aplicarRampa<T extends { series: number }>(pe: T, semanaPrograma: number): T {
  if (semanaPrograma >= 2 || pe.series < 3) return pe;
  return { ...pe, series: pe.series - 1 };
}

/** Último registro (más reciente) de un ejercicio, o undefined si nunca se ha hecho. */
export function ultimoRegistro(logs: ExerciseLog[], exerciseId: string): ExerciseLog | undefined {
  return logs
    .filter((l) => l.exerciseId === exerciseId && seriesHechas(l).length > 0)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
}

/** "25 kg × 10 · 10 · 9" (o "25×10 · 27,5×8" si cambia el peso; "40 s · 35 s" si es por tiempo). */
export function resumenSeries(l: ExerciseLog, medida: "reps" | "segundos" = "reps"): string {
  const hechas = seriesHechas(l);
  const num = (n: number) => String(n).replace(".", ",");
  if (medida === "segundos") return hechas.map((s) => `${s.reps} s`).join(" · ");
  const pesos = new Set(hechas.map((s) => s.pesoKg ?? 0));
  if (pesos.size === 1) {
    const p = hechas[0].pesoKg;
    return `${p ? `${num(p)} kg × ` : ""}${hechas.map((s) => s.reps).join(" · ")}`;
  }
  return hechas.map((s) => `${num(s.pesoKg ?? 0)}×${s.reps}`).join(" · ");
}

/** Mejor 1RM estimado anterior de un ejercicio (0 si no hay historial con peso). */
export function recordAnterior(logs: ExerciseLog[], exerciseId: string): number {
  return Math.max(0, ...logs.filter((l) => l.exerciseId === exerciseId).map(mejorE1rm));
}

// ── Pesos reales de cada máquina ──

/** Cómo sube el peso en una máquina concreta (p. ej. de 5 en 5 kg desde 5 kg). */
export interface PesosMaquina {
  paso: number;
  minimo: number;
}

/** Ajusta un peso al valor más cercano que existe en esa máquina. */
export function ajustarAMaquina(kg: number, m: PesosMaquina | undefined): number {
  if (!m || m.paso <= 0) return redondearPeso(kg);
  const k = Math.max(0, Math.round((kg - m.minimo) / m.paso));
  return Math.round((m.minimo + k * m.paso) * 100) / 100;
}

/** Incrementos con el de este ejercicio sustituido por el paso de su máquina (si lo tiene). */
export function incrementosCon(tipo: LoadType, inc: Incrementos, m: PesosMaquina | undefined): Incrementos {
  if (!m) return inc;
  const clave: keyof Incrementos =
    tipo === "mancuerna" ? "mancuerna" : tipo === "polea" ? "polea" : tipo === "kettlebell" ? "kettlebell" : tipo === "maquina" ? "maquina" : "smith";
  return { ...inc, [clave]: m.paso };
}

// ── Calentamiento ──

export interface SerieCalentamiento {
  pesoKg: number;
  reps: number;
}

/**
 * Series de aproximación antes de la primera serie efectiva: ~50 % × 10 y, si el peso
 * de trabajo es alto para esa máquina, ~75 % × 5. Sin peso o muy ligero, nada.
 */
export function seriesCalentamiento(pesoTrabajo: number | null, paso: number, m?: PesosMaquina): SerieCalentamiento[] {
  if (!pesoTrabajo || pesoTrabajo < 2 * paso) return [];
  const out: SerieCalentamiento[] = [];
  const ligero = ajustarAMaquina(pesoTrabajo * 0.5, m);
  if (ligero > 0 && ligero < pesoTrabajo) out.push({ pesoKg: ligero, reps: 10 });
  if (pesoTrabajo >= 4 * paso) {
    const medio = ajustarAMaquina(pesoTrabajo * 0.75, m);
    if (medio > ligero && medio < pesoTrabajo) out.push({ pesoKg: medio, reps: 5 });
  }
  return out;
}

/**
 * Ajuste serie a serie (como hacen apps tipo Symmetry): según lo que acabas de hacer,
 * el peso de la siguiente serie.
 * - Te sobraron 2+ reps sobre el tope (o 4+ en reserva llegando al tope) → sube un escalón.
 * - No llegaste al mínimo sin reservas → baja un escalón.
 * - Si no, el mismo peso.
 */
export function ajusteSiguienteSerie(
  usado: number,
  reps: number | null,
  rir: number | null,
  rango: { repsMin: number; repsMax: number },
  incr: number,
): { pesoKg: number; motivo: string | null } {
  if (reps == null) return { pesoKg: usado, motivo: null };
  if (reps >= rango.repsMax + 2 || (reps >= rango.repsMax && rir != null && rir >= 4)) {
    return { pesoKg: redondearPeso(usado + incr), motivo: "te sobraron repeticiones" };
  }
  if (reps < rango.repsMin && (rir == null || rir <= 1)) {
    return { pesoKg: redondearPeso(Math.max(0, usado - incr)), motivo: `no llegaste a ${rango.repsMin}` };
  }
  return { pesoKg: usado, motivo: null };
}
