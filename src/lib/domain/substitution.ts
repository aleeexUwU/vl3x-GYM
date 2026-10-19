import { EJERCICIOS_GIMNASIO, ejercicio } from "./exercises";
import { nivelCarga } from "./generator";
import { ejercicioPermitido, type FiltroEjercicios } from "./limitations";
import type { Exercise, MuscleGroup, Plan } from "./types";

function principales(e: Exercise): MuscleGroup[] {
  return (Object.entries(e.musculos) as [MuscleGroup, number][]).filter(([, w]) => w >= 1).map(([g]) => g);
}

/** Parecido entre dos ejercicios por los músculos que trabajan (0..1). */
function similitud(a: Exercise, b: Exercise): number {
  const grupos = new Set([...Object.keys(a.musculos), ...Object.keys(b.musculos)]) as Set<MuscleGroup>;
  let comun = 0;
  let total = 0;
  for (const g of grupos) {
    const x = a.musculos[g] ?? 0;
    const y = b.musculos[g] ?? 0;
    comun += Math.min(x, y);
    total += Math.max(x, y);
  }
  return total ? comun / total : 0;
}

/**
 * Alternativas equivalentes que respetan limitaciones y material, ordenadas por
 * parecido. La Smith solo aparece si no hay ninguna otra opción.
 */
export function alternativas(exerciseId: string, filtro: FiltroEjercicios, yaEnSesion: string[] = []): Exercise[] {
  const original = ejercicio(exerciseId);
  const grupos = principales(original);
  const pool = EJERCICIOS_GIMNASIO.filter(
    (e) =>
      e.id !== original.id &&
      !yaEnSesion.includes(e.id) &&
      ejercicioPermitido(e, filtro) &&
      grupos.some((g) => (e.musculos[g] ?? 0) >= 1),
  );
  const sinSmith = pool.filter((e) => !e.smith);
  const lista = sinSmith.length ? sinSmith : pool;
  return lista.sort(
    (a, b) =>
      nivelCarga(a, filtro) - nivelCarga(b, filtro) ||
      similitud(original, b) - similitud(original, a) ||
      Number(b.compuesto === original.compuesto) - Number(a.compuesto === original.compuesto) ||
      a.prioridad - b.prioridad,
  );
}

/** Sustituye un ejercicio en todos los días del plan, conservando series y rango. */
export function sustituirEnPlan(plan: Plan, deId: string, aId: string): Plan {
  const nuevo = ejercicio(aId);
  return {
    ...plan,
    dias: plan.dias.map((d) => ({
      ...d,
      // Si el elegido ya estaba ese día, el quitado desaparece y sus series se suman al elegido.
      ejercicios: (d.ejercicios.some((pe) => pe.exerciseId === aId) && d.ejercicios.some((pe) => pe.exerciseId === deId)
        ? d.ejercicios
            .filter((pe) => pe.exerciseId !== deId)
            .map((pe) =>
              pe.exerciseId === aId
                ? { ...pe, series: Math.min(4, pe.series + d.ejercicios.find((x) => x.exerciseId === deId)!.series) }
                : pe,
            )
        : d.ejercicios
      ).map((pe) =>
        pe.exerciseId === deId
          ? {
              ...pe,
              exerciseId: aId,
              repsMin: nuevo.repsMin,
              repsMax: nuevo.repsMax,
              descansoSeg: nuevo.descansoSeg,
              ultimoRecurso: nuevo.smith || undefined,
              alternativaPreferida: nuevo.smith ? nuevo.alternativaPreferida : undefined,
            }
          : pe,
      ),
    })),
  };
}

/** Primera alternativa válida que no esté ya en el mismo día, o undefined si no hay. */
export function mejorAlternativaEnPlan(plan: Plan, exerciseId: string, filtro: FiltroEjercicios): Exercise | undefined {
  const enDias = plan.dias.filter((d) => d.ejercicios.some((pe) => pe.exerciseId === exerciseId));
  const ocupados = enDias.flatMap((d) => d.ejercicios.map((pe) => pe.exerciseId));
  return alternativas(exerciseId, { ...filtro, excluidos: [...filtro.excluidos, exerciseId] }, ocupados)[0];
}
