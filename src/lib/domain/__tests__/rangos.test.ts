import { describe, expect, it } from "vitest";
import { calcularRangos, nivelEjercicio, requisitoSiguiente, subidas } from "../rangos";
import type { ExerciseLog } from "../progression";

const log = (fecha: string, exerciseId: string, peso: number, reps: number): ExerciseLog => ({
  fecha,
  exerciseId,
  repsMin: 6,
  repsMax: 8,
  buenaTecnica: true,
  series: [{ pesoKg: peso, reps, rir: 0, hecho: true }],
});

describe("rangos por progreso y constancia", () => {
  it("todo el mundo empieza en Hierro", () => {
    const r = calcularRangos([log("2026-10-01", "prensa", 100, 8)]);
    expect(r.ejercicios[0].rango).toBe("Hierro");
    expect(r.general?.rango).toBe("Hierro");
  });

  it("hace falta mejorar Y ser constante: el menor de los dos manda", () => {
    expect(nivelEjercicio(1.6, 2).rango).toBe("Bronce"); // mucha mejora, pocas sesiones
    expect(nivelEjercicio(1.0, 30).rango).toBe("Hierro"); // muchas sesiones, sin mejora
    expect(nivelEjercicio(1.3, 7).rango).toBe("Oro");
    expect(nivelEjercicio(3, 40).rango).toBe("Élite");
  });

  it("sube con los entrenos y se detecta la subida", () => {
    const base = [1, 2, 3].map((i) => log(`2026-10-0${i}`, "press_pecho_maquina", 20 + i, 8));
    const antes = calcularRangos(base);
    const despues = calcularRangos([...base, log("2026-10-09", "press_pecho_maquina", 27, 8)]);
    expect(despues.ejercicios[0].indice).toBeGreaterThan(antes.ejercicios[0].indice);
    expect(subidas(antes, despues).some((s) => s.tipo === "ejercicio")).toBe(true);
    expect(requisitoSiguiente(despues.ejercicios[0], despues.ejercicios[0].mejora, despues.ejercicios[0].sesiones)).toMatch(/sesiones|fuerza/);
  });

  it("'hasta' ignora las sesiones posteriores", () => {
    const ls = [1, 2, 3, 4].map((i) => log(`2026-10-0${i}`, "prensa", 100 + i * 10, 8));
    expect(calcularRangos(ls, "2026-10-01").ejercicios[0].sesiones).toBe(1);
  });
});
