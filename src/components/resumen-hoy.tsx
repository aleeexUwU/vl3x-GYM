"use client";

import { Activity, Apple, Check, ChevronRight, Dumbbell } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { filtroCasa } from "@/lib/app/planificacion";
import { totales } from "@/lib/app/dieta";
import { useAbsSessions, useAjustes, useComidas, useEvaluacionBrazo, usePerfil, usePlan, useWorkouts } from "@/lib/db/hooks";
import { rutinaAbdominales } from "@/lib/domain/abs-routine";
import { diaSemana, hoyISO, NOMBRE_DIA, sumarDias } from "@/lib/domain/dates";
import { objetivosDiarios } from "@/lib/domain/nutrition/objetivos";
import { racha } from "@/lib/domain/weekly-plan";
import { cn } from "@/lib/utils";

function Fila({
  href,
  icono: Icono,
  titulo,
  detalle,
  hecho,
  progreso,
}: {
  href: string;
  icono: typeof Dumbbell;
  titulo: string;
  detalle: string;
  hecho: boolean;
  progreso?: number;
}) {
  return (
    <motion.li variants={{ oculto: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0 } }}>
      <Link href={href} className="group flex items-center gap-3 py-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-[0.8rem_0.35rem_0.9rem_0.4rem] border",
            hecho ? "border-lime/50 bg-lime/10 text-lime" : "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          {hecho ? <Check className="size-5" aria-label="Hecho" /> : <Icono className="size-5" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-xl leading-tight tracking-wide">{titulo}</span>
          <span className="block truncate text-sm text-muted-foreground">{detalle}</span>
          {progreso !== undefined && (
            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <motion.span
                className={cn("block h-full origin-left rounded-full", progreso >= 0.9 ? "bg-lime/85" : "bg-gradient-to-r from-[var(--neon)] to-[var(--violet)]")}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: Math.min(1, progreso) }}
                transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1], delay: 0.25 }}
              />
            </span>
          )}
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5" aria-hidden />
      </Link>
    </motion.li>
  );
}

/** "Hoy" de un vistazo: gimnasio, core y dieta, cada uno con su estado real. */
export function ResumenHoy() {
  const perfil = usePerfil();
  const ajustes = useAjustes();
  const plan = usePlan();
  const ev = useEvaluacionBrazo();
  const workouts = useWorkouts();
  const abs = useAbsSessions();
  const comidas = useComidas();
  if (!perfil || !ajustes || plan === undefined || !workouts || !abs || !comidas || ev === undefined) return null;

  const hoy = hoyISO();
  const diaHoy = plan?.dias.find((d) => d.diaSemana === diaSemana(hoy));
  const gymHecho = workouts.some((w) => w.fecha === hoy && w.estado === "completado");
  let proximo = "";
  if (!diaHoy && plan) {
    for (let i = 1; i <= 7; i++) {
      const wd = diaSemana(sumarDias(hoy, i));
      if (plan.dias.some((d) => d.diaSemana === wd)) {
        proximo = i === 1 ? "mañana" : `el ${NOMBRE_DIA[wd].toLowerCase()}`;
        break;
      }
    }
  }

  const absHechas = abs.filter((a) => a.completado).map((a) => a.fecha);
  const coreHecho = absHechas.includes(hoy);
  const rutina = rutinaAbdominales(hoy, ajustes.inicioAbdominales, filtroCasa(perfil, ajustes, ev), abs.filter((a) => !a._deleted));
  const rachaCore = racha(absHechas, hoy);

  const obj = objetivosDiarios(perfil, ajustes.dieta);
  const t = totales(comidas.filter((c) => c.fecha === hoy));

  return (
    <section aria-label="Hoy" className="glass px-4 py-1">
      <motion.ul
        className="divide-y divide-border"
        initial="oculto"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
      >
        <Fila
          href="/"
          icono={Dumbbell}
          titulo={diaHoy ? diaHoy.nombre.split(" · ")[0] + " de gimnasio" : "Descanso de gimnasio"}
          detalle={
            gymHecho
              ? "Sesión de hoy completada"
              : diaHoy
                ? `${diaHoy.ejercicios.length} ejercicios · unos ${diaHoy.duracionEstimadaMin} min`
                : proximo
                  ? `Próxima sesión ${proximo}`
                  : "Sin sesiones esta semana"
          }
          hecho={gymHecho}
        />
        <Fila
          href="/abdominales/"
          icono={Activity}
          titulo="Core en casa"
          detalle={
            coreHecho
              ? `Hecho hoy${rachaCore > 1 ? `, ${rachaCore} días seguidos` : ""}`
              : `Pendiente: unos ${rutina.duracionEstimadaMin} min${rachaCore > 0 ? `, no pierdas tu racha de ${rachaCore}` : ""}`
          }
          hecho={coreHecho}
        />
        <Fila
          href="/dieta/"
          icono={Apple}
          titulo="Dieta"
          detalle={`${Math.round(t.kcal)}/${obj.kcal} kcal, ${Math.round(t.proteinas)}/${obj.proteinas} g proteína`}
          hecho={t.kcal >= obj.kcal * 0.9 && t.proteinas >= obj.proteinas * 0.9}
          progreso={obj.kcal ? t.kcal / obj.kcal : 0}
        />
      </motion.ul>
    </section>
  );
}
