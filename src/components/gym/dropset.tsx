"use client";

import { ArrowDownToLine } from "lucide-react";
import { useState } from "react";
import { Stepper } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";

/**
 * Dropset tras la última serie: sin descansar, baja el peso (~25 %) y sigue hasta el
 * fallo técnico. Se apunta aparte: no cuenta para calcular la progresión del ejercicio.
 */
export function Dropset({
  pesoSugerido,
  paso,
  onHecho,
  onSaltar,
}: {
  pesoSugerido: number;
  paso: number;
  onHecho: (pesoKg: number, reps: number) => void;
  onSaltar: () => void;
}) {
  const [peso, setPeso] = useState<number | null>(pesoSugerido);
  const [reps, setReps] = useState<number | null>(8);
  return (
    <div className="space-y-3 rounded-2xl border border-primary/50 bg-primary/10 p-3 neon-border" role="region" aria-label="Dropset">
      <p className="flex items-center gap-2 font-heading text-xl tracking-wide text-primary">
        <ArrowDownToLine className="size-5" aria-hidden /> Dropset
      </p>
      <p className="text-sm">
        Sin descansar: baja a <strong>{String(pesoSugerido).replace(".", ",")} kg</strong> y sigue hasta que no puedas hacer otra con
        buena técnica.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Stepper etiqueta="Peso" sufijo="kg" paso={paso} valor={peso} onChange={setPeso} />
        <Stepper etiqueta="Reps" paso={1} decimales={0} valor={reps} onChange={setReps} />
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" className="h-12 rounded-2xl" onClick={onSaltar}>
          Saltar
        </Button>
        <Button className="h-12 flex-1 rounded-2xl text-base font-semibold" disabled={!peso || !reps} onClick={() => onHecho(peso!, reps!)}>
          Dropset hecho
        </Button>
      </div>
    </div>
  );
}
