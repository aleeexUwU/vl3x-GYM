"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRightLeft,
  BatteryLow,
  BookOpen,
  CalendarDays,
  ChevronDown,
  Clock,
  Info,
  Play,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { CoverageBars } from "@/components/coverage-bars";
import { ExerciseImage } from "@/components/exercise/exercise-image";
import { TecnicaSheet } from "@/components/exercise/technique";
import { CalendarioGimnasio } from "@/components/gym/calendario-gimnasio";
import { SustituirDialog } from "@/components/gym/sustituir-dialog";
import { Button } from "@/components/ui/button";
import { Aviso, Cargando, Glass, PageHeader, SectionTitle } from "@/components/ui-kit";
import { Logo } from "@/components/kakugan";
import { AvisoSync } from "@/components/aviso-sync";
import { ResumenHoy } from "@/components/resumen-hoy";
import { InsigniaRango } from "@/components/rangos";
import { calcularRangos } from "@/lib/domain/rangos";
import { WeekStrip } from "@/components/week-strip";
import { enDescarga, iniciarWorkout, logsDeWorkouts, semanaPrograma } from "@/lib/app/gimnasio";
import {
  entradaGenerador,
  guardarAjustes,
  marcarDolorEnPlan,
  regenerarPlan,
  sustituirEnPlanGuardado,
} from "@/lib/app/planificacion";
import { clavesHechas } from "@/lib/app/resumen";
import { useAbsSessions, useAjustes, useArmSessions, useEvaluacionBrazo, usePerfil, usePlan, useWorkouts } from "@/lib/db/hooks";
import { diaSemana, formatoFecha, hoyISO, inicioSemana, NOMBRE_DIA, sumarDias } from "@/lib/domain/dates";
import { ejercicio } from "@/lib/domain/exercises";
import { VERSION_PLAN } from "@/lib/domain/generator";
import { tieneManoLimitada } from "@/lib/domain/limitations";
import { evaluarDescarga } from "@/lib/domain/progression";
import type { PlanDay } from "@/lib/domain/types";
import { planSemanal } from "@/lib/domain/weekly-plan";
import { cn } from "@/lib/utils";

