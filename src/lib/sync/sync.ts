import { COLECCIONES, db, type Coleccion } from "@/lib/db/db";
import { onCambioLocal } from "@/lib/db/repo";
import type { SyncMeta } from "@/lib/db/types";
import { supabase } from "./supabase";

/**
 * Sincronización offline-first con Supabase.
 * - Local (IndexedDB) es la fuente de verdad: todo se guarda al instante sin red.
 * - Cada fila local lleva updatedAt y _dirty. Al sincronizar primero se BAJAN los
 *   cambios del servidor (gana el updatedAt más reciente) y luego se SUBEN los pendientes.
 * - En Supabase todo vive en la tabla `registros` (ver supabase/migrations), con RLS por usuario.
 */

const CURSOR_KEY = "gym-sync-cursor";
const TABLA = "registros";

export type EstadoSync =
  | { tipo: "local" }
  | { tipo: "sin_sesion" }
  | { tipo: "sincronizando" }
  | { tipo: "ok"; cuando: number }
  | { tipo: "error"; mensaje: string };

let estado: EstadoSync = { tipo: "local" };
const subs = new Set<(e: EstadoSync) => void>();

function setEstado(e: EstadoSync) {
  estado = e;
  subs.forEach((fn) => fn(e));
}

export function estadoSync(): EstadoSync {
  return estado;
}

export function suscribirSync(fn: (e: EstadoSync) => void): () => void {
  subs.add(fn);
  fn(estado);
  return () => subs.delete(fn);
}

interface FilaRemota {
  coleccion: Coleccion;
  id: string;
  datos: Record<string, unknown>;
  actualizado_en: number;
  borrado: boolean;
  modificado_servidor: string;
}

let enCurso: Promise<void> | null = null;

export async function sincronizar(): Promise<void> {
  if (enCurso) return enCurso;
  enCurso = (async () => {
    const sb = supabase();
    if (!sb) return setEstado({ tipo: "local" });
    const { data: sesion } = await sb.auth.getSession();
    const uid = sesion.session?.user.id;
    if (!uid) return setEstado({ tipo: "sin_sesion" });
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    setEstado({ tipo: "sincronizando" });
    try {
      await bajar(uid);
      await subir(uid);
      setEstado({ tipo: "ok", cuando: Date.now() });
    } catch (e) {
      setEstado({ tipo: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  })().finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function bajar(uid: string) {
  const sb = supabase()!;
  const cursorKey = `${CURSOR_KEY}:${uid}`;
  let cursor = localStorage.getItem(cursorKey) ?? "1970-01-01T00:00:00Z";
  for (;;) {
    const { data, error } = await sb
      .from(TABLA)
      .select("coleccion,id,datos,actualizado_en,borrado,modificado_servidor")
      .gt("modificado_servidor", cursor)
      .order("modificado_servidor", { ascending: true })
      .limit(500);
    if (error) throw error;
    const filas = (data ?? []) as FilaRemota[];
    if (filas.length === 0) break;
    for (const f of filas) {
      if (!COLECCIONES.includes(f.coleccion)) continue;
      const tabla = db().table(f.coleccion);
      const local = (await tabla.get(f.id)) as SyncMeta | undefined;
      if (!local || f.actualizado_en > local.updatedAt) {
        await tabla.put({ ...f.datos, id: f.id, updatedAt: f.actualizado_en, _dirty: 0, _deleted: f.borrado || undefined });
      }
    }
    cursor = filas[filas.length - 1].modificado_servidor;
    localStorage.setItem(cursorKey, cursor);
    if (filas.length < 500) break;
  }
}

async function subir(uid: string) {
  const sb = supabase()!;
  for (const col of COLECCIONES) {
    const tabla = db().table(col);
    const pendientes = (await tabla.where("_dirty").equals(1).toArray()) as (SyncMeta & Record<string, unknown>)[];
    if (pendientes.length === 0) continue;
    const filas = pendientes.map((p) => {
      const { _dirty, _deleted, updatedAt, ...datos } = p;
      void _dirty;
      return { user_id: uid, coleccion: col, id: p.id, datos, actualizado_en: updatedAt, borrado: !!_deleted };
    });
    for (let i = 0; i < filas.length; i += 200) {
      const lote = filas.slice(i, i + 200);
      const { error } = await sb.from(TABLA).upsert(lote, { onConflict: "user_id,coleccion,id" });
      if (error) throw error;
    }
    // Solo se limpia si no ha cambiado mientras subíamos.
    await db().transaction("rw", tabla, async () => {
      for (const p of pendientes) {
        const actual = (await tabla.get(p.id)) as SyncMeta | undefined;
        if (actual && actual.updatedAt === p.updatedAt) await tabla.update(p.id, { _dirty: 0 });
      }
    });
  }
}

let temporizador: ReturnType<typeof setTimeout> | null = null;

/** Cada cuánto se miran cambios de otros dispositivos mientras la app está a la vista. */
const INTERVALO_MS = 30_000;

/**
 * Sincroniza al abrir, tras cambios locales, al recuperar la red, al volver a la app
 * (una PWA en el móvil casi nunca se cierra del todo) y cada 30 s mientras está visible.
 */
export function iniciarSyncAutomatica(): () => void {
  const programar = () => {
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => void sincronizar(), 2500);
  };
  const quitar = onCambioLocal(programar);
  const online = () => void sincronizar();
  window.addEventListener("online", online);
  const visible = () => {
    if (document.visibilityState === "visible") void sincronizar();
  };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("focus", visible);
  window.addEventListener("pageshow", visible);
  const intervalo = setInterval(visible, INTERVALO_MS);
  const sb = supabase();
  const sub = sb?.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_IN" || evento === "TOKEN_REFRESHED") void sincronizar();
    if (evento === "SIGNED_OUT") setEstado({ tipo: "sin_sesion" });
  });
  void sincronizar();
  return () => {
    quitar();
    window.removeEventListener("online", online);
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("focus", visible);
    window.removeEventListener("pageshow", visible);
    clearInterval(intervalo);
    sub?.data.subscription.unsubscribe();
  };
}
