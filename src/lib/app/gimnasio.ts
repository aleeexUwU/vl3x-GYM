import { diasEntre, hoyISO, sumarDias } from "@/lib/domain/dates";
import { ejercicio } from "@/lib/domain/exercises";
import {
  ajustarAMaquina,
  aplicarDescarga,
  aplicarRampa,
  incrementoPara,
  incrementosCon,
  pesoDescarga,
  redondearPeso,
  sugerirCarga,
  type ExerciseLog,
  type PesosMaquina,
} from "@/lib/domain/progression";
import type { PlanDay, PlannedExercise, Profile, Settings } from "@/lib/domain/types";
import { db } from "@/lib/db/db";
import { escribirKv, guardar, leerKv, nuevoId, vivos } from "@/lib/db/repo";
import type { Workout, WorkoutExercise } from "@/lib/db/types";

/** Historial por ejercicio a partir de las sesiones completadas. */
export function logsDeWorkouts(ws: Workout[]): ExerciseLog[] {
  const out: ExerciseLog[] = [];
  for (const w of ws) {
    if (w.estado !== "completado" || w._deleted) continue;
    for (const ej of w.ejercicios) {
      out.push({
        fecha: w.fecha,
        exerciseId: ej.exerciseId,
        repsMin: ej.repsMin,
        repsMax: ej.repsMax,
        buenaTecnica: ej.buenaTecnica,
        descarga: w.descarga,
        series: ej.series.map((s) => ({ pesoKg: s.pesoKg, reps: s.reps, rir: s.rir, hecho: s.hecho })),
      });
    }
  }
  return out;
}

export function semanaPrograma(ajustes: Settings, hoy = hoyISO()): number {
  return Math.max(0, Math.floor(diasEntre(ajustes.inicioPrograma, hoy) / 7));
}

export function enDescarga(ajustes: Settings, hoy = hoyISO()): boolean {
  return !!ajustes.descargaHasta && ajustes.descargaHasta >= hoy;
}

/** Prepara un ejercicio para la sesión: series, objetivo de peso/reps y estado de progresión. */
export function prepararEjercicio(
  pe: PlannedExercise,
  perfil: Profile,
  ajustes: Settings,
  logs: ExerciseLog[],
  hoy = hoyISO(),
  maquinas: Record<string, PesosMaquina> = {},
): WorkoutExercise {
  const e = ejercicio(pe.exerciseId);
  const maquina = maquinas[e.id];
  const inc = incrementosCon(e.tipoCarga, ajustes.incrementos, maquina);
  const descarga = enDescarga(ajustes, hoy);
  let p = aplicarRampa(pe, semanaPrograma(ajustes, hoy));
  if (descarga) p = aplicarDescarga(p);
  const sug = sugerirCarga(e, { repsMin: pe.repsMin, repsMax: pe.repsMax }, logs, inc, perfil);
  const sugerido = descarga ? pesoDescarga(sug.pesoKg) : sug.pesoKg;
  // Solo pesos que existen en esa máquina (si se ha configurado).
  const peso = sugerido == null ? null : ajustarAMaquina(sugerido, maquina);
  const paso = incrementoPara(e.tipoCarga, inc);
  const series = Array.from({ length: p.series }, (_, i) => {
    // En calibración el objetivo sube serie a serie hasta dar con el peso de trabajo.
    const objetivoPeso =
      peso == null ? null : sug.estado === "calibracion" ? ajustarAMaquina(redondearPeso(peso + paso * i), maquina) : peso;
    return {
      objetivoPeso,
      objetivoReps: sug.repsObjetivo,
      pesoKg: objetivoPeso,
      reps: null,
      rir: null,
      hecho: false,
    };
  });
  return {
    exerciseId: e.id,
    repsMin: pe.repsMin,
    repsMax: pe.repsMax,
    descansoSeg: pe.descansoSeg,
    rir: p.rir,
    biserie: pe.biserie,
    ultimoRecurso: pe.ultimoRecurso,
    alternativaPreferida: pe.alternativaPreferida,
    estado: descarga ? "descarga" : sug.estado,
    mensaje: descarga ? "Semana de descarga: menos series, 90 % del peso y más reps en reserva." : sug.mensaje,
    buenaTecnica: true,
    series,
  };
}

/** Empieza (o retoma) la sesión de hoy para un día del plan. */
export async function iniciarWorkout(dia: PlanDay, perfil: Profile, ajustes: Settings): Promise<string> {
  const hoy = hoyISO();
  const todos = vivos(await db().workouts.toArray());
  const abierta = todos.find((w) => w.estado === "en_curso" && w.planDayId === dia.id && w.fecha >= sumarDias(hoy, -1));
  if (abierta) return abierta.id;
  const logs = logsDeWorkouts(todos);
  const maquinas = (await leerKv("pesosMaquina")) ?? {};
  const w = await guardar<Workout>("workouts", {
    id: nuevoId(),
    fecha: hoy,
    planDayId: dia.id,
    nombre: dia.nombre,
    estado: "en_curso",
    inicio: new Date().toISOString(),
    descarga: enDescarga(ajustes, hoy),
    ejercicios: dia.ejercicios.map((pe) => prepararEjercicio(pe, perfil, ajustes, logs, hoy, maquinas)),
    notas: "",
  });
  return w.id;
}

