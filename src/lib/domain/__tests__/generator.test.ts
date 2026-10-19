import { describe, expect, it } from "vitest";
import { coberturaAbdominalesSemana } from "../abs-routine";
import { EJERCICIOS, EJERCICIOS_GIMNASIO, ejercicio } from "../exercises";
import { candidatos, filtroDe, generarPlan, PATRONES, registrarSustitucion, repararPlan, type GeneratorInput } from "../generator";
import { detectarLimitaciones, ejercicioPermitido, requiereManoIzquierda } from "../limitations";
import { EQUIPO_GIMNASIO_COMPLETO, GRUPOS, GRUPOS_GIMNASIO } from "../muscles";
import { mejorAlternativaEnPlan, sustituirEnPlan } from "../substitution";
import type { Equipment, MuscleGroup, Weekday } from "../types";

const LUNES = "2026-10-12";

function entrada(dias: Weekday[], extra: Partial<GeneratorInput> = {}): GeneratorInput {
  const base = {
    equipo: EQUIPO_GIMNASIO_COMPLETO,
    limitaciones: ["mano_izquierda" as const],
    excluidos: [] as string[],
  };
  const filtro = { ...base, ...extra };
  return {
    dias,
    duracionMin: 90,
    objetivo: "hipertrofia",
    experiencia: "principiante",
    seriesMinimas: 10,
    ...base,
    coberturaCasa: coberturaAbdominalesSemana(LUNES, LUNES, filtro),
    ...extra,
  };
}

const CONFIGS: [string, Weekday[]][] = [
  ["2 días (sábado y domingo)", [6, 0]],
  ["3 días", [1, 3, 5]],
  ["4 días", [1, 2, 4, 5]],
];

describe("catálogo del módulo gimnasio", () => {
  it("los ejercicios adaptados no usan la mano izquierda ni barra libre", () => {
    for (const e of EJERCICIOS_GIMNASIO.filter((x) => !x.bilateral)) {
      expect(requiereManoIzquierda(e), e.id).toBe(false);
      expect(e.manoIzquierda, e.id).toBe("ninguna");
      expect(e.barraLibre, e.id).toBe(false);
    }
  });

  it("con la mano izquierda limitada nunca sale un ejercicio que la necesite ni barra libre", () => {
    const filtro = { equipo: EQUIPO_GIMNASIO_COMPLETO, limitaciones: ["mano_izquierda" as const], excluidos: [] };
    for (const e of EJERCICIOS_GIMNASIO.filter((x) => ejercicioPermitido(x, filtro))) {
      expect(requiereManoIzquierda(e), e.id).toBe(false);
      expect(e.barraLibre, e.id).toBe(false);
    }
  });

  it("todo ejercicio Smith está marcado como último recurso con alternativa preferida válida", () => {
    for (const e of EJERCICIOS_GIMNASIO.filter((x) => x.smith)) {
      expect(e.alternativaPreferida, e.id).toBeTruthy();
      expect(ejercicio(e.alternativaPreferida!).smith).toBe(false);
    }
  });

  it("los ids son únicos y cada ejercicio tiene pasos y errores", () => {
    const ids = EJERCICIOS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EJERCICIOS) {
      expect(e.pasos.length, e.id).toBeGreaterThan(0);
      expect(e.errores.length, e.id).toBeGreaterThan(0);
    }
  });
});

