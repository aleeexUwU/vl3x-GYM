import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Integración de la sincronización: base de datos local real (Dexie sobre fake-indexeddb)
 * contra un Supabase simulado que imita la tabla `registros` (upsert por usuario+colección+id,
 * marca del servidor y la regla de "no retroceder" del trigger).
 */

interface Fila {
  user_id: string;
  coleccion: string;
  id: string;
  datos: Record<string, unknown>;
  actualizado_en: number;
  borrado: boolean;
  modificado_servidor: string;
}

const servidor = new Map<string, Fila>();
let reloj = 0;
const marca = () => new Date(Date.UTC(2026, 9, 19, 0, 0, 0, ++reloj)).toISOString();

function consulta(filas: Fila[]) {
  let res = [...filas];
  const q = {
    select: () => q,
    gt: (col: keyof Fila, v: string) => ((res = res.filter((f) => String(f[col]) > v)), q),
    order: (col: keyof Fila) => ((res = res.sort((a, b) => String(a[col]).localeCompare(String(b[col])))), q),
    limit: (n: number) => ((res = res.slice(0, n)), q),
    then: (ok: (r: { data: Fila[]; error: null }) => unknown) => Promise.resolve(ok({ data: res, error: null })),
  };
  return q;
}

const clienteFalso = {
  auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
  from: () => ({
    ...consulta([...servidor.values()].filter((f) => f.user_id === "u1")),
    upsert: async (filas: Omit<Fila, "modificado_servidor">[]) => {
      for (const f of filas) {
        const k = `${f.user_id}|${f.coleccion}|${f.id}`;
        const previa = servidor.get(k);
        // Trigger registros_no_retroceder: no se pisa con datos más antiguos.
        if (previa && f.actualizado_en < previa.actualizado_en) continue;
        servidor.set(k, { ...f, modificado_servidor: marca() });
      }
      return { error: null };
    },
  }),
};

vi.mock("@/lib/sync/supabase", () => ({ supabase: () => clienteFalso, supabaseConfigurado: true }));

const almacen = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => almacen.get(k) ?? null,
  setItem: (k: string, v: string) => void almacen.set(k, v),
  removeItem: (k: string) => void almacen.delete(k),
  clear: () => almacen.clear(),
  key: () => null,
  length: 0,
};

const { db, COLECCIONES } = await import("@/lib/db/db");
const repo = await import("@/lib/db/repo");
const { sincronizar } = await import("@/lib/sync/sync");
const { guardarComida } = await import("@/lib/app/dieta");
const { guardarReceta } = await import("@/lib/app/recetas");
const { configurarMaquina } = await import("@/lib/app/gimnasio");

async function vaciarLocal() {
  await Promise.all(COLECCIONES.map((c) => db().table(c).clear()));
}

describe("todo se guarda en la base de datos (sincronización)", () => {
  beforeEach(async () => {
    servidor.clear();
    almacen.clear();
    await vaciarLocal();
  });

  it("cada tipo de dato de la app sube al servidor y queda marcado como sincronizado", async () => {
    await repo.escribirKv("perfil", { nombre: "Alex" } as never);
    await repo.escribirKv("ajustes", { seriesMinimas: 10, rangoReps: "pesado", dropset: true } as never);
    await repo.escribirKv("plan", { id: "p1", dias: [] } as never);
    await repo.escribirKv("evaluacionBrazo", { agarra: "no" } as never);
    await guardarReceta({ nombre: "Batido", items: [] });
    await configurarMaquina("prensa", { paso: 7, minimo: 7 });
    await repo.guardar("workouts", { id: "w1", fecha: "2026-10-19", estado: "completado", ejercicios: [] } as never);
    await repo.guardar("absSessions", { id: "a1", fecha: "2026-10-19", completado: true, items: [], duracionSeg: 600 } as never);
    await repo.guardar("armExercises", { id: "b1", nombre: "Muñeca", orden: 0 } as never);
    await repo.guardar("armSessions", { id: "s1", fecha: "2026-10-19" } as never);
    await repo.guardar("bodyweights", { id: "pw1", fecha: "2026-10-19", kg: 70 } as never);
    await repo.guardar("notas", { id: "prensa", texto: "Asiento 4" } as never);
    await guardarComida({ fecha: "2026-10-19", hora: "14:00", tipo: "comida", descripcion: "Pollo", items: [], fuente: "manual" });

    await sincronizar();

    const enServidor = new Set([...servidor.values()].map((f) => `${f.coleccion}/${f.id}`));
    for (const id of ["perfil", "ajustes", "plan", "evaluacionBrazo", "recetas", "pesosMaquina"]) expect(enServidor, id).toContain(`kv/${id}`);
    for (const [c, id] of [
      ["workouts", "w1"],
      ["absSessions", "a1"],
      ["armExercises", "b1"],
      ["armSessions", "s1"],
      ["bodyweights", "pw1"],
      ["notas", "prensa"],
    ]) {
      expect(enServidor, c).toContain(`${c}/${id}`);
    }
    expect([...servidor.values()].some((f) => f.coleccion === "comidas" && f.datos.descripcion === "Pollo")).toBe(true);
    // Todas las colecciones sincronizables tienen algo en el servidor.
    for (const c of COLECCIONES) expect([...servidor.values()].some((f) => f.coleccion === c), c).toBe(true);
    // Y en local ya no queda nada pendiente.
    for (const c of COLECCIONES) expect(await db().table(c).where("_dirty").equals(1).count(), c).toBe(0);
  });

  it("un dispositivo nuevo descarga todo lo que hay en la cuenta", async () => {
    await repo.escribirKv("perfil", { nombre: "Alex" } as never);
    await repo.guardar("workouts", { id: "w1", fecha: "2026-10-19", estado: "completado", ejercicios: [] } as never);
    await guardarComida({ fecha: "2026-10-18", hora: "21:00", tipo: "cena", descripcion: "Cena", items: [], fuente: "manual" });
    await sincronizar();

    // "Otro móvil": base local vacía y sin cursor.
    await vaciarLocal();
    almacen.clear();
    await sincronizar();

    expect(await repo.leerKv("perfil")).toEqual({ nombre: "Alex" });
    expect(await db().table("workouts").get("w1")).toBeTruthy();
    expect((await db().table("comidas").toArray()).map((c) => c.descripcion)).toEqual(["Cena"]);
  });

  it("gana el cambio más reciente y los borrados también se sincronizan", async () => {
    await repo.guardar("bodyweights", { id: "pw1", fecha: "2026-10-19", kg: 70 } as never);
    await sincronizar();
    // Cambio en "otro dispositivo" (más reciente) directamente en el servidor.
    const k = "u1|bodyweights|pw1";
    servidor.set(k, { ...servidor.get(k)!, datos: { id: "pw1", fecha: "2026-10-19", kg: 71 }, actualizado_en: Date.now() + 60_000, modificado_servidor: marca() });
    await sincronizar();
    expect((await db().table("bodyweights").get("pw1"))?.kg).toBe(71);

    await repo.borrar("bodyweights", "pw1");
    await sincronizar();
    // El borrado local es más reciente que la versión del servidor solo si su reloj lo es:
    // aquí el del servidor iba 1 min adelantado, así que se respeta el del servidor.
    expect(servidor.get(k)!.borrado).toBe(false);

    await repo.guardar("bodyweights", { id: "pw2", fecha: "2026-10-20", kg: 70.5 } as never);
    await sincronizar();
    await repo.borrar("bodyweights", "pw2");
    await sincronizar();
    expect(servidor.get("u1|bodyweights|pw2")!.borrado).toBe(true);
  });
});
