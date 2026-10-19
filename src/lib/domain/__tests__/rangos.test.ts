import { describe, expect, it } from "vitest";
import { calcularRangos, mejoraSiguiente, nivelDe, nivelEjercicio, subidas } from "../rangos";
import type { ExerciseLog } from "../progression";

const log = (fecha: string, exerciseId: string, peso: number, reps: number, series = 1): ExerciseLog => ({
  fecha,
  exerciseId,
  repsMin: 6,
  repsMax: 8,
  buenaTecnica: true,
  series: Array.from({ length: series }, () => ({ pesoKg: peso, reps, rir: 0, hecho: true })),
});
const dia = (i: number) => `2026-10-${String(i).padStart(2, "0")}`;

describe("rangos por rendimiento", () => {
  it("todo el mundo empieza en Hierro I", () => {
    const r = calcularRangos([log(dia(1), "prensa", 100, 8)]);
    expect(r.ejercicios[0].nombre).toBe("Hierro I");
    expect(r.general?.rango).toBe("Hierro");
  });

  it("solo cuenta la mejora, con divisiones I–III y Élite sin división", () => {
    expect(nivelEjercicio(1.0).nombre).toBe("Hierro I");
    expect(nivelEjercicio(1.3).nombre).toBe("Oro I");
    expect(nivelEjercicio(1.45).nombre).toBe("Oro III");
    expect(nivelEjercicio(3).nombre).toBe("Élite");
    expect(mejoraSiguiente(nivelDe(3))).toEqual({ nombre: "Oro II", mejora: expect.closeTo(1.3 + 0.2 / 3, 5) });
  });

  it("un solo día bueno cuenta a medias: hace falta mantenerlo", () => {
    const base = [1, 2, 3].map((i) => log(dia(i), "press_pecho_maquina", 20, 8));
    const pico = calcularRangos([...base, log(dia(4), "press_pecho_maquina", 30, 8)]);
    const mantenido = calcularRangos([...base, log(dia(4), "press_pecho_maquina", 30, 8), log(dia(5), "press_pecho_maquina", 30, 8)]);
    expect(pico.ejercicios[0].mejora).toBeCloseTo(1.25, 2);
    expect(mantenido.ejercicios[0].mejora).toBeCloseTo(1.5, 2);
  });

  it("un mal día no hunde: no baja del 85 % del máximo", () => {
    const ls = [log(dia(1), "prensa", 100, 8), log(dia(2), "prensa", 150, 8), log(dia(3), "prensa", 150, 8)];
    const malos = [4, 5, 6, 7].map((i) => log(dia(i), "prensa", 60, 8));
    const r = calcularRangos([...ls, ...malos]);
    expect(r.ejercicios[0].mejora).toBeCloseTo(1.5 * 0.85, 2);
  });

  it("relativo al peso corporal: la misma fuerza con más peso corporal vale menos", () => {
    const ls = [log(dia(1), "prensa", 100, 8), log(dia(5), "prensa", 120, 8), log(dia(6), "prensa", 120, 8)];
    const igual = calcularRangos(ls, { pesos: [{ fecha: dia(1), kg: 70 }] });
    const engorda = calcularRangos(ls, { pesos: [{ fecha: dia(1), kg: 70 }, { fecha: dia(5), kg: 80 }] });
    expect(engorda.ejercicios[0].mejora).toBeLessThan(igual.ejercicios[0].mejora);
  });

  it("el músculo pondera por series y el objetivo dice peso × reps", () => {
    const ls = [
      ...[1, 2, 3].map((i) => log(dia(i), "press_pecho_maquina", 20 + 5 * i, 8, 4)),
      log(dia(1), "contractora", 20, 8, 1),
    ];
    const r = calcularRangos(ls);
    const press = r.ejercicios.find((x) => x.exerciseId === "press_pecho_maquina")!;
    expect(r.musculos.pecho!.puntuacion).toBeGreaterThan(press.puntuacion * 0.8);
    expect(press.objetivo).toMatch(/kg × \d+ reps/);
    expect(r.zonas.pecho).toBeTruthy();
  });

  it("detecta subidas de división y 'hasta' ignora lo posterior", () => {
    const base = [1, 2].map((i) => log(dia(i), "press_pecho_maquina", 20, 8));
    const antes = calcularRangos(base);
    const despues = calcularRangos([...base, log(dia(3), "press_pecho_maquina", 24, 8), log(dia(4), "press_pecho_maquina", 24, 8)]);
    expect(subidas(antes, despues).some((s) => s.tipo === "ejercicio")).toBe(true);
    expect(calcularRangos([...base, log(dia(9), "press_pecho_maquina", 40, 8)], { hasta: dia(2) }).ejercicios[0].sesiones).toBe(2);
  });
});

describe("rangos del core", () => {
  const sesion = (fecha: string, exerciseId: string, objetivo: number, hechas = 3) => ({ fecha, items: [{ exerciseId, series: 3, objetivo, hechas }] });
  it("sube con más reps y variantes más difíciles, y cuenta para el general", () => {
    expect(calcularRangos([], { core: [sesion(dia(1), "crunch", 10)] }).musculos.core?.rango).toBe("Hierro");
    const r = calcularRangos([], { core: [1, 2, 3, 4, 5, 6].map((i) => sesion(dia(i), i < 4 ? "crunch" : "crunch_brazos_arriba", 10 + i)) });
    expect(r.musculos.core!.indice).toBeGreaterThanOrEqual(5);
    expect(r.general?.rango).toBe(r.zonas.core!.rango);
    const poco = calcularRangos([], { core: [sesion(dia(1), "crunch", 10), sesion(dia(2), "crunch", 11)] });
    expect(poco.ejercicios[0].objetivo).toMatch(/11 reps por serie/);
  });
  it("lo no hecho no cuenta", () => {
    const r = calcularRangos([], { core: [sesion(dia(1), "crunch", 10), sesion(dia(2), "crunch", 30, 0)] });
    expect(r.ejercicios[0].mejora).toBe(1);
  });
});