describe.each(CONFIGS)("generador con %s", (_nombre, dias) => {
  const plan = generarPlan(entrada(dias));

  it("genera un día por cada día elegido", () => {
    expect(plan.dias.map((d) => d.diaSemana).sort()).toEqual([...dias].sort());
  });

  it("todos los grupos musculares reciben el volumen mínimo semanal", () => {
    for (const g of GRUPOS) expect(plan.cobertura[g], g).toBeGreaterThanOrEqual(10 - 1e-9);
    expect(plan.gruposSinCubrir).toEqual([]);
  });

  it("cada grupo del gimnasio tiene al menos un ejercicio directo a la semana", () => {
    for (const g of GRUPOS_GIMNASIO) {
      const directo = plan.dias.some((d) =>
        d.ejercicios.some((pe) => (ejercicio(pe.exerciseId).musculos[g] ?? 0) >= 1),
      );
      expect(directo, g).toBe(true);
    }
  });

  it("ningún ejercicio del plan usa la mano izquierda, barra libre ni Smith (hay alternativas)", () => {
    for (const d of plan.dias)
      for (const pe of d.ejercicios) {
        const e = ejercicio(pe.exerciseId);
        expect(requiereManoIzquierda(e), e.id).toBe(false);
        expect(e.barraLibre).toBe(false);
        expect(e.smith, e.id).toBe(false);
        expect(pe.ultimoRecurso).toBeFalsy();
      }
  });

  it("los compuestos van antes que los aislamientos", () => {
    for (const d of plan.dias) {
      const flags = d.ejercicios.map((pe) => ejercicio(pe.exerciseId).compuesto);
      const primerAisl = flags.indexOf(false);
      if (primerAisl >= 0) expect(flags.slice(primerAisl).includes(true)).toBe(false);
    }
  });

  it("es determinista", () => {
    expect(generarPlan(entrada(dias)).dias).toEqual(plan.dias);
  });
});

describe("cobertura con otros mínimos y días", () => {
  it.each([8, 12, 15])("garantiza %i series por grupo con 3 días", (min) => {
    const plan = generarPlan(entrada([1, 3, 5], { seriesMinimas: min }));
    for (const g of GRUPOS) expect(plan.cobertura[g], g).toBeGreaterThanOrEqual(min - 1e-9);
  });

  it("con 4 días el reparto pasa a torso/pierna", () => {
    const plan = generarPlan(entrada([1, 2, 4, 5]));
    expect(plan.dias.map((d) => d.enfoque)).toEqual(["torso", "pierna", "torso", "pierna"]);
  });

  it.each([5, 6])("con %i días también cubre todos los grupos", (n) => {
    const dias = ([1, 2, 3, 4, 5, 6] as Weekday[]).slice(0, n);
    const plan = generarPlan(entrada(dias));
    for (const g of GRUPOS) expect(plan.cobertura[g], g).toBeGreaterThanOrEqual(10 - 1e-9);
  });
});

describe("máquina Smith y barra libre", () => {
  it("la Smith solo se elige cuando no hay ninguna alternativa con el material configurado", () => {
    const equipo: Equipment[] = ["smith", "banco", "banco_inclinable"];
    const plan = generarPlan(entrada([6, 0], { equipo }));
    const usados = plan.dias.flatMap((d) => d.ejercicios);
    for (const pe of usados) {
      const e = ejercicio(pe.exerciseId);
      if (!e.smith) continue;
      expect(pe.ultimoRecurso).toBe(true);
      expect(pe.alternativaPreferida).toBeTruthy();
      const grupos = Object.entries(e.musculos)
        .filter(([, w]) => (w ?? 0) >= 1)
        .map(([g]) => g as MuscleGroup);
      for (const g of grupos) {
        const c = candidatos(g, { equipo, limitaciones: ["mano_izquierda"], excluidos: [] });
        expect(c.ultimoRecurso, `${e.id}/${g}`).toBe(true);
      }
    }
    // Pecho no tiene alternativa sin material → Smith (último recurso).
    expect(usados.some((pe) => pe.exerciseId === "press_smith_una_mano")).toBe(true);
    // Cuádriceps sí tiene alternativa (peso corporal) → la Smith NO aparece.
    expect(usados.some((pe) => pe.exerciseId === "sentadilla_smith")).toBe(false);
    expect(plan.avisos.some((a) => a.includes("último recurso"))).toBe(true);
  });

  it("con gimnasio completo + Smith, la Smith no aparece", () => {
    const plan = generarPlan(entrada([6, 0], { equipo: [...EQUIPO_GIMNASIO_COMPLETO, "smith"] }));
    for (const d of plan.dias) for (const pe of d.ejercicios) expect(ejercicio(pe.exerciseId).smith).toBe(false);
  });

  it("la barra libre nunca aparece en ninguna configuración de material", () => {
    const configs: Equipment[][] = [EQUIPO_GIMNASIO_COMPLETO, ["mancuernas", "banco"], ["polea"], ["smith"], []];
    for (const equipo of configs) {
      for (const [, dias] of CONFIGS) {
        const plan = generarPlan(entrada(dias, { equipo }));
        for (const d of plan.dias)
          for (const pe of d.ejercicios) expect(ejercicio(pe.exerciseId).barraLibre).toBe(false);
      }
    }
  });
});

