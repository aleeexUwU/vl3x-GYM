"use client";

import createBodyHighlighter, { type IExerciseData } from "body-highlighter";
import { Crown } from "lucide-react";
import { useEffect, useRef } from "react";
import { Glass, SectionTitle } from "@/components/ui-kit";
import { ejercicio } from "@/lib/domain/exercises";
import { GRUPO_NOMBRE } from "@/lib/domain/muscles";
import { RANGOS, requisitoSiguiente, type Nivel, type Rango, type Rangos } from "@/lib/domain/rangos";
import type { MuscleGroup } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

/** Color de cada rango (también va el nombre escrito: el color nunca es la única pista). */
export const COLOR_RANGO: Record<Rango, string> = {
  Hierro: "rgb(122, 118, 120)",
  Bronce: "rgb(176, 113, 58)",
  Plata: "rgb(199, 204, 209)",
  Oro: "rgb(226, 178, 58)",
  Platino: "rgb(111, 209, 201)",
  Diamante: "rgb(122, 168, 255)",
  Élite: "rgb(232, 52, 74)",
};

export function InsigniaRango({ nivel, grande = false, className }: { nivel: Nivel; grande?: boolean; className?: string }) {
  const color = COLOR_RANGO[nivel.rango];
  return (
    <span
      className={cn(
        "boton-tinta inline-flex items-center gap-1.5 rounded-full border font-semibold",
        grande ? "px-3.5 py-1.5 text-base" : "px-2 py-0.5 text-xs",
        className,
      )}
      style={{ borderColor: color, color, background: `color-mix(in oklab, ${color} 14%, transparent)` }}
    >
      <Crown className={grande ? "size-4" : "size-3"} aria-hidden /> {nivel.rango}
    </span>
  );
}