/** Lee la sesión, aplica el cambio y la guarda al instante (funciona sin conexión). */
export async function mutarWorkout(id: string, fn: (w: Workout) => void): Promise<void> {
  const w = await db().workouts.get(id);
  if (!w) return;
  const copia: Workout = structuredClone(w);
  fn(copia);
  await guardar<Workout>("workouts", copia);
}

export async function completarWorkout(id: string): Promise<void> {
  await mutarWorkout(id, (w) => {
    w.estado = "completado";
    w.fin = new Date().toISOString();
  });
}

/** Sustituye un ejercicio dentro de la sesión en curso, con su propia sugerencia de carga. */
export async function sustituirEnWorkout(
  id: string,
  idx: number,
  nuevoExerciseId: string,
  perfil: Profile,
  ajustes: Settings,
): Promise<void> {
  const logs = logsDeWorkouts(vivos(await db().workouts.toArray()));
  await mutarWorkout(id, (w) => {
    const viejo = w.ejercicios[idx];
    const e = ejercicio(nuevoExerciseId);
    const pe: PlannedExercise = {
      exerciseId: e.id,
      series: viejo.series.length,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      descansoSeg: e.descansoSeg,
      rir: viejo.rir,
      biserie: viejo.biserie,
    };
    const nuevo = prepararEjercicio(pe, perfil, ajustes, logs);
    nuevo.sustituyeA = viejo.sustituyeA ?? viejo.exerciseId;
    w.ejercicios[idx] = nuevo;
  });
}

/**
 * "Hacer luego" (máquina ocupada): mueve el ejercicio al final de la sesión. Si iba en
 * biserie, la pareja se deshace (los dos quedan como ejercicios normales).
 */
export async function hacerLuego(workoutId: string, idx: number): Promise<void> {
  await mutarWorkout(workoutId, (w) => {
    const [ej] = w.ejercicios.splice(idx, 1);
    if (!ej) return;
    if (ej.biserie) {
      for (const x of w.ejercicios) if (x.biserie === ej.biserie) delete x.biserie;
      delete ej.biserie;
    }
    w.ejercicios.push(ej);
  });
}

/**
 * Guarda cómo sube el peso en la máquina de un ejercicio (o lo quita con null) y ajusta
 * a esos valores las series pendientes de la sesión en curso.
 */
export async function configurarMaquina(exerciseId: string, cfg: PesosMaquina | null, workoutId?: string): Promise<void> {
  const actuales = { ...((await leerKv("pesosMaquina")) ?? {}) };
  if (cfg) actuales[exerciseId] = cfg;
  else delete actuales[exerciseId];
  await escribirKv("pesosMaquina", actuales);
  if (!cfg || !workoutId) return;
  await mutarWorkout(workoutId, (w) => {
    for (const ej of w.ejercicios) {
      if (ej.exerciseId !== exerciseId) continue;
      for (const s of ej.series) {
        if (s.hecho) continue;
        if (s.objetivoPeso != null) s.objetivoPeso = ajustarAMaquina(s.objetivoPeso, cfg);
        if (s.pesoKg != null) s.pesoKg = ajustarAMaquina(s.pesoKg, cfg);
      }
    }
  });
}

/**
 * ¿Toca calentar antes de este ejercicio? Sí si trabaja como principal algún músculo que
 * ningún ejercicio anterior de la sesión haya movido ya (aunque sea de forma secundaria).
 */
export function tocaCalentar(ejercicios: { exerciseId: string }[], idx: number): boolean {
  const e = ejercicio(ejercicios[idx].exerciseId);
  if (e.cargaInicial == null) return false;
  const calientes = new Set<string>();
  for (const x of ejercicios.slice(0, idx)) {
    for (const [g, w] of Object.entries(ejercicio(x.exerciseId).musculos)) if ((w ?? 0) >= 0.5) calientes.add(g);
  }
  return Object.entries(e.musculos).some(([g, w]) => (w ?? 0) >= 1 && !calientes.has(g));
}

/**
 * "Extra si no estás muy cansado": reabre la sesión terminada con un ejercicio más
 * (2 series, con su peso sugerido). Al acabarlo se vuelve a cerrar como siempre.
 */
export async function anadirExtra(workoutId: string, exerciseId: string, perfil: Profile, ajustes: Settings): Promise<void> {
  const todos = vivos(await db().workouts.toArray());
  const logs = logsDeWorkouts(todos.filter((w) => w.id !== workoutId));
  const maquinas = (await leerKv("pesosMaquina")) ?? {};
  const e = ejercicio(exerciseId);
  const pe: PlannedExercise = { exerciseId, series: 2, repsMin: e.repsMin, repsMax: e.repsMax, descansoSeg: e.descansoSeg, rir: 1 };
  const nuevo = prepararEjercicio(pe, perfil, ajustes, logs, hoyISO(), maquinas);
  await mutarWorkout(workoutId, (w) => {
    w.ejercicios.push({ ...nuevo, extra: true });
    w.estado = "en_curso";
    delete w.fin;
  });
}