describe("limitaciones, dolor y sustituciones", () => {
  it("un ejercicio marcado con dolor no vuelve a aparecer", () => {
    const plan = generarPlan(entrada([6, 0], { excluidos: ["prensa"] }));
    expect(plan.dias.flatMap((d) => d.ejercicios).some((pe) => pe.exerciseId === "prensa")).toBe(false);
  });

  it("la limitación de rodilla quita las sentadillas profundas", () => {
    const plan = generarPlan(entrada([1, 3, 5], { limitaciones: ["mano_izquierda", "rodilla"] }));
    for (const d of plan.dias)
      for (const pe of d.ejercicios) expect(ejercicio(pe.exerciseId).tags.includes("rodilla_profunda")).toBe(false);
  });

  it("sustituir y reparar mantiene la cobertura completa", () => {
    const input = entrada([6, 0]);
    const plan = generarPlan(input);
    const original = plan.dias[0].ejercicios[0].exerciseId;
    const filtro = { equipo: input.equipo, limitaciones: input.limitaciones, excluidos: [original] };
    const alt = mejorAlternativaEnPlan(plan, original, filtro);
    expect(alt).toBeTruthy();
    expect(requiereManoIzquierda(alt!)).toBe(false);
    const reparado = repararPlan(sustituirEnPlan(plan, original, alt!.id), { ...input, excluidos: [original] });
    expect(reparado.dias.flatMap((d) => d.ejercicios).some((pe) => pe.exerciseId === original)).toBe(false);
    for (const g of GRUPOS) expect(reparado.cobertura[g], g).toBeGreaterThanOrEqual(10 - 1e-9);
  });
});

describe("principiante: sin mancuernas y prioridad de tren superior (3 días)", () => {
  const input = entrada([1, 3, 5], { evitarMancuernas: true, prioridad: "superior" });
  const plan = generarPlan(input);

  it("no usa mancuernas si hay máquina o polea para el grupo, salvo el antebrazo", () => {
    const todos = plan.dias.flatMap((d) => d.ejercicios.map((pe) => ejercicio(pe.exerciseId)));
    const conMancuerna = todos.filter((e) => e.tipoCarga === "mancuerna" && (e.musculos.antebrazo ?? 0) < 1);
    expect(conMancuerna.map((e) => e.id)).toEqual([]);
    const antebrazo = todos.filter((e) => (e.musculos.antebrazo ?? 0) >= 1);
    expect(antebrazo.length).toBeGreaterThan(0);
    for (const e of antebrazo) expect(e.tipoCarga, e.id).toBe("mancuerna");
  });

  it("torso con 2 series más que el mínimo y pierna con menos, todo cubierto", () => {
    expect(plan.gruposSinCubrir).toEqual([]);
    expect(plan.minimos?.pecho).toBe(12);
    expect(plan.minimos?.cuadriceps).toBe(6);
    for (const g of GRUPOS_GIMNASIO) expect(plan.cobertura[g] + 1e-9, g).toBeGreaterThanOrEqual(plan.minimos![g]);
  });

  it("pecho y dorsal se entrenan en cada sesión y el torso va antes que la pierna", () => {
    for (const d of plan.dias) {
      const primero = ejercicio(d.ejercicios[0].exerciseId);
      expect(["pecho", "dorsal", "hombro_anterior"].some((g) => (primero.musculos[g as MuscleGroup] ?? 0) >= 1), d.nombre).toBe(true);
      for (const g of ["pecho", "dorsal"] as MuscleGroup[]) {
        expect(d.ejercicios.some((pe) => (ejercicio(pe.exerciseId).musculos[g] ?? 0) >= 1), `${d.nombre} ${g}`).toBe(true);
      }
    }
  });

  it("máquina guiada antes que polea: sin cruce en polea si hay press y contractora", () => {
    const ids = plan.dias.flatMap((d) => d.ejercicios.map((pe) => pe.exerciseId));
    expect(ids).not.toContain("cruce_polea_una_mano");
  });

  it("sesiones de duración razonable", () => {
    for (const d of plan.dias) {
      expect(d.duracionEstimadaMin).toBeLessThanOrEqual(90);
    }
  });
});

