import type { AjustesDieta } from "./nutrition/objetivos";

// Tipos del dominio. Todo lo de este directorio es lógica pura (sin React ni IndexedDB)
// para poder probarlo con Vitest.

export type MuscleGroup =
  | "pecho"
  | "dorsal"
  | "espalda_alta"
  | "hombro_anterior"
  | "hombro_lateral"
  | "hombro_posterior"
  | "biceps"
  | "triceps"
  | "antebrazo"
  | "cuadriceps"
  | "isquios"
  | "gluteos"
  | "aductores"
  | "abductores"
  | "gemelos"
  | "lumbar"
  | "core";

export type Equipment =
  | "mancuernas"
  | "banco"
  | "banco_inclinable"
  | "polea"
  | "prensa"
  | "hack_squat"
  | "extension_cuadriceps"
  | "curl_femoral"
  | "hip_thrust_maquina"
  | "abductor_maquina"
  | "aductor_maquina"
  | "gemelo_maquina"
  | "banco_hiperextensiones"
  | "press_pecho_maquina"
  | "press_hombro_maquina"
  | "contractora"
  | "remo_maquina"
  | "jalon_maquina"
  | "curl_biceps_maquina"
  | "kettlebell"
  | "banda_elastica"
  | "cinturon_lastre"
  | "smith"
  | "barra"
  | "barra_dominadas"
  | "esterilla";

/** Cómo se carga el ejercicio: decide el incremento de peso al progresar. */
export type LoadType = "mancuerna" | "maquina" | "polea" | "peso_corporal" | "smith" | "banda" | "kettlebell" | "barra";

/**
 * Uso de la mano/brazo izquierdo:
 * - ninguna: no la necesita.
 * - apoyo_antebrazo: apoya peso sobre el antebrazo izquierdo (p. ej. plancha sobre antebrazos).
 * - apoyo_mano: carga peso sobre la mano o la muñeca izquierda.
 * - agarre: necesita agarrar o empujar con la mano izquierda.
 */
export type LeftHandUse = "ninguna" | "apoyo_antebrazo" | "apoyo_mano" | "agarre";

export type Measure = "reps" | "segundos";

export type ExerciseTag =
  | "rodilla_profunda"
  | "carga_lumbar"
  | "por_encima_cabeza"
  | "equilibrio"
  | "impacto";

export interface Exercise {
  id: string;
  nombre: string;
  modulo: "gimnasio" | "abdominales";
  /** 1 = músculo principal, 0.5/0.25 = trabajo secundario (conteo fraccionado de series). */
  musculos: Partial<Record<MuscleGroup, number>>;
  /** Material necesario (todo a la vez). Vacío = peso corporal. */
  equipo: Equipment[];
  tipoCarga: LoadType;
  compuesto: boolean;
  manoIzquierda: LeftHandUse;
  /** Barra libre: exige las dos manos (nunca sale con una mano limitada). */
  barraLibre: boolean;
  /** Ejercicio clásico a dos manos: preferido cuando no hay limitación en las manos. */
  bilateral?: boolean;
  /** Máquina Smith: solo como último recurso. */
  smith: boolean;
  /** Para ejercicios Smith: el ejercicio preferido si tuvieras el material. */
  alternativaPreferida?: string;
  medida: Measure;
  repsMin: number;
  repsMax: number;
  descansoSeg: number;
  /** Menor = preferido dentro de su grupo. */
  prioridad: number;
  tags: ExerciseTag[];
  /** Carga inicial orientativa (kg) para un hombre de ~75 kg que retoma. null = sin carga. */
  cargaInicial: number | null;
  /** Carpeta de imágenes en /public/ejercicios (de yuhonas/free-exercise-db). */
  imagen?: string;
  /** Ilustración SVG propia cuando no hay foto. */
  ilustracion?: string;
  pasos: string[];
  errores: string[];
  /** Nota de adaptación (un solo brazo, sin agarre izquierdo...). */
  adaptacion?: string;
  /** Abdominales: categoría y progresión. */
  categoriaCore?: CoreCategory;
  siguiente?: string;
  incrementoSemanal?: number;
}

