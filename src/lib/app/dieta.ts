import { db } from "@/lib/db/db";
import { guardar, nuevoId } from "@/lib/db/repo";
import type { Comida, TipoComida } from "@/lib/db/types";
import { NUTRIENTES_CERO, nutrientesDe, sumarNutrientes, type Nutrientes } from "@/lib/domain/nutrition/alimentos";
import type { ItemComida } from "@/lib/domain/nutrition/parser";
import { supabase, supabaseConfigurado } from "@/lib/sync/supabase";

export const TIPOS_COMIDA: { valor: TipoComida; etiqueta: string }[] = [
  { valor: "desayuno", etiqueta: "Desayuno" },
  { valor: "almuerzo", etiqueta: "Media mañana" },
  { valor: "comida", etiqueta: "Comida" },
  { valor: "merienda", etiqueta: "Merienda" },
  { valor: "cena", etiqueta: "Cena" },
  { valor: "otro", etiqueta: "Otro / picoteo" },
];

/** Tipo de comida por la hora del día. */
export function tipoPorHora(h: number): TipoComida {
  if (h < 11) return "desayuno";
  if (h < 13) return "almuerzo";
  if (h < 16.5) return "comida";
  if (h < 20) return "merienda";
  return "cena";
}

export function totales(comidas: Comida[]): Nutrientes {
  return comidas.length ? sumarNutrientes(...comidas.flatMap((c) => c.items)) : { ...NUTRIENTES_CERO };
}

/**
 * ¿Se puede usar la IA? Requiere sesión iniciada y que la cuenta esté autorizada en la
 * tabla public.ia_autorizados (la RLS solo deja ver la fila propia).
 */
export async function iaDisponible(): Promise<{ ok: boolean; motivo?: string }> {
  if (!supabaseConfigurado) return { ok: false, motivo: "La IA necesita Supabase configurado." };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, motivo: "Sin conexión." };
  const sb = supabase()!;
  const { data } = await sb.auth.getSession();
  const email = data.session?.user.email?.toLowerCase();
  if (!email) return { ok: false, motivo: "Inicia sesión en Ajustes → Cuenta para usar la IA." };
  const { data: fila, error } = await sb.from("ia_autorizados").select("email").eq("email", email).maybeSingle();
  if (error) return { ok: false, motivo: "No se pudo comprobar el acceso a la IA." };
  if (!fila) return { ok: false, motivo: "La IA no está activada para tu cuenta." };
  return { ok: true };
}

/** Reduce la foto (lado mayor ≤ 1280 px, JPEG) para que la subida sea rápida y barata. */
export async function comprimirImagen(archivo: Blob, ladoMax = 1280): Promise<{ base64: string; blob: Blob }> {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, ladoMax / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.82));
  const base64 = await new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1]);
    r.readAsDataURL(blob);
  });
  return { base64, blob };
}

interface RespuestaIA {
  es_comida: boolean;
  descripcion: string;
  items: Omit<ItemComida, "por100" | "alimentoId">[];
  notas: string;
  proveedor?: string;
  error?: string;
}

/** Analiza una foto y/o una descripción con Claude (función de Supabase `analizar-comida`). */
export async function analizarConIA(entrada: { texto?: string; imagenBase64?: string }): Promise<{
  items: ItemComida[];
  descripcion: string;
  notas: string;
}> {
  const sb = supabase();
  if (!sb) throw new Error("La IA necesita Supabase configurado.");
  const { data, error } = await sb.functions.invoke<RespuestaIA>("analizar-comida", {
    body: { texto: entrada.texto, imagen: entrada.imagenBase64, tipoImagen: "image/jpeg" },
  });
  if (error) {
    let mensaje = error.message;
    try {
      const cuerpo = await (error as { context?: Response }).context?.json();
      if (cuerpo?.error) mensaje = cuerpo.error;
    } catch {
      /* sin cuerpo */
    }
    throw new Error(mensaje);
  }
  if (!data) throw new Error("Respuesta vacía de la IA.");
  if (data.items.length === 0 || (!data.es_comida && entrada.imagenBase64)) {
    throw new Error(
      entrada.imagenBase64
        ? "No he visto comida en la imagen. Prueba otra foto o descríbelo."
        : "La IA no ha reconocido ningún alimento en el texto.",
    );
  }
  const items: ItemComida[] = data.items.map((it) => ({
    ...it,
    gramos: Math.max(1, Math.round(it.gramos)),
    por100: it.gramos > 0 ? nutrientesDe(it, (100 / it.gramos) * 100) : undefined,
  }));
  return { items, descripcion: data.descripcion, notas: data.proveedor ? `${data.notas} (Analizado con ${data.proveedor}.)` : data.notas };
}

export async function guardarComida(c: Omit<Comida, "updatedAt" | "_dirty" | "id"> & { id?: string }, foto?: Blob): Promise<void> {
  let fotoMediaId = c.fotoMediaId;
  if (foto) {
    fotoMediaId = fotoMediaId ?? nuevoId();
    await db().media.put({ id: fotoMediaId, blob: foto, tipo: foto.type, nombre: "comida.jpg" });
  }
  await guardar<Comida>("comidas", { ...c, id: c.id ?? nuevoId(), fotoMediaId });
}

/** Copia una comida a otro día a la hora actual. Devuelve el id nuevo (para deshacer). */
export async function repetirComida(c: Comida, fecha: string): Promise<string> {
  const d = new Date();
  const id = nuevoId();
  await guardarComida({
    id,
    fecha,
    hora: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    tipo: tipoPorHora(d.getHours() + d.getMinutes() / 60),
    descripcion: c.descripcion,
    items: c.items,
    fuente: c.fuente,
    notasIA: c.notasIA,
  });
  return id;
}