export default function Gimnasio() {
  const router = useRouter();
  const perfil = usePerfil();
  const ajustes = useAjustes();
  const plan = usePlan();
  const ev = useEvaluacionBrazo();
  const workouts = useWorkouts();
  const abs = useAbsSessions();
  const brazo = useArmSessions();
  const [tecnica, setTecnica] = useState<string | null>(null);
  const [sustituir, setSustituir] = useState<{ id: string; dia: PlanDay } | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [calendario, setCalendario] = useState(false);

  // Un plan de una versión anterior del generador se rehace con las reglas nuevas.
  const regenerando = useRef(false);
  useEffect(() => {
    if (!plan || (plan.version ?? 1) >= VERSION_PLAN || regenerando.current) return;
    regenerando.current = true;
    regenerarPlan()
      .then(() => toast.success("Rutina actualizada: máquinas guiadas primero y más trabajo de torso."))
      .catch(() => {
        regenerando.current = false;
      });
  }, [plan]);

  const hoy = hoyISO();
  const lunes = inicioSemana(hoy);
  const casa = useMemo(
    () => (perfil && ajustes ? entradaGenerador(perfil, ajustes, ev).coberturaCasa : undefined),
    [perfil, ajustes, ev],
  );

  if (!perfil || !ajustes || plan === undefined || !workouts) return <Cargando />;

  if (!plan) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Gimnasio" />
        <Aviso>Aún no hay rutina generada.</Aviso>
        <Button className="h-14 w-full rounded-2xl" onClick={() => regenerarPlan()}>
          Generar rutina
        </Button>
      </div>
    );
  }

  const semanas = semanaPrograma(ajustes, hoy);
  const descargaActiva = enDescarga(ajustes, hoy);
  const descarga = evaluarDescarga(hoy, ajustes, logsDeWorkouts(workouts));
  const actividades = planSemanal(lunes, plan, ajustes, ajustes.diasBrazo);
  const hechas = clavesHechas(workouts, abs, brazo);
  const diaHoy = plan.dias.find((d) => d.diaSemana === diaSemana(hoy));
  const enCurso = workouts.find((w) => w.estado === "en_curso");
  const proximo = diaHoy ?? siguienteDia(plan.dias, hoy);
  const hechoHoy = hechas.has(`${hoy}|gimnasio`);

  async function empezar(dia: PlanDay) {
    const id = await iniciarWorkout(dia, perfil!, ajustes!);
    router.push(`/gimnasio/sesion/?id=${id}`);
  }

  return (
    <div className="space-y-5 lg:grid lg:items-start lg:gap-10 lg:space-y-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* PC: a la izquierda el día de hoy; a la derecha la rutina. */}
      <div className="space-y-5">
        <header className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <div className="flex gap-2">
            <Button variant="outline" size="icon-lg" className="rounded-2xl" aria-label="Historial de entrenos" onClick={() => setCalendario(true)}>
              <CalendarDays />
            </Button>
            <Button asChild variant="outline" size="icon-lg" className="rounded-2xl" aria-label="Biblioteca de ejercicios">
              <Link href="/ejercicios/">
                <BookOpen />
              </Link>
            </Button>
          </div>
        </header>

        <div>
          <p className="text-sm text-muted-foreground">
            {(() => {
              const f = formatoFecha(hoy, { weekday: "long", day: "numeric", month: "long" });
              return f.charAt(0).toUpperCase() + f.slice(1);
            })()}
          </p>
          <h1 className="glitch font-display text-5xl leading-none" data-text={perfil.nombre ? `Hola, ${perfil.nombre}` : "Hoy"}>
            {perfil.nombre ? `Hola, ${perfil.nombre}` : "Hoy"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Semana {semanas + 1} de entreno{semanas === 0 && ": calibrando tus pesos"}
          </p>
          {(() => {
            const general = calcularRangos(logsDeWorkouts(workouts)).general;
            return general ? (
              <Link href="/progreso/?tab=rangos" className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground" aria-label={`Rango general: ${general.rango}. Ver rangos`}>
                <InsigniaRango nivel={general} /> {Math.round(general.progreso * 100)} % hacia el siguiente
              </Link>
            ) : null;
          })()}
      </div>

      <AvisoSync />
      <ResumenHoy />

      <WeekStrip desde={lunes} actividades={actividades} hechas={hechas} />

      {enCurso && (
        <Glass className="neon-border">
          <p className="text-sm text-muted-foreground">Sesión en curso</p>
          <p className="font-heading text-2xl tracking-wide">{enCurso.nombre}</p>
          <Button asChild className="mt-3 h-14 w-full rounded-2xl text-base font-semibold">
            <Link href={`/gimnasio/sesion/?id=${enCurso.id}`}>
              <Play /> Continuar
            </Link>
          </Button>
        </Glass>
      )}

      {!enCurso && proximo && (
        <Glass className={cn(diaHoy && !hechoHoy && "neon-border")}>
          <p className="text-sm text-muted-foreground">
            {diaHoy ? (hechoHoy ? "Hoy · ¡hecho! 💪" : "Hoy toca") : `Próximo: ${NOMBRE_DIA[proximo.diaSemana]}`}
          </p>
          <p className="font-heading text-2xl tracking-wide">{proximo.nombre}</p>
          <p className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span>{proximo.ejercicios.length} ejercicios</span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> ~{proximo.duracionEstimadaMin} min
            </span>
          </p>
          <Button className="mt-4 h-14 w-full rounded-2xl text-base font-semibold" onClick={() => empezar(proximo)}>
            <Play /> {diaHoy ? "Empezar sesión" : "Entrenar este día ahora"}
          </Button>
        </Glass>
      )}

      {descargaActiva && (
        <Aviso tipo="info">
          <div className="flex gap-2">
            <BatteryLow className="mt-0.5 size-4 shrink-0 text-primary" />
            <p>
              <strong>Semana de descarga</strong> hasta el {ajustes.descargaHasta}: mitad de series, 90 % del peso y más reps
              en reserva.
            </p>
          </div>
        </Aviso>
      )}
      {!descargaActiva && descarga.sugerir && (
        <Aviso tipo="warn">
          <div className="flex gap-2">
            <BatteryLow className="mt-0.5 size-4 shrink-0 text-warn" />
            <div className="space-y-2">
              <p>{descarga.motivo}</p>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  className="rounded-xl"
                  onClick={async () => {
                    await guardarAjustes({ descargaHasta: sumarDias(hoy, 6), ultimaDescarga: hoy });
                    toast.success("Semana de descarga activada");
                  }}
                >
                  Empezar descarga
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => guardarAjustes({ ultimaDescarga: sumarDias(hoy, -7 * (ajustes.semanasDescarga - 1)) })}
                >
                  En una semana
                </Button>
              </div>
            </div>
          </div>
        </Aviso>
      )}

      {plan.avisos.length > 0 && (
        <div className="space-y-2">
          {plan.avisos.map((a) => (
            <Aviso key={a} tipo={a.includes("último recurso") || a.includes("Sin volumen") ? "warn" : "info"}>
              <div className="flex gap-2">
                <Info className="mt-0.5 size-4 shrink-0" />
                <p>{a}</p>
              </div>
            </Aviso>
          ))}
        </div>
      )}

      </div>
      <div className="space-y-5">
        <section>
          <SectionTitle
            accion={
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={async () => {
                  await regenerarPlan();
                  toast.success("Rutina regenerada. El historial se mantiene.");
                }}
              >
                <RefreshCw /> Regenerar
              </Button>
            }
          >
            Tu rutina
          </SectionTitle>
          <div className="space-y-3">
            {plan.dias.map((d) => {
              const open = abierto === d.id;
              return (
                <Glass key={d.id} className="p-0">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    aria-expanded={open}
                    onClick={() => setAbierto(open ? null : d.id)}
                  >
                    <span>
                      <span className="block text-xs text-primary">{NOMBRE_DIA[d.diaSemana]}</span>
                      <span className="block font-heading text-xl tracking-wide">{d.nombre}</span>
                      <span className="block text-xs text-muted-foreground">
                        {d.ejercicios.length} ejercicios · {d.ejercicios.reduce((t, e) => t + e.series, 0)} series · ~
                        {d.duracionEstimadaMin} min
                      </span>
                    </span>
                    <ChevronDown className={cn("size-5 shrink-0 transition-transform", open && "rotate-180")} />
                  </button>
                  {open && (
                    <motion.ol initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 px-3 pb-3">
                      {d.ejercicios.map((pe, i) => {
                        const e = ejercicio(pe.exerciseId);
                        return (
                          <li key={pe.exerciseId} className="rounded-2xl bg-secondary/50 p-2">
                            <div className="flex gap-3">
                              <button type="button" onClick={() => setTecnica(e.id)} aria-label={`Ver técnica de ${e.nombre}`}>
                                <ExerciseImage ejercicio={e} animar={false} className="size-16 shrink-0" />
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight">
                                  <span className="text-muted-foreground">{i + 1}. </span>
                                  {e.nombre}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {pe.series} × {pe.repsMin}–{pe.repsMax}
                                  {e.medida === "segundos" ? " s" : " reps"} · descanso {pe.descansoSeg}s · RIR {pe.rir}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {pe.biserie && (
                                    <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-semibold text-violet">
                                      Biserie {pe.biserie}
                                    </span>
                                  )}
                                  {pe.ultimoRecurso && (
                                    <span className="flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold text-warn">
                                      <AlertTriangle className="size-3" /> Último recurso
                                      {pe.alternativaPreferida && ` · mejor: ${ejercicio(pe.alternativaPreferida).nombre}`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-1.5">
                              <Button variant="ghost" size="sm" className="h-9 rounded-xl" onClick={() => setTecnica(e.id)}>
                                <BookOpen /> Técnica
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 rounded-xl"
                                onClick={() => setSustituir({ id: e.id, dia: d })}
                              >
                                <ArrowRightLeft /> Cambiar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 rounded-xl text-destructive"
                                onClick={async () => {
                                  const alt = await marcarDolorEnPlan(e.id);
                                  toast.warning(
                                    alt
                                      ? `${e.nombre} marcado con molestia. Sustituido por ${ejercicio(alt).nombre}.`
                                      : `${e.nombre} marcado con molestia y retirado.`,
                                  );
                                }}
                              >
                                <ShieldAlert /> Me duele
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </motion.ol>
                  )}
                </Glass>
              );
            })}
          </div>
        </section>

        <Glass>
          <SectionTitle>Cobertura muscular semanal</SectionTitle>
          <CoverageBars total={plan.cobertura} casa={casa} minimo={plan.seriesMinimas} minimos={plan.minimos} manoLimitada={tieneManoLimitada(perfil.limitaciones)} />
        </Glass>

      </div>
      <CalendarioGimnasio
        key={calendario ? "abierto" : "cerrado"}
        abierto={calendario}
        onOpenChange={setCalendario}
        workouts={workouts}
        abs={abs ?? []}
        hoy={hoy}
      />
      <TecnicaSheet exerciseId={tecnica} onOpenChange={(a) => !a && setTecnica(null)} />
      <SustituirDialog
        exerciseId={sustituir?.id ?? null}
        perfil={perfil}
        ocupados={sustituir?.dia.ejercicios.map((x) => x.exerciseId) ?? []}
        onClose={() => setSustituir(null)}
        onElegir={async (nuevo) => {
          const de = sustituir!.id;
          setSustituir(null);
          await sustituirEnPlanGuardado(de, nuevo);
          toast.success(`Cambiado por ${ejercicio(nuevo).nombre}`);
        }}
      />
    </div>
  );
}

function siguienteDia(dias: PlanDay[], hoy: string): PlanDay | undefined {
  for (let i = 1; i <= 7; i++) {
    const wd = diaSemana(sumarDias(hoy, i));
    const d = dias.find((x) => x.diaSemana === wd);
    if (d) return d;
  }
  return dias[0];
}