export type CoreCategory = "recto" | "oblicuos" | "transverso" | "lumbar";

export type Goal = "fuerza" | "hipertrofia" | "salud";
export type RangoReps = "auto" | "pesado" | "medio" | "ligero";
export type Experience = "principiante" | "intermedio" | "avanzado";
export type Sex = "hombre" | "mujer" | "otro";

/** 0 = domingo ... 6 = sábado (como Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type LimitationId = "mano_izquierda" | "rodilla" | "lumbar" | "hombro_derecho" | "equilibrio";

export interface Profile {
  nombre: string;
  edad: number | null;
  pesoKg: number | null;
  alturaCm: number | null;
  sexo: Sex;
  experiencia: Experience;
  objetivo: Goal;
  dias: Weekday[];
  duracionMin: number;
  equipo: Equipment[];
  limitaciones: LimitationId[];
  notasLimitaciones: string;
  /** Ejercicios marcados con dolor o molestia: el generador no los vuelve a usar. */
  excluidos: string[];
  avisoMedicoAceptado: boolean;
  creadoEn: string;
}

export interface Settings {
  seriesMinimas: number;
  incrementos: { mancuerna: number; maquina: number; polea: number; kettlebell: number; smith: number };
  semanasDescarga: number;
  moduloBrazo: boolean;
  abdominalesDiasSemana: number;
  recordatorio: { activo: boolean; hora: string };
  inicioPrograma: string;
  ultimaDescarga: string | null;
  descargaHasta: string | null;
  inicioAbdominales: string;
  sonido: boolean;
  vibracion: boolean;
  biseries: boolean;
  /** Rango de repeticiones preferido ("auto" = el de cada ejercicio). */
  rangoReps?: RangoReps;
  /** Dropset al final de la última serie (máquinas, poleas y mancuernas). */
  dropset?: boolean;
  /** Aviso push opcional si a media tarde vas muy corto de proteína (máx. 1 al día). */
  avisoProteina?: boolean;
  /** Máquinas y poleas antes que mancuernas (para quien aún no domina la técnica). */
  evitarMancuernas: boolean;
  /** Reparto del volumen: más torso o igual para todo. */
  prioridad: "superior" | "equilibrado";
  /** Material que tienes en casa para el core (esterilla, banda...). */
  equipoCasa: Equipment[];
  /** Días de la semana del módulo brazo izquierdo (solo si está activado). */
  diasBrazo: Weekday[];
  tema: "oscuro" | "claro" | "sistema";
  dieta: AjustesDieta;
}

export interface PlannedExercise {
  exerciseId: string;
  series: number;
  repsMin: number;
  repsMax: number;
  descansoSeg: number;
  rir: number;
  ultimoRecurso?: boolean;
  alternativaPreferida?: string;
  /** Etiqueta de biserie (p. ej. "B1"): se alternan series con el otro ejercicio de la misma etiqueta. */
  biserie?: string;
}

export type DayFocus = "completo" | "torso" | "pierna";

export interface PlanDay {
  id: string;
  diaSemana: Weekday;
  nombre: string;
  enfoque: DayFocus;
  ejercicios: PlannedExercise[];
  duracionEstimadaMin: number;
}

export type Coverage = Record<MuscleGroup, number>;

export interface Plan {
  id: string;
  creadoEn: string;
  dias: PlanDay[];
  cobertura: Coverage;
  seriesMinimas: number;
  /** Mínimo por grupo (con prioridad de torso no es igual para todos). */
  minimos?: Coverage;
  prioridad?: "superior" | "equilibrado";
  version?: number;
  avisos: string[];
  gruposSinCubrir: MuscleGroup[];
}
