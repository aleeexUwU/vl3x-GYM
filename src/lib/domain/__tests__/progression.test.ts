import { describe, expect, it } from "vitest";
import { ejercicio } from "../exercises";
import {
  INCREMENTOS_POR_DEFECTO,
  aplicarDescarga,
  aplicarRampa,
  evaluarDescarga,
  sugerirCarga,
  type ExerciseLog,
} from "../progression";

const perfil = { pesoKg: 75, sexo: "hombre" as const, experiencia: "principiante" as const };
const rango = { repsMin: 8, repsMax: 12 };
const press = ejercicio("press_mancuerna_una_mano");
const prensa = ejercicio("prensa");

function log(fecha: string, sets: [number, number, number?][], extra: Partial<ExerciseLog> = {}): ExerciseLog {
  return {
    fecha,
    exerciseId: press.id,
    ...rango,
    buenaTecnica: true,
    series: sets.map(([pesoKg, reps, rir]) => ({ pesoKg, reps, rir: rir ?? null, hecho: true })),
    ...extra,
  };
}

describe("calibración (semana 1)", () => {
  it("sin historial propone calibrar con un peso conservador", () => {
    const s = sugerirCarga(press, rango, [], INCREMENTOS_POR_DEFECTO, perfil);
    expect(s.estado).toBe("calibracion");
    expect(s.pesoKg).toBeGreaterThan(0);
    expect(s.pesoKg).toBeLessThanOrEqual(8);
  });

  it("si todo fue demasiado ligero, sigue calibrando más arriba", () => {
    const s = sugerirCarga(press, rango, [log("2026-10-10", [[6, 15, 6], [6, 15, 6]])], INCREMENTOS_POR_DEFECTO, perfil);
    expect(s.estado).toBe("calibracion");
    expect(s.pesoKg).toBe(10);
  });

  it("guarda como punto de partida el peso con 2–3 reps en reserva", () => {
    const s = sugerirCarga(
      press,
      rango,
      [log("2026-10-10", [[6, 12, 5], [10, 10, 3], [12, 8, 1]])],
      INCREMENTOS_POR_DEFECTO,
      perfil,
    );
    expect(s.estado).not.toBe("calibracion");
  });
});

describe("doble progresión", () => {
  it("sube el peso al llegar al tope del rango en todas las series con buena técnica", () => {
    const s = sugerirCarga(
      press,
      rango,
      [log("2026-10-10", [[12, 12, 2], [12, 12, 2], [12, 12, 1]])],
      INCREMENTOS_POR_DEFECTO,
      perfil,
    );
    expect(s.estado).toBe("subir");
    expect(s.pesoKg).toBe(14);
  });

  it("usa el incremento de máquina en la prensa", () => {
    const l: ExerciseLog = {
      ...log("2026-10-10", [[60, 12, 2], [60, 12, 2]]),
      exerciseId: prensa.id,
      repsMin: 10,
      repsMax: 12,
    };
    const s = sugerirCarga(prensa, { repsMin: 10, repsMax: 12 }, [l], INCREMENTOS_POR_DEFECTO, perfil);
    expect(s.pesoKg).toBe(65);
  });

  it("no sube si la técnica no fue buena", () => {
    const s = sugerirCarga(
      press,
      rango,
      [log("2026-10-10", [[12, 12, 2], [12, 12, 2]], { buenaTecnica: false })],
      INCREMENTOS_POR_DEFECTO,
      perfil,
    );
    expect(s.estado).toBe("mantener");
  });

  it("mantiene si no llega al mínimo una vez y baja si falla dos sesiones seguidas", () => {
    const una = sugerirCarga(press, rango, [log("2026-10-10", [[12, 10, 2], [12, 7, 0]])], INCREMENTOS_POR_DEFECTO, perfil);
    expect(una.estado).toBe("mantener");
    const dos = sugerirCarga(
      press,
      rango,
      [log("2026-10-10", [[12, 10, 2], [12, 7, 0]]), log("2026-10-12", [[12, 9, 1], [12, 6, 0]])],
      INCREMENTOS_POR_DEFECTO,
      perfil,
    );
    expect(dos.estado).toBe("bajar");
    expect(dos.pesoKg).toBe(10);
  });
});

describe("descarga y rampa", () => {
  const settings = { inicioPrograma: "2026-08-01", ultimaDescarga: null, semanasDescarga: 7, descargaHasta: null };

  it("sugiere descarga al pasar las semanas configuradas", () => {
    expect(evaluarDescarga("2026-09-25", settings, []).sugerir).toBe(true);
    expect(evaluarDescarga("2026-08-20", settings, []).sugerir).toBe(false);
  });

  it("sugiere descarga si cae el rendimiento en 3 ejercicios", () => {
    const hist: ExerciseLog[] = [];
    for (const id of ["a", "b", "c"]) {
      hist.push({ ...log("2026-08-05", [[20, 10]]), exerciseId: id });
      hist.push({ ...log("2026-08-08", [[20, 10]]), exerciseId: id });
      hist.push({ ...log("2026-08-12", [[16, 8]]), exerciseId: id });
    }
    expect(evaluarDescarga("2026-08-13", settings, hist).sugerir).toBe(true);
  });

  it("la descarga reduce series a la mitad y suma un RIR; la rampa quita una serie al principio", () => {
    expect(aplicarDescarga({ series: 4, rir: 2 })).toEqual({ series: 2, rir: 3 });
    expect(aplicarRampa({ series: 4 }, 0).series).toBe(3);
    expect(aplicarRampa({ series: 4 }, 3).series).toBe(4);
  });
});

