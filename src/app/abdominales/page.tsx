"use client";

import { CheckCircle2, Clock, Flame, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import { Calendario } from "@/components/calendar";
import { GraficaLineas } from "@/components/charts-diferidos";
import { ExerciseImage } from "@/components/exercise/exercise-image";
import { ReminderCard } from "@/components/reminder-card";
import { Button } from "@/components/ui/button";
import { Cargando, Glass, PageHeader, SectionTitle, Stat } from "@/components/ui-kit";
import { filtroCasa } from "@/lib/app/planificacion";
import { clavesHechas, fechasDe } from "@/lib/app/resumen";
import { useAbsSessions, useAjustes, useEvaluacionBrazo, usePerfil } from "@/lib/db/hooks";
import { CATEGORIA_NOMBRE, rutinaAbdominales } from "@/lib/domain/abs-routine";
import { hoyISO } from "@/lib/domain/dates";
import { tieneManoLimitada } from "@/lib/domain/limitations";
import { ejercicio } from "@/lib/domain/exercises";
import { mejorRacha, racha } from "@/lib/domain/weekly-plan";

export default function Abdominales() {
  const perfil = usePerfil();
  const ajustes = useAjustes();
  const ev = useEvaluacionBrazo();
  const sesiones = useAbsSessions();
  if (!perfil || !ajustes || !sesiones || ev === undefined) return <Cargando />;

  const hoy = hoyISO();
  const rutina = rutinaAbdominales(hoy, ajustes.inicioAbdominales, filtroCasa(perfil, ajustes, ev), sesiones.filter((s) => !s._deleted));
  const claves = clavesHechas([], sesiones, []);
  const fechas = fechasDe(claves, "abdominales");
  const hechoHoy = claves.has(`${hoy}|abdominales`);
  const actual = racha(fechas, hoy);
  // Mejor marca al fallo de cada día.
  const porDia = new Map<string, number>();
  for (const s of sesiones) if (!s._deleted && s.fallo) porDia.set(s.fecha, Math.max(porDia.get(s.fecha) ?? 0, s.fallo.reps));
  const fallos = [...porDia].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, reps]) => ({ fecha, reps }));

  return (
    <div className="space-y-5">
      <PageHeader titulo="Core en casa" subtitulo="10–15 min al día · sin material" />

      <div className="grid grid-cols-3 gap-2">
        <Stat etiqueta="Racha" valor={<span className="flex items-center gap-1"><Flame className="size-5 text-warn" />{actual}</span>} detalle="días" color="warn" />
        <Stat etiqueta="Mejor" valor={mejorRacha(fechas)} detalle="días" color="violet" />
        <Stat etiqueta="Total" valor={fechas.length} detalle="sesiones" color="lime" />
      </div>

      <Glass className={hechoHoy ? "" : "neon-border"}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Hoy · semana {rutina.semana + 1}
            </p>
            <p className="font-heading text-2xl tracking-wide">
              {hechoHoy ? (
                <span className="flex items-center gap-1.5 text-lime">
                  <CheckCircle2 className="size-5" /> ¡Hecho hoy!
                </span>
              ) : (
                "Rutina del día"
              )}
            </p>
          </div>
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="size-4" /> ~{rutina.duracionEstimadaMin} min
          </span>
        </div>
        <ol className="space-y-2">
          {rutina.items.map((it) => {
            const e = ejercicio(it.exerciseId);
            return (
              <li key={it.exerciseId} className="flex items-center gap-3 rounded-2xl bg-secondary/50 p-2">
                <ExerciseImage ejercicio={e} animar={false} className="size-14 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium leading-tight">{e.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {CATEGORIA_NOMBRE[it.categoria]} · {it.series} × {it.objetivo}
                    {it.medida === "segundos" ? " s" : " reps"}
                    {it.nivel > 0 && ` · nivel ${it.nivel + 1}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
        <Button asChild className="mt-4 h-14 w-full rounded-2xl text-base font-semibold" variant={hechoHoy ? "secondary" : "default"}>
          <Link href="/abdominales/sesion/">{hechoHoy ? <><RotateCcw /> Repetir</> : <><Play /> Empezar</>}</Link>
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Se adapta a lo que haces: si completas todas las series sube, si te falta poco repite y si fallas dos días
          baja. Dos días completos en el tope y pasas a una variante más difícil. Al final, crunches al fallo.
          {tieneManoLimitada(perfil.limitaciones) && " Sin apoyar peso en la mano izquierda."}
        </p>
      </Glass>

      {fallos.length > 0 && (
        <Glass>
          <SectionTitle>Crunches al fallo</SectionTitle>
          <p className="mb-2 text-sm text-muted-foreground">
            Última: <strong className="text-foreground tabular-nums">{fallos.at(-1)!.reps}</strong> · récord{" "}
            <strong className="text-foreground tabular-nums">{Math.max(...fallos.map((f) => f.reps))}</strong>
            {fallos.length > 1 && ` · primera ${fallos[0].reps}`}
          </p>
          {fallos.length > 1 && <GraficaLineas datos={fallos} x="fecha" series={[{ clave: "reps", nombre: "Crunches", color: "1" }]} unidad="reps" alto={180} ajustarEje />}
        </Glass>
      )}

      <Glass>
        <SectionTitle>Calendario</SectionTitle>
        <Calendario hechas={claves} tipos={["abdominales"]} />
      </Glass>

      <Glass>
        <ReminderCard ajustes={ajustes} />
      </Glass>
    </div>
  );
}
