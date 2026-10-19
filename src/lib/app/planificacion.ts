import { coberturaAbdominalesSemana } from "@/lib/domain/abs-routine";
import { hoyISO, inicioSemana } from "@/lib/domain/dates";
import { ajustesPorDefecto } from "@/lib/domain/defaults";
import { generarPlan, repararPlan, type GeneratorInput } from "@/lib/domain/generator";
import type { ArmAssessment } from "@/lib/domain/left-arm";
import type { FiltroEjercicios } from "@/lib/domain/limitations";
import { mejorAlternativaEnPlan, sustituirEnPlan } from "@/lib/domain/substitution";
import type { Plan, Profile, Settings } from "@/lib/domain/types";
import { escribirKv, leerKv } from "@/lib/db/repo";

export function filtroGimnasio(perfil: Profile, ajustes?: Pick<Settings, "evitarMancuernas">): FiltroEjercicios {
  return {
    equipo: perfil.equipo,
    limitaciones: perfil.limitaciones,
    excluidos: perfil.excluidos,
    evitarMancuernas: ajustes?.evitarMancuernas,
  };
}

/** Filtro del core en casa: material de casa y autoevaluación del brazo izquierdo. */
export function filtroCasa(perfil: Profile, ajustes: Settings, ev: ArmAssessment | null | undefined): FiltroEjercicios {
  return {
    equipo: ajustes.equipoCasa,
    limitaciones: perfil.limitaciones,
    excluidos: perfil.excluidos,
    // La plancha sobre antebrazos entra salvo que la autoevaluación del brazo diga que no es cómoda.
    permiteApoyoAntebrazoIzq: ev?.apoyoAntebrazoComodo !== "no",
  };
}

export function entradaGenerador(
  perfil: Profile,
  ajustes: Settings,
  ev: ArmAssessment | null | undefined,
  hoy = hoyISO(),
): GeneratorInput {
  return {
    dias: perfil.dias,
    duracionMin: perfil.duracionMin,
    objetivo: perfil.objetivo,
    experiencia: perfil.experiencia,
    equipo: perfil.equipo,
    limitaciones: perfil.limitaciones,
    excluidos: perfil.excluidos,
    seriesMinimas: ajustes.seriesMinimas,
    biseries: ajustes.biseries,
    evitarMancuernas: ajustes.evitarMancuernas,
    prioridad: ajustes.prioridad,
    rangoReps: ajustes.rangoReps ?? "auto",
    coberturaCasa: coberturaAbdominalesSemana(
      inicioSemana(hoy),
      ajustes.inicioAbdominales,
      filtroCasa(perfil, ajustes, ev),
      ajustes.abdominalesDiasSemana,
    ),
  };
}

async function contexto() {
  const perfil = await leerKv("perfil");
  if (!perfil) throw new Error("Falta el perfil");
  const ajustes = { ...ajustesPorDefecto(), ...((await leerKv("ajustes")) ?? {}) };
  const ev = await leerKv("evaluacionBrazo");
  return { perfil, ajustes, ev };
}

/** Regenera la rutina con el perfil y ajustes actuales (el historial no se toca). */
export async function regenerarPlan(): Promise<Plan> {
  const { perfil, ajustes, ev } = await contexto();
  const plan = generarPlan(entradaGenerador(perfil, ajustes, ev));
  await escribirKv("plan", plan);
  return plan;
}

/** Sustituye un ejercicio en el plan y completa la cobertura si hiciera falta. */
export async function sustituirEnPlanGuardado(deId: string, aId: string): Promise<Plan | null> {
  const { perfil, ajustes, ev } = await contexto();
  const plan = await leerKv("plan");
  if (!plan) return null;
  const nuevo = repararPlan(sustituirEnPlan(plan, deId, aId), entradaGenerador(perfil, ajustes, ev));
  await escribirKv("plan", nuevo);
  return nuevo;
}

/**
 * Marca un ejercicio como doloroso: no vuelve a salir y se sustituye
 * automáticamente por la mejor alternativa. Devuelve el sustituto (o null).
 */
export async function marcarDolorEnPlan(exerciseId: string): Promise<string | null> {
  const { perfil } = await contexto();
  const excluidos = [...new Set([...perfil.excluidos, exerciseId])];
  const nuevoPerfil = { ...perfil, excluidos };
  await escribirKv("perfil", nuevoPerfil);
  const plan = await leerKv("plan");
  if (!plan) return null;
  const { ajustes, ev } = await contexto();
  const alt = mejorAlternativaEnPlan(plan, exerciseId, filtroGimnasio(nuevoPerfil, ajustes));
  const input = entradaGenerador(nuevoPerfil, ajustes, ev);
  const base = alt
    ? sustituirEnPlan(plan, exerciseId, alt.id)
    : { ...plan, dias: plan.dias.map((d) => ({ ...d, ejercicios: d.ejercicios.filter((pe) => pe.exerciseId !== exerciseId) })) };
  await escribirKv("plan", repararPlan(base, input));
  return alt?.id ?? null;
}

export async function quitarDolor(exerciseId: string): Promise<void> {
  const { perfil } = await contexto();
  await escribirKv("perfil", { ...perfil, excluidos: perfil.excluidos.filter((x) => x !== exerciseId) });
}

/**
 * Los ajustes "máquinas primero" y "prioridad tren superior" eran el valor por defecto
 * cuando la app solo la usaba una persona con la mano izquierda limitada. Ahora el
 * defecto es neutro; a quien tenía esa limitación y nunca los cambió se le guardan
 * explícitamente para que su rutina no cambie.
 */
export async function conservarAjustesAntiguos(): Promise<void> {
  const perfil = await leerKv("perfil");
  const guardados = (await leerKv("ajustes")) as Partial<Settings> | undefined;
  if (!perfil || !guardados || !perfil.limitaciones.includes("mano_izquierda")) return;
  if (guardados.evitarMancuernas !== undefined && guardados.prioridad !== undefined) return;
  await escribirKv("ajustes", {
    ...ajustesPorDefecto(),
    ...guardados,
    evitarMancuernas: guardados.evitarMancuernas ?? true,
    prioridad: guardados.prioridad ?? "superior",
  });
  if (await leerKv("plan")) await regenerarPlan();
}

export async function guardarAjustes(cambios: Partial<Settings>): Promise<Settings> {
  const actual = { ...ajustesPorDefecto(), ...((await leerKv("ajustes")) ?? {}) };
  const nuevo = { ...actual, ...cambios };
  await escribirKv("ajustes", nuevo);
  return nuevo;
}
