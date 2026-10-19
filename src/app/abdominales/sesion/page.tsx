"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Flame, Pause, Play, Plus, SkipForward } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { ExerciseImage } from "@/components/exercise/exercise-image";
import { TecnicaSheet } from "@/components/exercise/technique";
import { FlashSangre } from "@/components/flash-sangre";
import { pitar, vibrar } from "@/components/rest-timer";
import { Button } from "@/components/ui/button";
import { Cargando, Glass } from "@/components/ui-kit";
import { filtroCasa } from "@/lib/app/planificacion";
import { fechasDe, clavesHechas } from "@/lib/app/resumen";
import { useAbsSessions, useAjustes, useEvaluacionBrazo, usePerfil } from "@/lib/db/hooks";
import { guardar, nuevoId } from "@/lib/db/repo";
import type { AbsSession } from "@/lib/db/types";
import { CATEGORIA_NOMBRE, rutinaAbdominales, type AbsItem } from "@/lib/domain/abs-routine";
import { hoyISO } from "@/lib/domain/dates";
import { ejercicio } from "@/lib/domain/exercises";
import { racha } from "@/lib/domain/weekly-plan";
import { useCuentaAtras } from "@/lib/hooks/use-cuenta-atras";
import { cn } from "@/lib/utils";
import { sincronizarRecordatorioConSW } from "@/lib/pwa/recordatorio";

type Paso =
  | { tipo: "trabajo"; item: number; serie: number }
  | { tipo: "descanso"; seg: number; siguiente: string };

function construirPasos(items: AbsItem[]): Paso[] {
  const pasos: Paso[] = [];
  items.forEach((it, i) => {
    for (let s = 0; s < it.series; s++) {
      pasos.push({ tipo: "trabajo", item: i, serie: s });
      const ultimo = i === items.length - 1 && s === it.series - 1;
      if (ultimo) continue;
      const cambia = s === it.series - 1;
      pasos.push({
        tipo: "descanso",
        seg: cambia ? 20 : it.descansoSeg,
        siguiente: ejercicio(cambia ? items[i + 1].exerciseId : it.exerciseId).nombre,
      });
    }
  });
  return pasos;
}