describe("la última vez y récords", () => {
  const l = (fecha: string, series: [number, number][]) => ({
    fecha,
    exerciseId: "x",
    repsMin: 8,
    repsMax: 12,
    buenaTecnica: true,
    series: series.map(([pesoKg, reps]) => ({ pesoKg, reps, hecho: true })),
  });
  it("devuelve el registro más reciente y lo resume", async () => {
    const { ultimoRegistro, resumenSeries, recordAnterior } = await import("../progression");
    const logs = [l("2026-10-01", [[20, 10]]), l("2026-10-08", [[25, 10], [25, 10], [25, 9]])];
    expect(ultimoRegistro(logs, "x")?.fecha).toBe("2026-10-08");
    expect(resumenSeries(logs[1])).toBe("25 kg × 10 · 10 · 9");
    expect(resumenSeries(l("d", [[25, 10], [27.5, 8]]))).toBe("25×10 · 27,5×8");
    expect(recordAnterior(logs, "x")).toBeCloseTo(25 * (1 + 10 / 30));
    expect(recordAnterior(logs, "otro")).toBe(0);
  });
});

describe("pesos de máquina y calentamiento", () => {
  it("ajusta al peso que existe en la máquina", async () => {
    const { ajustarAMaquina } = await import("../progression");
    const m = { paso: 7, minimo: 7 };
    expect(ajustarAMaquina(30, m)).toBe(28);
    expect(ajustarAMaquina(32, m)).toBe(35);
    expect(ajustarAMaquina(2, m)).toBe(7);
    expect(ajustarAMaquina(31.3, undefined)).toBe(31.5);
  });
  it("propone 1 o 2 series de calentamiento según el peso", async () => {
    const { seriesCalentamiento } = await import("../progression");
    expect(seriesCalentamiento(40, 5)).toEqual([
      { pesoKg: 20, reps: 10 },
      { pesoKg: 30, reps: 5 },
    ]);
    expect(seriesCalentamiento(15, 5)).toEqual([{ pesoKg: 7.5, reps: 10 }]);
    expect(seriesCalentamiento(5, 5)).toEqual([]);
    expect(seriesCalentamiento(null, 5)).toEqual([]);
  });
});

describe("se adapta a lo que levantas de verdad", () => {
  const pesado = { repsMin: 6, repsMax: 8 };
  it("calibrando, si haces 6-8 pesadas fuera del rango previsto, ajusta en vez de bajar a ciegas", () => {
    // Rango previsto 10-15, pero hizo 30 kg × 7 con 1 en reserva.
    const s = sugerirCarga(press, { repsMin: 10, repsMax: 15 }, [log("2026-10-10", [[30, 7, 1], [30, 7, 1]], { repsMin: 10, repsMax: 15 })], INCREMENTOS_POR_DEFECTO, perfil);
    expect(s.estado).toBe("mantener");
    expect(s.pesoKg).toBeGreaterThan(20);
    expect(s.pesoKg).toBeLessThan(30);
  });
  it("al pasar a rango pesado (6-8) sube el peso según la fuerza real", () => {
    // Venía haciendo 20 kg × 12 en rango 8-12.
    const logs = [log("2026-10-01", [[20, 10, 2]]), log("2026-10-08", [[20, 12, 2], [20, 12, 2]])];
    const s = sugerirCarga(press, pesado, logs, INCREMENTOS_POR_DEFECTO, perfil);
    expect(s.pesoKg).toBeGreaterThan(20);
    expect(s.mensaje).toMatch(/Nuevo rango 6–8/);
  });
  it("en rango pesado, la doble progresión sube al llegar a 8 en todas", () => {
    const logs = [log("2026-10-08", [[30, 7, 2]], pesado), log("2026-10-12", [[30, 8, 1], [30, 8, 1]], pesado)];
    const s = sugerirCarga(press, pesado, logs, INCREMENTOS_POR_DEFECTO, perfil);
    expect(s.estado).toBe("subir");
    expect(s.pesoKg).toBe(32);
  });
});

describe("ajuste serie a serie", () => {
  it("sube si sobran reps, baja si no llegas y mantiene si estás en rango", async () => {
    const { ajusteSiguienteSerie } = await import("../progression");
    const r = { repsMin: 6, repsMax: 8 };
    expect(ajusteSiguienteSerie(40, 10, null, r, 5)).toEqual({ pesoKg: 45, motivo: "te sobraron repeticiones" });
    expect(ajusteSiguienteSerie(40, 4, 0, r, 5).pesoKg).toBe(35);
    expect(ajusteSiguienteSerie(40, 7, 2, r, 5)).toEqual({ pesoKg: 40, motivo: null });
    expect(ajusteSiguienteSerie(40, 5, 3, r, 5).pesoKg).toBe(40); // no llegó pero con reservas: mismo peso
  });
});
