"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRightLeft,
  BookOpen,
  Clock3,
  Lightbulb,
  Settings2,
  Check,
  ChevronLeft,
  ChevronRight,
  Flag,
  Minus,
  NotebookPen,
  Pencil,
  Plus,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ExerciseImage } from "@/components/exercise/exercise-image";
import { Kakugan } from "@/components/kakugan";
import { ConsejosSheet, NotaEjercicio, TecnicaSheet } from "@/components/exercise/technique";
import { Calentamiento } from "@/components/gym/calentamiento";
import { Dropset } from "@/components/gym/dropset";
import { MaquinaDialog } from "@/components/gym/maquina-dialog";
import { SustituirDialog } from "@/components/gym/sustituir-dialog";
import { FlashSangre } from "@/components/flash-sangre";
import { RestTimer, type Descanso } from "@/components/rest-timer";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Aviso, Cargando, Chips, Glass, Stat, Stepper } from "@/components/ui-kit";
import { completarWorkout, hacerLuego, logsDeWorkouts, mutarWorkout, sustituirEnWorkout, tocaCalentar } from "@/lib/app/gimnasio";
import { marcarDolorEnPlan } from "@/lib/app/planificacion";
import { useAjustes, usePerfil, usePesosMaquina, useWorkout, useWorkouts } from "@/lib/db/hooks";
import type { Workout, WorkoutExercise, WorkoutSet } from "@/lib/db/types";
import { ejercicio } from "@/lib/domain/exercises";
import {
  ajusteSiguienteSerie,
  ajustarAMaquina,
  e1rm,
  incrementoPara,
  incrementosCon,
  seriesCalentamiento,
  mejorE1rm,
  recordAnterior,
  redondearPeso,
  resumenSeries,
  ultimoRegistro,
  type EstadoProgresion,
} from "@/lib/domain/progression";
import { formatoFecha } from "@/lib/domain/dates";
import type { LoadType } from "@/lib/domain/types";
import { toque } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const ESTADO: Record<EstadoProgresion, { texto: string; clase: string }> = {
  calibracion: { texto: "Calibración", clase: "bg-violet/15 text-violet" },
  subir: { texto: "¡Sube peso!", clase: "bg-lime/15 text-lime" },
  mantener: { texto: "Mantén y suma reps", clase: "bg-primary/15 text-primary" },
  bajar: { texto: "Baja un poco", clase: "bg-warn/15 text-warn" },
  descarga: { texto: "Descarga", clase: "bg-secondary text-foreground" },
};

const PASO_STEPPER: Record<LoadType, number> = {
  mancuerna: 1,
  maquina: 2.5,
  polea: 2.5,
  smith: 2.5,
  kettlebell: 2,
  peso_corporal: 1,
  banda: 1,
  barra: 2.5,
};

function pendientes(ej: WorkoutExercise) {
  return ej.series.filter((s) => !s.hecho).length;
}

function useWakeLock() {
  useEffect(() => {
    type WL = { release: () => Promise<void> };
    let lock: WL | null = null;
    const pedir = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WL> } };
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        /* sin permiso */
      }
    };
    void pedir();
    const vis = () => document.visibilityState === "visible" && void pedir();
    document.addEventListener("visibilitychange", vis);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      void lock?.release();
    };
  }, []);
}