export default function SesionAbdominales() {
  const perfil = usePerfil();
  const ajustes = useAjustes();
  const ev = useEvaluacionBrazo();
  const sesiones = useAbsSessions();
  const hoy = hoyISO();
  const rutina = useMemo(
    () => (perfil && ajustes && ev !== undefined ? rutinaAbdominales(hoy, ajustes.inicioAbdominales, filtroCasa(perfil, ajustes, ev)) : null),
    [perfil, ajustes, ev, hoy],
  );
  // "Extra si no estás muy cansado": una ronda más (1 serie de cada ejercicio) al final.
  const [extra, setExtra] = useState(false);
  const pasos = useMemo(() => {
    if (!rutina) return [];
    const base = construirPasos(rutina.items);
    if (!extra) return base;
    const ronda = construirPasos(rutina.items.map((it) => ({ ...it, series: 1 })));
    return [...base, { tipo: "descanso" as const, seg: 45, siguiente: ejercicio(rutina.items[0].exerciseId).nombre }, ...ronda];
  }, [rutina, extra]);
  const [i, setI] = useState(0);
  const [fin, setFin] = useState<number | null>(null);
  const [pausaRestante, setPausaRestante] = useState<number | null>(null);
  const [conteo, setConteo] = useState(0);
  const [terminado, setTerminado] = useState(false);
  const [tecnica, setTecnica] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const sesion = useRef<AbsSession | null>(null);
  const [inicio] = useState(() => Date.now());

  const paso = pasos[i];
  const item = paso?.tipo === "trabajo" ? rutina!.items[paso.item] : null;


  const guardarProgreso = useCallback(
    async (completado: boolean, itemHecho?: number) => {
      if (!rutina) return;
      if (!sesion.current) {
        sesion.current = {
          id: nuevoId(),
          fecha: hoy,
          completado: false,
          items: rutina.items.map((it) => ({ exerciseId: it.exerciseId, series: it.series, objetivo: it.objetivo, medida: it.medida, hechas: 0 })),
          duracionSeg: 0,
          updatedAt: 0,
          _dirty: 1,
        };
      }
      const s = sesion.current;
      if (itemHecho !== undefined) s.items[itemHecho].hechas += 1;
      s.completado = completado || s.completado; // la ronda extra no "deshace" el core ya hecho
      s.duracionSeg = Math.round((Date.now() - inicio) / 1000);
      sesion.current = await guardar<AbsSession>("absSessions", s);
    },
    [rutina, hoy, inicio],
  );

  const avanzar = useCallback(() => {
    setConteo(0);
    setPausaRestante(null);
    const siguiente = i + 1;
    if (siguiente >= pasos.length) {
      setFin(null);
      setTerminado(true);
      void guardarProgreso(true);
      if (ajustes) void sincronizarRecordatorioConSW({ ...ajustes.recordatorio, hechoHoy: hoy });
      return;
    }
    setI(siguiente);
    const p = pasos[siguiente];
    if (p.tipo === "descanso") setFin(Date.now() + p.seg * 1000);
    else setFin(null);
  }, [i, pasos, guardarProgreso, ajustes, hoy]);

  const completarTrabajo = useCallback(() => {
    if (paso?.tipo !== "trabajo") return;
    void guardarProgreso(false, paso.item);
    setFlash((f) => f + 1);
    avanzar();
  }, [paso, guardarProgreso, avanzar]);

  // Cuenta atrás precisa (timestamps reales, un render por segundo). Al llegar a 0
  // avanza sola: termina la serie por tiempo o el descanso.
  const enMarcha = fin !== null && pausaRestante === null ? fin : null;
  const restanteVivo = useCuentaAtras(enMarcha, () => {
    setFin(null);
    if (ajustes?.vibracion) vibrar([200, 100, 200]);
    if (ajustes?.sonido) pitar(paso?.tipo === "trabajo" ? 3 : 2);
    if (paso?.tipo === "trabajo") completarTrabajo();
    else avanzar();
  });
  const restante = pausaRestante ?? restanteVivo;

  if (!rutina || !ajustes || !sesiones) return <Cargando />;

  if (terminado) {
    const fechas = [...fechasDe(clavesHechas([], sesiones, []), "abdominales"), hoy];
    return (
      <div className="space-y-5 pt-10 text-center">
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto grid size-24 place-items-center rounded-full bg-warn/15 neon-border">
          <Flame className="size-12 text-warn" />
        </motion.div>
        <h1 className="glitch font-display text-4xl text-primary" data-text="¡Core hecho!">¡Core hecho!</h1>
        <p className="text-muted-foreground">Racha: {racha(fechas, hoy)} {racha(fechas, hoy) === 1 ? "día" : "días"}</p>
        {!extra && (
          <Glass className="space-y-2 text-left">
            <p className="font-semibold">Extra si no estás muy cansado</p>
            <p className="text-sm text-muted-foreground">
              Una ronda más: 1 serie de cada ejercicio (~{Math.max(2, Math.round(rutina.items.reduce((t, it) => t + (it.medida === "segundos" ? it.objetivo : it.objetivo * 2.5) + 20, 0) / 60))} min). Si vas justo, déjalo para mañana.
            </p>
            <Button
              variant="secondary"
              className="h-12 w-full rounded-xl"
              onClick={() => {
                const desde = pasos.length;
                setExtra(true);
                setTerminado(false);
                setI(desde);
                setFin(Date.now() + 45 * 1000);
              }}
            >
              <Plus /> Hacer la ronda extra
            </Button>
          </Glass>
        )}
        <Button asChild className="h-14 w-full rounded-2xl text-base">
          <Link href="/abdominales/">Volver</Link>
        </Button>
      </div>
    );
  }

  const totalTrabajo = pasos.filter((p) => p.tipo === "trabajo").length;
  const hechosTrabajo = pasos.slice(0, i).filter((p) => p.tipo === "trabajo").length;
  const pausado = pausaRestante !== null;

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col gap-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon-lg" className="rounded-2xl" aria-label="Salir">
          <Link href="/abdominales/">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-gradient-to-r from-[var(--neon)] to-[var(--violet)] transition-[width]" style={{ width: `${(hechosTrabajo / totalTrabajo) * 100}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {hechosTrabajo}/{totalTrabajo}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          className="flex flex-1 flex-col gap-4"
        >
          {paso.tipo === "descanso" ? (
            <Glass className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">Descanso</p>
              <p className="font-display text-8xl tabular-nums text-primary">
                <span key={restante <= 3 ? restante : "normal"} className={cn("inline-block", restante <= 3 && "latido")}>
                  {restante}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">Siguiente: {paso.siguiente}</p>
            </Glass>
          ) : (
            item && (
              <>
                <button type="button" onClick={() => setTecnica(item.exerciseId)} aria-label="Ver técnica">
                  <ExerciseImage ejercicio={ejercicio(item.exerciseId)} detalle className="w-full" />
                </button>
                <div className="text-center">
                  <p className="text-xs text-primary">{CATEGORIA_NOMBRE[item.categoria]}</p>
                  <h1 className="font-heading text-2xl tracking-wide">{ejercicio(item.exerciseId).nombre}</h1>
                  <p className="text-sm text-muted-foreground">
                    Serie {paso.serie + 1} de {item.series}
                  </p>
                </div>
                {item.medida === "segundos" ? (
                  <div className="text-center">
                    <p className="font-display text-8xl tabular-nums text-primary">
                      <span key={fin && restante <= 3 ? restante : "normal"} className={cn("inline-block", fin && restante <= 3 && "latido")}>
                        {fin ? restante : item.objetivo}
                      </span>
                    </p>
                    <p className="text-sm text-muted-foreground">segundos</p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConteo((c) => c + 1)}
                    className="mx-auto grid size-44 place-items-center rounded-full bg-primary/10 neon-border active:scale-95"
                    aria-label="Contar una repetición"
                  >
                    <span>
                      <span className="block font-display text-6xl tabular-nums neon-text">{conteo}</span>
                      <span className="text-sm text-muted-foreground">de {item.objetivo} · toca para contar</span>
                    </span>
                  </button>
                )}
              </>
            )
          )}
        </motion.div>
      </AnimatePresence>

      <div className="safe-bottom grid grid-cols-[auto_1fr_auto] gap-2">
        <Button
          variant="secondary"
          className="size-16 rounded-2xl"
          aria-label={pausado ? "Reanudar" : "Pausar"}
          disabled={!fin}
          onClick={() => {
            if (pausado) {
              setFin(Date.now() + (pausaRestante ?? 0) * 1000);
              setPausaRestante(null);
            } else setPausaRestante(restante);
          }}
        >
          {pausado ? <Play /> : <Pause />}
        </Button>
        {paso.tipo === "trabajo" && item?.medida === "segundos" && !fin ? (
          <Button className="h-16 rounded-2xl text-lg font-bold" onClick={() => setFin(Date.now() + item.objetivo * 1000)}>
            <Play /> Empezar
          </Button>
        ) : paso.tipo === "trabajo" ? (
          <Button className="h-16 rounded-2xl text-lg font-bold" onClick={completarTrabajo}>
            <Check /> Hecho
          </Button>
        ) : (
          <Button variant="secondary" className="h-16 rounded-2xl text-lg" onClick={avanzar}>
            Saltar descanso
          </Button>
        )}
        <Button variant="secondary" className="size-16 rounded-2xl" aria-label="Saltar" onClick={avanzar}>
          <SkipForward />
        </Button>
      </div>
      <FlashSangre disparo={flash} />
      <TecnicaSheet exerciseId={tecnica} onOpenChange={(a) => !a && setTecnica(null)} />
    </div>
  );
}