describe("consejos", () => {
  it("cada consejo corresponde a un ejercicio del catálogo y tiene contenido", async () => {
    const { CONSEJOS, consejosDe } = await import("../consejos");
    for (const [id, c] of Object.entries(CONSEJOS)) {
      expect(EJERCICIOS.some((e) => e.id === id), id).toBe(true);
      expect(c.prepara.length + c.claves.length, id).toBeGreaterThan(0);
    }
    for (const e of EJERCICIOS_GIMNASIO) {
      expect(consejosDe(e, { repsMin: 8, repsMax: 12, rir: 2 }).length, e.id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("persona sin limitaciones", () => {
  const base = entrada([1, 3, 5], { limitaciones: [] });
  const plan = generarPlan({ ...base, coberturaCasa: coberturaAbdominalesSemana(LUNES, LUNES, { equipo: EQUIPO_GIMNASIO_COMPLETO, limitaciones: [], excluidos: [] }) });
  const ids = plan.dias.flatMap((d) => d.ejercicios.map((pe) => pe.exerciseId));

  it("usa los clásicos a dos manos para el tren superior y cubre todo", () => {
    expect(plan.gruposSinCubrir).toEqual([]);
    expect(ids.some((id) => ejercicio(id).bilateral)).toBe(true);
    expect(ids).toContain("press_banca_barra");
  });

  it("no menciona el brazo derecho en los nombres de los días", () => {
    for (const d of plan.dias) expect(d.nombre).not.toMatch(/derech/i);
  });
});

describe("detección de limitaciones por texto", () => {
  it("reconoce rodilla, lumbar y una mano limitada", () => {
    expect(detectarLimitaciones("Me operaron del menisco de la rodilla")).toEqual(["rodilla"]);
    expect(detectarLimitaciones("Tengo una hernia lumbar")).toEqual(["lumbar"]);
    expect(detectarLimitaciones("Nací con la mano izquierda zamba")).toContain("mano_izquierda");
    expect(detectarLimitaciones("")).toEqual([]);
  });
});

describe("sin limitaciones, la espalda va con ejercicios clásicos", () => {
  it("no usa jalón ni remo adaptados a una mano si hay clásicos", () => {
    const plan = generarPlan(entrada([1, 3, 5], { limitaciones: [] }));
    const ids = plan.dias.flatMap((d) => d.ejercicios.map((pe) => pe.exerciseId));
    expect(ids.filter((id) => id.startsWith("jalon_polea_una_mano") || id === "remo_mancuerna_pecho_apoyado")).toEqual([]);
  });
});

describe("la semana trabaja todos los músculos", () => {
  const EQUIPO_ALEX: Equipment[] = ["mancuernas", "banco", "banco_inclinable", "polea", "prensa", "hack_squat", "extension_cuadriceps", "curl_femoral", "hip_thrust_maquina", "abductor_maquina", "aductor_maquina", "gemelo_maquina", "banco_hiperextensiones", "press_pecho_maquina", "press_hombro_maquina", "contractora", "remo_maquina", "curl_biceps_maquina", "kettlebell", "banda_elastica", "cinturon_lastre", "esterilla"];
  const casos: [string, GeneratorInput][] = [
    ...CONFIGS.map(([n, d]) => [n, entrada(d)] as [string, GeneratorInput]),
    ...CONFIGS.map(([n, d]) => [`${n} sin limitaciones`, entrada(d, { limitaciones: [] })] as [string, GeneratorInput]),
    ["config de Alex", entrada([6, 0, 2], { equipo: EQUIPO_ALEX, evitarMancuernas: true, prioridad: "superior", duracionMin: 75 })],
  ];
  for (const [nombre, input] of casos) {
    it(`${nombre}: cada grupo con ejercicio directo, su mínimo y los patrones clave`, () => {
      const plan = generarPlan(input);
      const ids = plan.dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId));
      for (const g of GRUPOS_GIMNASIO) {
        expect(ids.some((id) => (ejercicio(id).musculos[g] ?? 0) >= 1), `${g} directo`).toBe(true);
      }
      for (const g of GRUPOS) expect(plan.cobertura[g], g).toBeGreaterThanOrEqual(plan.minimos![g] - 1e-9);
      for (const p of PATRONES) {
        const posible = candidatos(p.grupo, filtroDe(input)).lista.some((e) => p.ids.includes(e.id));
        if (posible) expect(ids.some((id) => p.ids.includes(id)), `${p.nombre}`).toBe(true);
      }
    });
  }
});

describe("los cambios de ejercicio se mantienen", () => {
  it("al regenerar, el ejercicio quitado no vuelve y sale el elegido", () => {
    const base = generarPlan(entrada([1, 3, 5]));
    const ids = (p: ReturnType<typeof generarPlan>) => p.dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId));
    expect(ids(base)).toContain("hip_thrust_maquina");
    const plan = generarPlan(entrada([1, 3, 5], { sustituciones: { hip_thrust_maquina: "patada_gluteo_polea" } }));
    expect(ids(plan)).not.toContain("hip_thrust_maquina");
    expect(ids(plan)).toContain("patada_gluteo_polea");
    for (const g of GRUPOS) expect(plan.cobertura[g], g).toBeGreaterThanOrEqual(plan.minimos![g] - 1e-9);
    for (const d of plan.dias) expect(new Set(d.ejercicios.map((e) => e.exerciseId)).size).toBe(d.ejercicios.length);
  });

  it("si el elegido ya no está permitido, se ignora el cambio", () => {
    const plan = generarPlan(entrada([1, 3, 5], { sustituciones: { hip_thrust_maquina: "hip_thrust_barra" } }));
    expect(plan.dias.flatMap((d) => d.ejercicios.map((e) => e.exerciseId))).toContain("hip_thrust_maquina");
  });

  it("encadena y deshace cambios", () => {
    let s = registrarSustitucion(undefined, "a", "b");
    s = registrarSustitucion(s, "b", "c");
    expect(s).toEqual({ a: "c", b: "c" });
    s = registrarSustitucion(s, "c", "a");
    expect(s).toEqual({ b: "a", c: "a" });
  });

  it("sustituir hacia uno que ya está ese día no lo duplica", () => {
    const plan = generarPlan(entrada([1, 3, 5]));
    const d = plan.dias.find((x) => x.ejercicios.length >= 2)!;
    const [x, y] = d.ejercicios;
    const nuevo = sustituirEnPlan(plan, x.exerciseId, y.exerciseId);
    const dn = nuevo.dias.find((z) => z.diaSemana === d.diaSemana)!;
    expect(dn.ejercicios.filter((e) => e.exerciseId === y.exerciseId)).toHaveLength(1);
  });
});