function Sesion() {
  const params = useSearchParams();
  const id = params.get("id");
  const workout = useWorkout(id);
  const todos = useWorkouts();
  const perfil = usePerfil();
  const ajustes = useAjustes();
  const [idxElegido, setIdx] = useState<number | null>(null);
  // Dirección de la última navegación entre ejercicios (1 = siguiente, -1 = anterior) para la transición.
  const [dir, setDir] = useState(1);
  const [editando, setEditando] = useState<number | null>(null);
  const [descanso, setDescanso] = useState<Descanso | null>(null);
  const [destino, setDestino] = useState<number | null>(null);
  const [tecnica, setTecnica] = useState<string | null>(null);
  const [consejos, setConsejos] = useState<string | null>(null);
  const [verMaquina, setVerMaquina] = useState(false);
  const pesosMaquina = usePesosMaquina();
  const [sustituir, setSustituir] = useState(false);
  const [verNotas, setVerNotas] = useState(false);
  const [flash, setFlash] = useState(0);
  // Récords ya celebrados en esta sesión (uno por ejercicio).
  const celebrados = useRef(new Set<string>());
  useWakeLock();

  // Mientras no se elija, el ejercicio actual es el primero con series pendientes.
  const primero = workout ? Math.max(0, workout.ejercicios.findIndex((e) => pendientes(e) > 0)) : 0;
  const idxActual = idxElegido ?? primero;
  const ej = workout ? workout.ejercicios[idxActual] : undefined;
  const serieActiva = editando ?? (ej ? ej.series.findIndex((s) => !s.hecho) : -1);

  const finDescanso = useCallback(() => {
    setDescanso(null);
    if (destino !== null) {
      setDir(destino >= idxActual ? 1 : -1);
      setIdx(destino);
      setEditando(null);
      setDestino(null);
    }
  }, [destino, idxActual]);

  const previos = useMemo(
    () => logsDeWorkouts((todos ?? []).filter((w) => w.id !== id && w.estado === "completado")),
    [todos, id],
  );

  if (!id) return <Aviso>Sesión no encontrada.</Aviso>;
  if (workout === undefined || !perfil || !ajustes) return <Cargando />;
  if (workout === null) return <Aviso>Sesión no encontrada.</Aviso>;
  if (workout.estado === "completado") return <Resumen workout={workout} previos={previos} />;
  if (!ej) return <Cargando />;
  const idx = idxActual;

  const e = ejercicio(ej.exerciseId);
  const total = workout.ejercicios.reduce((t, x) => t + x.series.length, 0);
  const hechas = workout.ejercicios.reduce((t, x) => t + x.series.filter((s) => s.hecho).length, 0);
  const maquina = pesosMaquina?.[e.id];
  const paso = maquina?.paso ?? PASO_STEPPER[e.tipoCarga];
  const conPeso = e.cargaInicial != null;
  const dropsetAplica = !!ajustes.dropset && conPeso && e.medida === "reps" && ["maquina", "polea", "mancuerna"].includes(e.tipoCarga);
  const ultimaSerie = ej.series[ej.series.length - 1];
  const pareja = ej.biserie
    ? workout.ejercicios.findIndex((x, i) => i !== idx && x.biserie === ej.biserie)
    : -1;

  async function serieHecha(borrador: Borrador) {
    if (!workout || serieActiva < 0) return;
    const s = serieActiva;
    const yaEstaba = ej!.series[s].hecho;
    const incr = incrementoPara(e.tipoCarga, incrementosCon(e.tipoCarga, ajustes!.incrementos, maquina));
    let siguiente: Workout | null = null;
    // Fuera de la calibración, la siguiente serie se ajusta a lo que acabas de hacer.
    const ajuste =
      ej!.estado !== "calibracion" && borrador.pesoKg != null
        ? ajusteSiguienteSerie(borrador.pesoKg, borrador.reps ?? null, borrador.rir ?? null, { repsMin: ej!.repsMin, repsMax: ej!.repsMax }, incr)
        : null;
    let ajustadas = 0;
    await mutarWorkout(workout.id, (w) => {
      const x = w.ejercicios[idx];
      x.series[s] = { ...x.series[s], ...borrador, hecho: true, hora: new Date().toISOString() };
      // Llevar el peso usado a las series siguientes que aún no se han tocado.
      for (let k = s + 1; k < x.series.length; k++) {
        const sig = x.series[k];
        if (sig.hecho || borrador.pesoKg == null) continue;
        if (x.estado === "calibracion") {
          const rir = borrador.rir;
          const usado = borrador.pesoKg;
          sig.pesoKg = ajustarAMaquina(
            redondearPeso(rir == null ? Math.max(sig.objetivoPeso ?? 0, usado) : rir >= 4 ? usado + incr : rir >= 2 ? usado : usado - incr),
            maquina,
          );
          sig.objetivoPeso = sig.pesoKg;
        } else if (sig.pesoKg === sig.objetivoPeso) {
          sig.pesoKg = ajustarAMaquina(ajuste?.pesoKg ?? borrador.pesoKg, maquina);
          sig.objetivoPeso = sig.pesoKg;
          ajustadas++;
        }
      }
      siguiente = w;
    });
    setEditando(null);
    if (!yaEstaba) {
      setFlash((f) => f + 1);
      toque(15);
      // ¿Récord? Se compara el 1RM estimado de esta serie con el mejor de sesiones anteriores.
      const antes = recordAnterior(previos, ej!.exerciseId);
      if (antes > 0 && borrador.pesoKg && borrador.reps && !celebrados.current.has(ej!.exerciseId)) {
        const ahora = e1rm(borrador.pesoKg, borrador.reps);
        if (ahora > antes + 0.01) {
          celebrados.current.add(ej!.exerciseId);
          toque(60);
          toast.success(`🏆 ¡Nuevo récord en ${e.nombre}!`, {
            description: `${String(borrador.pesoKg).replace(".", ",")} kg × ${borrador.reps} · 1RM estimado ${Math.round(ahora)} kg (antes ${Math.round(antes)}).`,
            duration: 6000,
          });
        }
      }
    }
    if (!yaEstaba && ajuste?.motivo && ajustadas > 0) {
      const nuevo = ajustarAMaquina(ajuste.pesoKg, maquina);
      toast(`Siguiente serie: ${String(nuevo).replace(".", ",")} kg`, { description: `Ajustado porque ${ajuste.motivo}.` });
    }
    if (yaEstaba || !siguiente) return;
    // Última serie con dropset: se queda aquí hasta hacerlo o saltarlo.
    if (dropsetAplica && s === ej!.series.length - 1) {
      // Se fija este ejercicio: si no, la sesión saltaría al siguiente con series pendientes.
      setIdx(idx);
      return;
    }
    continuar(siguiente as Workout);
  }

  /** Tras terminar una serie (o el dropset): biserie, descanso o siguiente ejercicio. */
  function continuar(w: Workout) {
    const actual = w.ejercicios[idx];
    const quedanAqui = pendientes(actual) > 0;
    const p = pareja >= 0 ? w.ejercicios[pareja] : null;
    const quedaPareja = p ? pendientes(p) > 0 : false;
    const hechasAqui = actual.series.filter((x) => x.hecho).length;
    const hechasPareja = p ? p.series.filter((x) => x.hecho).length : 0;

    if (quedaPareja && hechasPareja < hechasAqui) {
      setDestino(pareja);
      setDescanso({ hasta: Date.now() + 15_000, total: 15, etiqueta: `Biserie: cambia a ${ejercicio(p!.exerciseId).nombre}` });
      return;
    }
    const descansoSeg = p ? Math.max(actual.descansoSeg, p.descansoSeg) : actual.descansoSeg;
    if (quedanAqui) {
      if (p && pareja < idx && quedaPareja) setDestino(pareja);
      setDescanso({ hasta: Date.now() + descansoSeg * 1000, total: descansoSeg, etiqueta: "Descanso" });
      return;
    }
    const sig = w.ejercicios.findIndex((x, i) => i !== idx && pendientes(x) > 0 && (i > idx || x.biserie === actual.biserie));
    const otro = sig >= 0 ? sig : w.ejercicios.findIndex((x) => pendientes(x) > 0);
    if (otro < 0) {
      toast.success("¡Todas las series hechas! Pulsa Terminar.");
      return;
    }
    setDestino(otro);
    setDescanso({
      hasta: Date.now() + descansoSeg * 1000,
      total: descansoSeg,
      etiqueta: `Siguiente: ${ejercicio(w.ejercicios[otro].exerciseId).nombre}`,
    });
  }

  async function guardarDrop(drop: NonNullable<WorkoutSet["drop"]>) {
    let w: Workout | null = null;
    await mutarWorkout(workout!.id, (x) => {
      const ult = x.ejercicios[idx!].series.at(-1);
      if (ult) ult.drop = drop;
      w = x;
    });
    if (!drop.omitido) {
      toque(30);
      setFlash((f) => f + 1);
    }
    if (w) continuar(w);
  }

  async function cambiarSeries(delta: 1 | -1) {
    await mutarWorkout(workout!.id, (w) => {
      const x = w.ejercicios[idx!];
      if (delta === 1) {
        const ultima = x.series[x.series.length - 1];
        x.series.push({ ...ultima, reps: null, rir: null, hecho: false, hora: undefined, pesoKg: ultima.pesoKg });
      } else {
        const i = x.series.map((s) => s.hecho).lastIndexOf(false);
        if (i >= 0 && x.series.length > 1) x.series.splice(i, 1);
      }
    });
  }

  async function meDuele() {
    const alt = await marcarDolorEnPlan(e.id);
    if (alt) {
      await sustituirEnWorkout(workout!.id, idx!, alt, perfil!, ajustes!);
      toast.warning(`Marcado con molestia. Cambiado por ${ejercicio(alt).nombre}.`);
    } else {
      await mutarWorkout(workout!.id, (w) => void w.ejercicios.splice(idx!, 1));
      setDir(-1);
      setIdx(Math.max(0, idx! - 1));
      toast.warning("Marcado con molestia y retirado de la sesión.");
    }
  }

  async function terminar() {
    await completarWorkout(workout!.id);
    toast.success("Sesión guardada");
  }

  return (
    <div className="space-y-4 pb-28">
      {/* Cabecera */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-lg" className="rounded-2xl" aria-label="Volver">
          <Link href="/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{workout.nombre}</p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--neon)] to-[var(--violet)] transition-[width]"
              style={{ width: `${(hechas / Math.max(1, total)) * 100}%` }}
            />
          </div>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {hechas}/{total}
        </span>
        <Button variant="outline" className="h-10 rounded-2xl" onClick={terminar}>
          <Flag /> Terminar
        </Button>
      </div>

      {/* Puntos de ejercicios */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Ejercicios de la sesión">
        {workout.ejercicios.map((x, i) => (
          <button
            key={`${x.exerciseId}-${i}`}
            type="button"
            role="tab"
            aria-selected={i === idx}
            aria-label={`${i + 1}. ${ejercicio(x.exerciseId).nombre}`}
            onClick={() => {
              setDir(i >= idx ? 1 : -1);
              setIdx(i);
              setEditando(null);
            }}
            className={cn(
              "h-2.5 min-w-6 flex-1 rounded-full transition-colors",
              i === idx ? "bg-primary" : pendientes(x) === 0 ? "bg-lime/70" : "bg-secondary",
            )}
          />
        ))}
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div
          key={`${ej.exerciseId}-${idx}`}
          custom={dir}
          variants={{
            entra: (d: number) => ({ opacity: 0, x: 48 * d }),
            centro: { opacity: 1, x: 0 },
            sale: (d: number) => ({ opacity: 0, x: -48 * d }),
          }}
          initial="entra"
          animate="centro"
          exit="sale"
          transition={{ type: "spring", stiffness: 520, damping: 42, opacity: { duration: 0.15 } }}
          className="space-y-4"
        >
          {/* Desliza la tarjeta a izquierda/derecha para cambiar de ejercicio. */}
          <motion.div
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.3}
            dragSnapToOrigin
            style={{ touchAction: "pan-y" }}
            onDragEnd={(_, info) => {
              const n = workout.ejercicios.length;
              if ((info.offset.x < -70 || info.velocity.x < -600) && idx < n - 1) {
                toque();
                setDir(1);
                setIdx(idx + 1);
                setEditando(null);
              } else if ((info.offset.x > 70 || info.velocity.x > 600) && idx > 0) {
                toque();
                setDir(-1);
                setIdx(idx - 1);
                setEditando(null);
              }
            }}
          >
          <Glass className="space-y-3">
            <div className="flex gap-3">
              <button type="button" onClick={() => setTecnica(e.id)} aria-label="Ver técnica">
                <ExerciseImage ejercicio={e} animar={false} className="size-24 shrink-0" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">
                  Ejercicio {idx + 1} de {workout.ejercicios.length}
                  {idx === 0 && <span className="text-muted-foreground/70"> · desliza para cambiar</span>}
                  {ej.biserie && <span className="ml-1 font-semibold text-violet">· Biserie {ej.biserie}</span>}
                </p>
                <h1 className="font-heading text-2xl leading-tight tracking-wide">{e.nombre}</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ej.repsMin}–{ej.repsMax} {e.medida === "segundos" ? "s" : "reps"} · RIR {ej.rir} · descanso {ej.descansoSeg}s
                </p>
                <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold", ESTADO[ej.estado].clase)}>
                  {ESTADO[ej.estado].texto}
                </span>
              </div>
            </div>
            <p className="rounded-2xl bg-secondary/50 p-2.5 text-sm leading-relaxed">{ej.mensaje}</p>
            {(() => {
              const ultimo = ultimoRegistro(previos, ej.exerciseId);
              if (!ultimo) return null;
              return (
                <p className="flex flex-wrap items-baseline gap-x-2 rounded-2xl border border-border px-3 py-2 text-sm">
                  <span className="text-xs text-muted-foreground">La última vez ({formatoFecha(ultimo.fecha)})</span>
                  <strong className="tabular-nums">{resumenSeries(ultimo, e.medida)}</strong>
                </p>
              );
            })()}
            {ej.estado === "calibracion" && (
              <p className="text-xs text-muted-foreground">
                Anota el <strong>RIR</strong> (cuántas reps te quedaban): con 4 o más, la siguiente serie sube; con 2–3 ya
                tienes tu peso; con 0–1, baja.
              </p>
            )}
            {conPeso && (
              <button type="button" className="flex items-center gap-1.5 text-xs text-muted-foreground" onClick={() => setVerMaquina(true)}>
                <Settings2 className="size-3.5" aria-hidden />
                {maquina
                  ? `Esta máquina: de ${String(maquina.paso).replace(".", ",")} en ${String(maquina.paso).replace(".", ",")} kg desde ${String(maquina.minimo).replace(".", ",")}`
                  : "¿Tu máquina sube de otra forma? Ajusta sus pesos"}
              </button>
            )}
            {ej.ultimoRecurso && (
              <Aviso tipo="warn">
                Último recurso (Smith).{" "}
                {ej.alternativaPreferida && <>Preferible si está libre: {ejercicio(ej.alternativaPreferida).nombre}.</>}
              </Aviso>
            )}
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                className="h-12 flex-1 rounded-xl border-primary/40 bg-primary/10 text-base text-primary"
                onClick={() => setConsejos(e.id)}
              >
                <Lightbulb /> Consejos
              </Button>
              {pendientes(ej) > 0 && workout.ejercicios.some((x, i) => i !== idx && pendientes(x) > 0) && (
                <Button
                  variant="secondary"
                  className="h-12 rounded-xl px-3 text-sm"
                  onClick={async () => {
                    await hacerLuego(workout.id, idx);
                    setDir(1);
                    setEditando(null);
                    // Se queda en la misma posición, donde ahora está el siguiente ejercicio.
                    setIdx(Math.min(idx, workout.ejercicios.length - 2));
                    toast.success(`${e.nombre} pasa al final de la sesión`);
                  }}
                >
                  <Clock3 /> Hacer luego
                </Button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <Button variant="secondary" className="h-11 rounded-xl px-1 text-xs" onClick={() => setTecnica(e.id)}>
                <BookOpen /> Técnica
              </Button>
              <Button variant="secondary" className="h-11 rounded-xl px-1 text-xs" onClick={() => setSustituir(true)}>
                <ArrowRightLeft /> Cambiar
              </Button>
              <Button variant="secondary" className="h-11 rounded-xl px-1 text-xs" onClick={() => setVerNotas((v) => !v)}>
                <NotebookPen /> Notas
              </Button>
              <Button variant="secondary" className="h-11 rounded-xl px-1 text-xs text-destructive" onClick={meDuele}>
                <ShieldAlert /> Duele
              </Button>
            </div>
            {verNotas && <NotaEjercicio exerciseId={e.id} />}
          </Glass>
          </motion.div>

          {conPeso && !ej.series[0]?.hecho && tocaCalentar(workout.ejercicios, idx) && (
            <Calentamiento
              key={`${workout.id}-${idx}-${e.id}`}
              series={seriesCalentamiento(ej.series[0]?.objetivoPeso ?? null, paso, maquina)}
            />
          )}

          {/* Series */}
          <ol className="space-y-2">
            {ej.series.map((s, i) => {
              const activa = i === serieActiva;
              return (
                <li key={i}>
                  {activa ? (
                    <SerieEditor
                      key={`${idx}-${i}-${s.hecho}`}
                      numero={i + 1}
                      serie={s}
                      medida={e.medida}
                      conPeso={conPeso}
                      paso={paso}
                      onHecha={serieHecha}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditando(i)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm",
                        s.hecho ? "bg-lime/10" : "bg-secondary/50",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {s.hecho ? (
                          <motion.span
                            initial={{ scale: 0, rotate: -30 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 600, damping: 18 }}
                            className="grid place-items-center"
                          >
                            <Check className="size-4 text-lime" />
                          </motion.span>
                        ) : (
                          <span className="size-4" />
                        )}
                        Serie {i + 1}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                        {s.hecho
                          ? `${s.pesoKg != null ? `${s.pesoKg} kg × ` : ""}${s.reps}${s.rir != null ? ` · RIR ${s.rir}` : ""}`
                          : `${s.pesoKg != null ? `${s.pesoKg} kg × ` : ""}${s.objetivoReps}`}
                        {s.hecho && <Pencil className="size-3.5" />}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {dropsetAplica && ultimaSerie?.hecho && !ultimaSerie.drop && (
            <Dropset
              key={`${workout.id}-${idx}`}
              pesoSugerido={ajustarAMaquina(redondearPeso((ultimaSerie.pesoKg ?? 0) * 0.75), maquina)}
              paso={paso}
              onHecho={(pesoKg, reps) => guardarDrop({ pesoKg, reps })}
              onSaltar={() => guardarDrop({ pesoKg: null, reps: null, omitido: true })}
            />
          )}
          {ultimaSerie?.drop && !ultimaSerie.drop.omitido && (
            <p className="text-sm text-muted-foreground">
              Dropset: <strong className="text-foreground">{String(ultimaSerie.drop.pesoKg).replace(".", ",")} kg × {ultimaSerie.drop.reps}</strong>
            </p>
          )}

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => cambiarSeries(-1)}>
                <Minus /> Serie
              </Button>
              <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => cambiarSeries(1)}>
                <Plus /> Serie
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm">
              Buena técnica
              <Switch
                checked={ej.buenaTecnica}
                onCheckedChange={(v) => mutarWorkout(workout.id, (w) => void (w.ejercicios[idx].buenaTecnica = v))}
              />
            </label>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navegación con el pulgar */}
      {!descanso && (
        <div className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto grid max-w-xl grid-cols-2 gap-2 rounded-t-3xl px-4 pt-3">
          <Button
            variant="secondary"
            className="h-14 rounded-2xl text-base"
            disabled={idx === 0}
            onClick={() => {
              setDir(-1);
              setIdx(idx - 1);
              setEditando(null);
            }}
          >
            <ChevronLeft /> Anterior
          </Button>
          {idx < workout.ejercicios.length - 1 ? (
            <Button
              variant="secondary"
              className="h-14 rounded-2xl text-base"
              onClick={() => {
                setDir(1);
                setIdx(idx + 1);
                setEditando(null);
              }}
            >
              Siguiente <ChevronRight />
            </Button>
          ) : (
            <Button className="h-14 rounded-2xl text-base font-semibold" onClick={terminar}>
              <Flag /> Terminar
            </Button>
          )}
        </div>
      )}

      <RestTimer
        descanso={descanso}
        onFin={finDescanso}
        onCambiar={(d) => (d ? setDescanso(d) : finDescanso())}
        sonido={ajustes.sonido}
        vibracion={ajustes.vibracion}
      />
      <FlashSangre disparo={flash} />
      <TecnicaSheet exerciseId={tecnica} onOpenChange={(a) => !a && setTecnica(null)} />
      <ConsejosSheet exerciseId={consejos} prescripcion={ej} onOpenChange={(a) => !a && setConsejos(null)} />
      <MaquinaDialog
        key={`${e.id}-${verMaquina}`}
        exerciseId={e.id}
        nombre={e.nombre}
        actual={maquina}
        workoutId={workout.id}
        abierto={verMaquina}
        onOpenChange={setVerMaquina}
      />
      <SustituirDialog
        exerciseId={sustituir ? e.id : null}
        perfil={perfil}
        ocupados={workout.ejercicios.map((x) => x.exerciseId)}
        onClose={() => setSustituir(false)}
        onElegir={async (nuevo) => {
          setSustituir(false);
          await sustituirEnWorkout(workout.id, idx, nuevo, perfil, ajustes);
          toast.success(`Cambiado por ${ejercicio(nuevo).nombre} (solo hoy)`);
        }}
      />
    </div>
  );
}

type Borrador = Pick<WorkoutSet, "pesoKg" | "reps" | "rir">;

/** Editor de la serie activa: su estado arranca con el objetivo (o lo ya anotado). */
function SerieEditor({
  numero,
  serie: s,
  medida,
  conPeso,
  paso,
  onHecha,
}: {
  numero: number;
  serie: WorkoutSet;
  medida: "reps" | "segundos";
  conPeso: boolean;
  paso: number;
  onHecha: (b: Borrador) => void;
}) {
  const [borrador, setBorrador] = useState<Borrador>(() => ({
    pesoKg: s.hecho ? s.pesoKg : (s.pesoKg ?? s.objetivoPeso),
    reps: s.hecho ? s.reps : (s.reps ?? s.objetivoReps),
    rir: s.rir,
  }));
  return (
    <Glass className="space-y-4 neon-border">
      <div className="flex items-baseline justify-between">
        <p className="font-heading text-xl tracking-wide">Serie {numero}</p>
        <p className="text-sm text-muted-foreground">
          Objetivo:{" "}
          <strong className="text-foreground">
            {s.objetivoPeso != null && `${s.objetivoPeso} kg × `}
            {s.objetivoReps} {medida === "segundos" ? "s" : "reps"}
          </strong>
        </p>
      </div>
      {conPeso && (
        <Stepper
          etiqueta="Peso"
          sufijo="kg"
          paso={paso}
          valor={borrador.pesoKg}
          onChange={(v) => setBorrador((b) => ({ ...b, pesoKg: v }))}
        />
      )}
      <Stepper
        etiqueta={medida === "segundos" ? "Segundos" : "Repeticiones"}
        paso={medida === "segundos" ? 5 : 1}
        decimales={0}
        valor={borrador.reps}
        onChange={(v) => setBorrador((b) => ({ ...b, reps: v }))}
      />
      <div>
        <p className="mb-1.5 text-center text-[11px] text-muted-foreground">
          Reps en reserva (opcional)
        </p>
        <Chips<number>
          className="justify-center"
          valor={borrador.rir ?? -1}
          onChange={(v) => setBorrador((b) => ({ ...b, rir: b.rir === v ? null : (v as number) }))}
          opciones={[0, 1, 2, 3, 4].map((n) => ({ valor: n, etiqueta: n === 4 ? "4+" : String(n) }))}
        />
      </div>
      <motion.div whileTap={{ scale: 0.97 }}>
        <Button className="h-16 w-full rounded-2xl text-lg font-bold" disabled={borrador.reps == null} onClick={() => onHecha(borrador)}>
          <Check className="size-6" /> {s.hecho ? "Guardar cambios" : "Serie hecha"}
        </Button>
      </motion.div>
    </Glass>
  );
}

function Resumen({ workout, previos }: { workout: Workout; previos: ReturnType<typeof logsDeWorkouts> }) {
  const [notas, setNotas] = useState(workout.notas);
  useEffect(() => {
    if (notas === workout.notas) return;
    const t = setTimeout(() => void mutarWorkout(workout.id, (w) => void (w.notas = notas)), 500);
    return () => clearTimeout(t);
  }, [notas, workout]);

  const series = workout.ejercicios.flatMap((e) => e.series.filter((s) => s.hecho));
  const volumen = series.reduce((t, s) => t + (s.pesoKg ?? 0) * (s.reps ?? 0), 0);
  const minutos = workout.fin ? Math.round((Date.parse(workout.fin) - Date.parse(workout.inicio)) / 60000) : null;
  const records = workout.ejercicios
    .map((ej) => {
      const actual = mejorE1rm({ ...ej, fecha: workout.fecha, series: ej.series });
      const antes = Math.max(0, ...previos.filter((l) => l.exerciseId === ej.exerciseId && l.fecha <= workout.fecha).map(mejorE1rm));
      return { ej, actual, antes };
    })
    .filter((r) => r.actual > 0 && r.antes > 0 && r.actual > r.antes);

  return (
    <div className="space-y-4">
      <div className="pt-6 text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-grid size-20 place-items-center rounded-full bg-primary/10 neon-border">
          <Kakugan className="h-10 w-16" />
        </motion.div>
        <h1 className="glitch mt-3 font-display text-4xl text-primary" data-text="¡Sesión completada!">¡Sesión completada!</h1>
        <p className="text-sm text-muted-foreground">{workout.nombre}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat etiqueta="Series" valor={series.length} />
        <Stat etiqueta="Volumen" valor={`${Math.round(volumen)}`} detalle="kg × reps" color="violet" />
        <Stat etiqueta="Tiempo" valor={minutos ?? "—"} detalle="min" color="lime" />
      </div>
      {records.length > 0 && (
        <Glass>
          <p className="mb-2 font-semibold">Nuevos récords (1RM estimado)</p>
          <ul className="space-y-1 text-sm">
            {records.map((r) => (
              <li key={r.ej.exerciseId} className="flex justify-between">
                <span>{ejercicio(r.ej.exerciseId).nombre}</span>
                <span className="font-semibold text-lime">{Math.round(r.actual)} kg</span>
              </li>
            ))}
          </ul>
        </Glass>
      )}
      <Glass>
        <label className="block text-sm font-medium" htmlFor="notas-sesion">
          Notas de la sesión
        </label>
        <Textarea id="notas-sesion" value={notas} onChange={(e) => setNotas(e.target.value)} className="mt-2 min-h-24 rounded-2xl" />
      </Glass>
      <Button asChild className="h-14 w-full rounded-2xl text-base">
        <Link href="/">Volver</Link>
      </Button>
    </div>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Cargando />}>
      <Sesion />
    </Suspense>
  );
}
