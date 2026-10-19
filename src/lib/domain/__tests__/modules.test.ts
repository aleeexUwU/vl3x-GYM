import { describe, expect, it } from "vitest";
import { progresionAdaptativa, resolverProgresion, rutinaAbdominales } from "../abs-routine";
import { sumarDias } from "../dates";
import { ajustesPorDefecto, perfilPorDefecto } from "../defaults";
import { EJERCICIOS_ABDOMINALES, ejercicio } from "../exercises";
import { generarPlan } from "../generator";
import { CATALOGO_BRAZO_IZQUIERDO, avisoDolor, ejerciciosCompatibles, evaluacionVacia } from "../left-arm";
import type { FiltroEjercicios } from "../limitations";
import { mejorRacha, planSemanal, racha } from "../weekly-plan";

const LUNES = "2026-10-12";
// Como en la app: plancha sobre antebrazos permitida salvo que la autoevaluación diga que no.
const filtroCasa: FiltroEjercicios = { equipo: [], limitaciones: ["mano_izquierda"], excluidos: [], permiteApoyoAntebrazoIzq: true };

function idsEn28Dias(filtro: FiltroEjercicios): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < 28; i++) {
    rutinaAbdominales(sumarDias(LUNES, i), LUNES, filtro).items.forEach((it) => ids.add(it.exerciseId));
  }
  return ids;
}

describe("módulo brazo izquierdo", () => {
  it("está desactivado por defecto", () => {
    expect(ajustesPorDefecto(LUNES).moduloBrazo).toBe(false);
  });

  it("desactivado, no genera nada en el plan semanal aunque haya días asignados", () => {
    const perfil = perfilPorDefecto();
    const plan = generarPlan({ ...perfil, seriesMinimas: 10 });
    const semana = planSemanal(LUNES, plan, ajustesPorDefecto(LUNES), [0, 1, 2, 3, 4, 5, 6]);
    expect(semana.some((a) => a.tipo === "brazo")).toBe(false);
    expect(semana.filter((a) => a.tipo === "gimnasio")).toHaveLength(2);
    expect(semana.filter((a) => a.tipo === "abdominales")).toHaveLength(7);
  });

  it("activado, aparece solo en los días elegidos", () => {
    const semana = planSemanal(LUNES, null, { ...ajustesPorDefecto(LUNES), moduloBrazo: true }, [2, 4]);
    expect(semana.filter((a) => a.tipo === "brazo").map((a) => a.fecha)).toEqual(["2026-10-13", "2026-10-15"]);
  });

  it("la autoevaluación filtra el catálogo (sin agarre no hay ejercicios de agarre)", () => {
    const ev = { ...evaluacionVacia(LUNES), agarra: "no" as const, rotaHombro: "no" as const };
    const ok = ejerciciosCompatibles(ev);
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.some((e) => e.requiere.agarre)).toBe(false);
    expect(ok.some((e) => e.requiere.rotacionHombro)).toBe(false);
    expect(ok.length).toBeLessThan(CATALOGO_BRAZO_IZQUIERDO.length);
  });

  it("avisa cuando el dolor supera 3", () => {
    expect(avisoDolor(2).nivel).toBe("ok");
    expect(avisoDolor(4).nivel).toBe("precaucion");
    expect(avisoDolor(7).nivel).toBe("parar");
  });
});

describe("módulo abdominales", () => {
  const CLASICOS = {
    crunch: ["crunch", "crunch_brazos_arriba", "crunch_encogido"],
    plancha: ["plancha_antebrazos", "plancha_un_brazo_rodillas", "plancha_un_brazo"],
    piernas: ["elevacion_piernas", "elevacion_piernas_cadera"],
  };

  it("cada día lleva crunch, plancha y elevación de piernas, por delante de cualquier otro, en 8–16 min", () => {
    for (let i = 0; i < 70; i++) {
      const fecha = sumarDias(LUNES, i);
      const r = rutinaAbdominales(fecha, LUNES, filtroCasa);
      const ids = r.items.map((it) => it.exerciseId);
      expect(CLASICOS.crunch, fecha).toContain(ids[0]);
      expect(CLASICOS.plancha, fecha).toContain(ids[1]);
      expect(CLASICOS.piernas, fecha).toContain(ids[2]);
      expect(r.duracionEstimadaMin, fecha).toBeGreaterThanOrEqual(8);
      expect(r.duracionEstimadaMin, fecha).toBeLessThanOrEqual(16);
    }
  });

  it("la plancha alterna entre la normal y la variante a un brazo", () => {
    const planchas = [0, 1].map((i) => rutinaAbdominales(sumarDias(LUNES, i), LUNES, filtroCasa).items[1].exerciseId);
    expect(planchas).toEqual(["plancha_antebrazos", "plancha_un_brazo_rodillas"]);
  });

  it("si apoyar el antebrazo izquierdo no es cómodo, solo planchas a un brazo (sobre el derecho)", () => {
    const sin = idsEn28Dias({ ...filtroCasa, permiteApoyoAntebrazoIzq: false });
    expect(sin.has("plancha_antebrazos")).toBe(false);
    expect(sin.has("plancha_lateral_izquierda")).toBe(false);
    expect(sin.has("plancha_un_brazo_rodillas")).toBe(true);
  });

  it("ningún ejercicio carga la mano o la muñeca izquierda", () => {
    for (const e of EJERCICIOS_ABDOMINALES) expect(["agarre", "apoyo_mano"]).not.toContain(e.manoIzquierda);
    expect(ejercicio("plancha_un_brazo").manoIzquierda).toBe("ninguna");
  });

  it("más difícil desde el primer día: 3 series y crunch desde 15 reps, plancha desde 30 s", () => {
    const r = rutinaAbdominales(LUNES, LUNES, filtroCasa);
    expect(r.items.every((it) => it.series === 3)).toBe(true);
    expect(r.items[0].objetivo).toBe(15);
    expect(r.items[1].objetivo).toBe(30);
    expect(r.items[2].objetivo).toBe(12);
  });

  it("la dificultad sigue subiendo con las semanas y pasa a variantes más difíciles", () => {
    const crunch = ejercicio("crunch");
    expect(resolverProgresion(crunch, 0).objetivo).toBe(15);
    expect(resolverProgresion(crunch, 1).objetivo).toBe(17);
    const lejos = resolverProgresion(crunch, 10);
    expect(lejos.ejercicio.id).toBe("crunch_brazos_arriba");
    expect(lejos.nivel).toBe(1);
    expect(resolverProgresion(ejercicio("plancha_un_brazo_rodillas"), 8).ejercicio.id).toBe("plancha_un_brazo");
    expect(resolverProgresion(ejercicio("elevacion_piernas"), 9).ejercicio.id).toBe("elevacion_piernas_cadera");
    // Volumen total creciente semana a semana.
    const total = (sem: number) =>
      rutinaAbdominales(sumarDias(LUNES, sem * 7), LUNES, filtroCasa).items.slice(0, 3).reduce((t, it) => t + it.objetivo, 0);
    expect(total(3)).toBeGreaterThan(total(0));
  });
});