export function BarraRango({ nivel }: { nivel: Nivel }) {
  const siguiente = RANGOS[nivel.indice + 1];
  return (
    <div className="space-y-1">
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="meter" aria-valuenow={Math.round(nivel.progreso * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={siguiente ? `Progreso hacia ${siguiente}` : "Rango máximo"}>
        <div className="h-full rounded-full" style={{ width: `${nivel.progreso * 100}%`, background: COLOR_RANGO[nivel.rango] }} />
      </div>
      <p className="text-[11px] text-muted-foreground">{siguiente ? `${Math.round(nivel.progreso * 100)} % hacia ${siguiente}` : "Rango máximo"}</p>
    </div>
  );
}

const ZONAS: Partial<Record<MuscleGroup, string[]>> = {
  pecho: ["chest"],
  dorsal: ["upper-back"],
  espalda_alta: ["trapezius"],
  hombro_anterior: ["front-deltoids"],
  hombro_lateral: ["front-deltoids", "back-deltoids"],
  hombro_posterior: ["back-deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  antebrazo: ["forearm"],
  cuadriceps: ["quadriceps"],
  isquios: ["hamstring"],
  gluteos: ["gluteal"],
  aductores: ["adductor"],
  abductores: ["abductors"],
  gemelos: ["calves"],
  lumbar: ["lower-back"],
};

/** Cuerpo coloreado por rango de cada músculo (body-highlighter, MIT). */
function MapaRangos({ musculos }: { musculos: Rangos["musculos"] }) {
  const frente = useRef<HTMLDivElement>(null);
  const espalda = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // La librería colorea por "frecuencia": se repite cada zona tantas veces como su rango + 1.
    const porZona = new Map<string, number>();
    for (const [g, n] of Object.entries(musculos)) {
      for (const z of ZONAS[g as MuscleGroup] ?? []) porZona.set(z, Math.max(porZona.get(z) ?? 0, n!.indice + 1));
    }
    const data: IExerciseData[] = [];
    for (const [z, veces] of porZona) {
      for (let i = 0; i < veces; i++) data.push({ name: `${z}-${i}`, muscles: [z] as IExerciseData["muscles"] });
    }
    const hs = (
      [
        [frente.current, "anterior"],
        [espalda.current, "posterior"],
      ] as const
    ).flatMap(([el, tipo]) =>
      el
        ? [
            createBodyHighlighter({
              container: el,
              data,
              type: tipo,
              bodyColor: "rgb(58, 52, 54)",
              highlightedColors: RANGOS.map((r) => COLOR_RANGO[r]),
              style: { width: "100%", height: "100%" },
            }),
          ]
        : [],
    );
    return () => hs.forEach((h) => h.destroy());
  }, [musculos]);
  return (
    <div className="grid grid-cols-2 gap-2" role="img" aria-label="Mapa del cuerpo coloreado por rango de cada músculo">
      <div ref={frente} className="mx-auto aspect-[1/2] w-full max-w-36" />
      <div ref={espalda} className="mx-auto aspect-[1/2] w-full max-w-36" />
    </div>
  );
}

export function PanelRangos({ rangos }: { rangos: Rangos }) {
  if (!rangos.general) {
    return (
      <Glass>
        <SectionTitle>Rangos</SectionTitle>
        <p className="text-sm text-muted-foreground">Completa alguna sesión con peso y aquí verás el rango de cada músculo y ejercicio.</p>
      </Glass>
    );
  }
  const musculos = Object.entries(rangos.musculos).sort((a, b) => b[1]!.puntuacion - a[1]!.puntuacion) as [MuscleGroup, Nivel][];
  return (
    <div className="space-y-4">
      <Glass className="space-y-3">
        <SectionTitle>Tu rango</SectionTitle>
        <div className="flex items-center gap-3">
          <InsigniaRango nivel={rangos.general} grande />
          <div className="flex-1">
            <BarraRango nivel={rangos.general} />
          </div>
        </div>
        <MapaRangos musculos={rangos.musculos} />
        <ul className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground" aria-label="Leyenda de rangos">
          {RANGOS.map((r) => (
            <li key={r} className="flex items-center gap-1">
              <span className="size-2.5 rounded-full" style={{ background: COLOR_RANGO[r] }} aria-hidden /> {r}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Todo el mundo empieza en Hierro. Subes con constancia y mejora real: cuánto ha crecido tu fuerza (1RM estimado) en
          cada ejercicio desde la primera vez y cuántas sesiones llevas con él.
        </p>
      </Glass>
      <Glass className="space-y-2">
        <SectionTitle>Por músculo</SectionTitle>
        <ul className="divide-y divide-border">
          {musculos.map(([g, n]) => (
            <li key={g} className="flex items-center gap-3 py-2">
              <span className="w-32 shrink-0 text-sm">{GRUPO_NOMBRE[g]}</span>
              <div className="min-w-0 flex-1">
                <BarraRango nivel={n} />
              </div>
              <InsigniaRango nivel={n} />
            </li>
          ))}
        </ul>
      </Glass>
      <Glass className="space-y-2">
        <SectionTitle>Por ejercicio</SectionTitle>
        <ul className="divide-y divide-border">
          {rangos.ejercicios.map((r) => (
            <li key={r.exerciseId} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{ejercicio(r.exerciseId).nombre}</span>
                <span className="block text-[11px] tabular-nums text-muted-foreground">
                  1RM estimado {Math.round(r.fuerza)} kg · {r.mejora >= 1 ? "+" : ""}
                  {Math.round((r.mejora - 1) * 100)} % · {r.sesiones} {r.sesiones === 1 ? "sesión" : "sesiones"}
                </span>
                {requisitoSiguiente(r, r.mejora, r.sesiones) && (
                  <span className="block text-[11px] text-muted-foreground">Para {requisitoSiguiente(r, r.mejora, r.sesiones)}</span>
                )}
              </span>
              <InsigniaRango nivel={r} />
            </li>
          ))}
        </ul>
      </Glass>
    </div>
  );
}
