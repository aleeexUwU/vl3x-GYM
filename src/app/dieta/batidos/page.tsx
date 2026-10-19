"use client";

import { CupSoda, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { anadirConDeshacer, resumenReceta } from "@/components/dieta/batidos-rapidos";
import { Button } from "@/components/ui/button";
import { Cargando, Glass, PageHeader } from "@/components/ui-kit";
import { useRecetas } from "@/lib/db/hooks";
import { hoyISO } from "@/lib/domain/dates";

export default function Batidos() {
  const recetas = useRecetas();
  if (!recetas) return <Cargando />;

  return (
    <div className="space-y-5">
      <PageHeader titulo="Mis batidos" subtitulo="Y cualquier receta que repitas. Se añaden a hoy con un toque." />

      <Button asChild className="h-14 w-full rounded-2xl text-base font-semibold">
        <Link href="/dieta/batidos/editar/">
          <Plus /> Nuevo batido
        </Link>
      </Button>

      {recetas.length === 0 && (
        <Glass className="flex flex-col items-center gap-3 py-8 text-center">
          <CupSoda className="size-10 text-primary" aria-hidden />
          <p className="max-w-[30ch] text-sm text-muted-foreground">
            Escribe lo que le echas a tu batido, la IA calcula las calorías y los macros, y lo guardas con un nombre.
          </p>
        </Glass>
      )}

      <ul className="space-y-2">
        {recetas.map((r) => {
          const { kcal, proteinas } = resumenReceta(r);
          return (
            <li key={r.id}>
              <Glass className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-xl leading-tight tracking-wide">{r.nombre}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">
                    <strong className="text-foreground">{kcal} kcal</strong> · {proteinas} g proteína · {r.items.length} {r.items.length === 1 ? "ingrediente" : "ingredientes"}
                    {r.usos > 0 && ` · usado ${r.usos} ${r.usos === 1 ? "vez" : "veces"}`}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{r.items.map((i) => i.nombre).join(", ")}</p>
                </div>
                <Button asChild variant="ghost" size="icon" aria-label={`Editar ${r.nombre}`}>
                  <Link href={`/dieta/batidos/editar/?id=${r.id}`}>
                    <Pencil />
                  </Link>
                </Button>
                <Button className="h-11 rounded-xl" onClick={() => anadirConDeshacer(r, hoyISO())}>
                  <Plus /> Hoy
                </Button>
              </Glass>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