describe("rachas", () => {
  it("cuenta días consecutivos hasta hoy o ayer", () => {
    expect(racha(["2026-10-10", "2026-10-11", "2026-10-12"], "2026-10-12")).toBe(3);
    expect(racha(["2026-10-10", "2026-10-11"], "2026-10-12")).toBe(2);
    expect(racha(["2026-10-09"], "2026-10-12")).toBe(0);
    expect(mejorRacha(["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"])).toBe(3);
  });
});

describe("calentamiento en la sesión", () => {
  it("solo en el primer ejercicio que trabaja cada músculo", async () => {
    const { tocaCalentar } = await import("@/lib/app/gimnasio");
    const ejs = [{ exerciseId: "press_pecho_maquina" }, { exerciseId: "contractora" }, { exerciseId: "jalon_pecho" }];
    expect(tocaCalentar(ejs, 0)).toBe(true);
    expect(tocaCalentar(ejs, 1)).toBe(false); // el pecho ya se ha trabajado
    expect(tocaCalentar(ejs, 2)).toBe(true); // dorsal nuevo
  });
});

describe("core adaptativo (según lo que haces)", () => {
  const crunch = ejercicio("crunch");
  const reg = (fecha: string, exerciseId: string, objetivo: number, reales: number[]) => ({ fecha, exerciseId, series: 3, objetivo, hechas: reales.length, reales });
  it("completo sube; te falta poco repite; fallo dos veces baja", () => {
    expect(progresionAdaptativa(crunch, [reg("2026-10-01", "crunch", 15, [15, 15, 15])])!.objetivo).toBe(17);
    expect(progresionAdaptativa(crunch, [reg("2026-10-01", "crunch", 15, [20, 21, 20])])!.objetivo).toBe(20);
    expect(progresionAdaptativa(crunch, [reg("2026-10-01", "crunch", 20, [20, 18, 16])])!.objetivo).toBe(20);
    const mal = [reg("2026-10-01", "crunch", 20, [12, 10, 8]), reg("2026-10-02", "crunch", 20, [11, 9, 8])];
    expect(progresionAdaptativa(crunch, mal)!.objetivo).toBe(18);
    expect(progresionAdaptativa(crunch, mal.slice(0, 1))!.objetivo).toBe(20);
  });
  it("en el tope: dos sesiones completas para pasar a la variante difícil", () => {
    const tope = crunch.repsMax;
    const una = [reg("2026-10-01", "crunch", tope, [tope, tope, tope])];
    expect(progresionAdaptativa(crunch, una)!.ejercicio.id).toBe("crunch");
    const dos = [...una, reg("2026-10-02", "crunch", tope, [tope, tope, tope])];
    const sig = progresionAdaptativa(crunch, dos)!;
    expect(sig.ejercicio.id).toBe("crunch_brazos_arriba");
    expect(sig.nivel).toBe(1);
  });
  it("la rutina usa el historial y sin él va por semanas", () => {
    const hist = [{ fecha: "2026-10-12", items: [{ exerciseId: "crunch", series: 3, objetivo: 15, hechas: 3, reales: [22, 22, 22] }] }];
    const r = rutinaAbdominales("2026-10-13", "2026-10-12", { equipo: ["esterilla"], limitaciones: [], excluidos: [] }, hist);
    expect(r.items.find((it) => it.exerciseId === "crunch")!.objetivo).toBe(22);
  });
});
