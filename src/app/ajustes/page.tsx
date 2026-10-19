"use client";

import { Hand, Upload, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { AdminIA } from "@/components/admin-ia";
import { CuentaCard } from "@/components/cuenta-card";
import { ReminderCard } from "@/components/reminder-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Aviso, Cargando, Chips, Glass, PageHeader, SectionTitle } from "@/components/ui-kit";
import { exportarJSON, importarJSON } from "@/lib/app/exportar";
import { guardarAjustes, quitarDolor, regenerarPlan } from "@/lib/app/planificacion";
import { db } from "@/lib/db/db";
import { useAjustes, usePerfil, usePlan } from "@/lib/db/hooks";
import { escribirKv } from "@/lib/db/repo";
import { NOMBRE_DIA_CORTO, SEMANA_LUNES } from "@/lib/domain/dates";
import { getEjercicio } from "@/lib/domain/exercises";
import { tieneManoLimitada } from "@/lib/domain/limitations";
import { LimitacionesEditor } from "@/components/limitaciones-editor";
import { objetivosDiarios, type AjustesDieta } from "@/lib/domain/nutrition/objetivos";
import { EQUIPO_NOMBRE } from "@/lib/domain/muscles";
import type { Equipment, Experience, Goal, Profile, Settings, Sex, Weekday, RangoReps } from "@/lib/domain/types";

function Fila({ titulo, children, ayuda }: { titulo: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm">{titulo}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

export default function Ajustes() {
  const perfil = usePerfil();
  const ajustes = useAjustes();
  const plan = usePlan();

  if (!perfil || !ajustes || plan === undefined) return <Cargando />;

  /** Cambios de perfil que afectan a la rutina: se guardan y se regenera (el historial se conserva). */
  async function perfilYRegenerar(cambios: Partial<Profile>) {
    await escribirKv("perfil", { ...perfil!, ...cambios });
    await regenerarPlan();
    toast.success("Rutina actualizada");
  }
  async function ajustesYRegenerar(cambios: Partial<Settings>) {
    await guardarAjustes(cambios);
    await regenerarPlan();
    toast.success("Rutina actualizada");
  }
  const equipoGym = (Object.keys(EQUIPO_NOMBRE) as Equipment[]).filter((q) => q !== "esterilla");

  return (
    <div className="space-y-5">
      <PageHeader titulo="Ajustes" subtitulo="Perfil, rutina, módulos y datos" />

      <Glass className="space-y-4">
        <SectionTitle>Días y duración</SectionTitle>
        <Fila titulo="Días de gimnasio" ayuda="2–3 días: cuerpo completo · 4 o más: torso / pierna. Cambiarlos regenera la rutina sin tocar el historial.">
          <Chips<Weekday>
            multiple
            valor={perfil.dias}
            onChange={(v) => (v as Weekday[]).length >= 2 ? perfilYRegenerar({ dias: v as Weekday[] }) : toast.error("Elige al menos 2 días")}
            opciones={SEMANA_LUNES.map((d) => ({ valor: d, etiqueta: NOMBRE_DIA_CORTO[d] }))}
          />
        </Fila>
        <Fila titulo="Duración objetivo">
          <Chips<number>
            valor={perfil.duracionMin}
            onChange={(v) => perfilYRegenerar({ duracionMin: v as number })}
            opciones={[45, 60, 75, 90, 105, 120].map((m) => ({ valor: m, etiqueta: `${m} min` }))}
          />
        </Fila>
        {plan && (
          <p className="text-xs text-muted-foreground">
            Duración estimada ahora: {plan.dias.map((d) => `${d.duracionEstimadaMin} min`).join(" · ")}
          </p>
        )}
      </Glass>

      <Glass className="space-y-4">
        <SectionTitle>Perfil</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["edad", "Edad"],
              ["pesoKg", "Peso (kg)"],
              ["alturaCm", "Altura (cm)"],
            ] as const
          ).map(([k, t]) => (
            <div key={k}>
              <Label htmlFor={`a-${k}`} className="text-xs">{t}</Label>
              <Input
                id={`a-${k}`}
                type="number"
                inputMode="decimal"
                defaultValue={perfil[k] ?? ""}
                onBlur={(e) => escribirKv("perfil", { ...perfil, [k]: e.target.value === "" ? null : Number(e.target.value) })}
                className="mt-1 h-11 rounded-xl text-center"
              />
            </div>
          ))}
        </div>
        <Fila titulo="Sexo">
          <Chips<Sex> valor={perfil.sexo} onChange={(v) => escribirKv("perfil", { ...perfil, sexo: v as Sex })} opciones={[{ valor: "hombre", etiqueta: "Hombre" }, { valor: "mujer", etiqueta: "Mujer" }, { valor: "otro", etiqueta: "Otro" }]} />
        </Fila>
        <Fila titulo="Experiencia">
          <Chips<Experience> valor={perfil.experiencia} onChange={(v) => perfilYRegenerar({ experiencia: v as Experience })} opciones={[{ valor: "principiante", etiqueta: "Principiante" }, { valor: "intermedio", etiqueta: "Intermedio" }, { valor: "avanzado", etiqueta: "Avanzado" }]} />
        </Fila>
        <Fila titulo="Objetivo">
          <Chips<Goal> valor={perfil.objetivo} onChange={(v) => perfilYRegenerar({ objetivo: v as Goal })} opciones={[{ valor: "hipertrofia", etiqueta: "Músculo" }, { valor: "fuerza", etiqueta: "Fuerza" }, { valor: "salud", etiqueta: "Salud" }]} />
        </Fila>
      </Glass>

      <Glass className="space-y-4">
        <SectionTitle>Lesiones y limitaciones</SectionTitle>
        <LimitacionesEditor
          conIA
          limitaciones={perfil.limitaciones}
          notas={perfil.notasLimitaciones}
          onLimitaciones={(ids) => perfilYRegenerar({ limitaciones: ids })}
          onNotas={(t) => escribirKv("perfil", { ...perfil, notasLimitaciones: t })}
          onExcluir={(ids) => perfilYRegenerar({ excluidos: [...new Set([...perfil.excluidos, ...ids])] })}
        />
        <Fila titulo="Ejercicios quitados" ayuda="Por molestia o por tu limitación: no vuelven a aparecer en la rutina. Quítalos de aquí si ya puedes hacerlos.">
          {perfil.excluidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {perfil.excluidos.map((id) => (
                <li key={id}>
                  <Button variant="secondary" size="sm" className="rounded-xl" onClick={() => quitarDolor(id)}>
                    {getEjercicio(id)?.nombre ?? id} <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Fila>
        <Fila titulo="Ejercicios cambiados" ayuda="Los que cambiaste en la rutina o en una sesión: el cambio se mantiene las próximas semanas. Tócalo para deshacerlo.">
          {Object.keys(ajustes.sustituciones ?? {}).length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {Object.entries(ajustes.sustituciones!).map(([de, a]) => (
                <li key={de}>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-auto rounded-xl py-1.5 text-left whitespace-normal"
                    aria-label={`Deshacer: volver a ${getEjercicio(de)?.nombre ?? de}`}
                    onClick={() => {
                      const resto = { ...ajustes.sustituciones };
                      delete resto[de];
                      void ajustesYRegenerar({ sustituciones: resto });
                    }}
                  >
                    {getEjercicio(de)?.nombre ?? de} → {getEjercicio(a)?.nombre ?? a} <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Fila>
      </Glass>

      <Glass className="space-y-3">
        <SectionTitle>Material del gimnasio</SectionTitle>
        <Chips<Equipment>
          multiple
          valor={perfil.equipo}
          onChange={(v) => perfilYRegenerar({ equipo: v as Equipment[] })}
          opciones={equipoGym.map((q) => ({ valor: q, etiqueta: EQUIPO_NOMBRE[q] }))}
        />
        <p className="text-xs text-muted-foreground">La Smith solo se usa si un grupo no tiene ninguna otra opción. La barra libre nunca.</p>
      </Glass>

      <Glass className="space-y-5">
        <SectionTitle>Volumen y progresión</SectionTitle>
        <Fila
          titulo="Repeticiones"
          ayuda={
            (ajustes.rangoReps ?? "auto") === "pesado"
              ? "6–8 reps con más peso (en laterales, posteriores, antebrazo, gemelos y aductores/abductores, 8–10 para cuidar las articulaciones). Descansos más largos."
              : (ajustes.rangoReps ?? "auto") === "auto"
                ? "Cada ejercicio con su rango recomendado."
                : undefined
          }
        >
          <Chips<RangoReps>
            valor={ajustes.rangoReps ?? "auto"}
            onChange={(v) => ajustesYRegenerar({ rangoReps: v as RangoReps })}
            opciones={[
              { valor: "pesado", etiqueta: "Pesado 6–8" },
              { valor: "medio", etiqueta: "Medio 8–12" },
              { valor: "ligero", etiqueta: "Ligero 12–15" },
              { valor: "auto", etiqueta: "Según ejercicio" },
            ]}
          />
        </Fila>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Dropset en la última serie
            <span className="block text-xs text-muted-foreground">
              En máquinas, poleas y mancuernas: al acabar, sin descansar, baja ~25 % el peso y sigue hasta el fallo.
            </span>
          </span>
          <Switch checked={!!ajustes.dropset} onCheckedChange={(v) => guardarAjustes({ dropset: v })} />
        </label>
        <Fila titulo="Prioridad">
          <Chips<Settings["prioridad"]>
            valor={ajustes.prioridad}
            onChange={(v) => ajustesYRegenerar({ prioridad: v as Settings["prioridad"] })}
            opciones={[
              { valor: "superior", etiqueta: "Tren superior" },
              { valor: "equilibrado", etiqueta: "Todo igual" },
            ]}
          />
        </Fila>
        <Fila
          titulo={`Mínimo de series por grupo y semana: ${ajustes.seriesMinimas}`}
          ayuda={
            ajustes.prioridad === "superior"
              ? `Torso y brazo: ${ajustes.seriesMinimas + 2} (antebrazo ${ajustes.seriesMinimas}) · pierna: ${Math.max(4, Math.round(ajustes.seriesMinimas * 0.6))}. El torso se hace al principio de cada sesión.`
              : "Recomendado 10–15 para principiantes. Más series = sesiones más largas."
          }
        >
          <Slider min={6} max={20} step={1} value={[ajustes.seriesMinimas]} onValueCommit={([v]) => ajustesYRegenerar({ seriesMinimas: v })} aria-label="Series mínimas por grupo" />
        </Fila>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Máquinas primero
            <span className="block text-xs text-muted-foreground">Máquina guiada siempre que exista; polea solo si no hay máquina y mancuernas solo si no queda otra (el antebrazo sí va con mancuerna).</span>
          </span>
          <Switch checked={ajustes.evitarMancuernas} onCheckedChange={(v) => ajustesYRegenerar({ evitarMancuernas: v })} />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Biseries (alternar torso y pierna)
            <span className="block text-xs text-muted-foreground">Ahorra ~15 min por sesión.</span>
          </span>
          <Switch checked={ajustes.biseries} onCheckedChange={(v) => ajustesYRegenerar({ biseries: v })} />
        </label>
        <Fila titulo="Descarga cada">
          <Chips<number> valor={ajustes.semanasDescarga} onChange={(v) => guardarAjustes({ semanasDescarga: v as number })} opciones={[6, 7, 8].map((n) => ({ valor: n, etiqueta: `${n} semanas` }))} />
        </Fila>
        <Fila titulo="Incremento con mancuerna">
          <Chips<number> valor={ajustes.incrementos.mancuerna} onChange={(v) => guardarAjustes({ incrementos: { ...ajustes.incrementos, mancuerna: v as number } })} opciones={[1, 1.5, 2, 2.5].map((n) => ({ valor: n, etiqueta: `+${n} kg` }))} />
        </Fila>
        <Fila titulo="Incremento en máquina">
          <Chips<number> valor={ajustes.incrementos.maquina} onChange={(v) => guardarAjustes({ incrementos: { ...ajustes.incrementos, maquina: v as number } })} opciones={[2.5, 5].map((n) => ({ valor: n, etiqueta: `+${n} kg` }))} />
        </Fila>
        <Fila titulo="Incremento en polea">
          <Chips<number> valor={ajustes.incrementos.polea} onChange={(v) => guardarAjustes({ incrementos: { ...ajustes.incrementos, polea: v as number } })} opciones={[1.25, 2.5, 5].map((n) => ({ valor: n, etiqueta: `+${n} kg` }))} />
        </Fila>
      </Glass>

      <Glass className="space-y-4">
        <SectionTitle>Módulos</SectionTitle>
        {(tieneManoLimitada(perfil.limitaciones) || ajustes.moduloBrazo) && (
        <label className="flex items-center justify-between gap-3">
          <span className="flex items-start gap-2 text-sm">
            <Hand className="mt-0.5 size-4 text-violet" />
            <span>
              Activar módulo brazo izquierdo
              <span className="block text-xs text-muted-foreground">Desactivado por defecto. Aparecerá en la navegación y el plan.</span>
            </span>
          </span>
          <Switch
            checked={ajustes.moduloBrazo}
            onCheckedChange={async (v) => {
              await guardarAjustes({ moduloBrazo: v });
              toast.success(v ? "Módulo activado: empieza por la autoevaluación" : "Módulo desactivado");
            }}
            aria-label="Activar módulo brazo izquierdo"
          />
        </label>
        )}
        {ajustes.moduloBrazo && (
          <Button asChild variant="outline" className="h-11 w-full rounded-xl">
            <Link href="/brazo/">Ir al módulo brazo izquierdo</Link>
          </Button>
        )}
        <Fila titulo="Días de core en casa por semana" ayuda="Cuenta para la cobertura del core y la zona lumbar.">
          <Chips<number> valor={ajustes.abdominalesDiasSemana} onChange={(v) => ajustesYRegenerar({ abdominalesDiasSemana: v as number })} opciones={[3, 4, 5, 6, 7].map((n) => ({ valor: n, etiqueta: String(n) }))} />
        </Fila>
        <Fila titulo="Material en casa">
          <Chips<Equipment> multiple valor={ajustes.equipoCasa} onChange={(v) => ajustesYRegenerar({ equipoCasa: v as Equipment[] })} opciones={[{ valor: "esterilla", etiqueta: "Esterilla" }, { valor: "banda_elastica", etiqueta: "Banda elástica" }]} />
        </Fila>
      </Glass>

      <Glass className="space-y-4">
        <SectionTitle>Dieta</SectionTitle>
        <Fila titulo="Objetivo" ayuda="«Automático» sigue tu objetivo de entreno: ganar músculo → ligero superávit; salud → mantener.">
          <Chips<AjustesDieta["objetivo"]>
            valor={ajustes.dieta.objetivo}
            onChange={(v) => guardarAjustes({ dieta: { ...ajustes.dieta, objetivo: v as AjustesDieta["objetivo"] } })}
            opciones={[
              { valor: "auto", etiqueta: "Automático" },
              { valor: "ganar", etiqueta: "Ganar músculo" },
              { valor: "mantener", etiqueta: "Mantener" },
              { valor: "perder", etiqueta: "Perder grasa" },
            ]}
          />
        </Fila>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["kcalManual", "Kcal fijas (opcional)"],
              ["proteinaManual", "Proteína fija, g (opcional)"],
            ] as const
          ).map(([k, t]) => (
            <div key={k}>
              <Label htmlFor={`d-${k}`} className="text-xs">{t}</Label>
              <Input
                id={`d-${k}`}
                type="number"
                inputMode="numeric"
                placeholder="auto"
                defaultValue={ajustes.dieta[k] ?? ""}
                onBlur={(e) => guardarAjustes({ dieta: { ...ajustes.dieta, [k]: e.target.value === "" ? null : Number(e.target.value) } })}
                className="mt-1 h-11 rounded-xl text-center"
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Hoy: {objetivosDiarios(perfil, ajustes.dieta).kcal} kcal y {objetivosDiarios(perfil, ajustes.dieta).proteinas} g de proteína (calculado con
          tu peso, altura, edad y días de entreno).
        </p>
      </Glass>

      <Glass>
        <ReminderCard ajustes={ajustes} />
      </Glass>

      <Glass className="space-y-4">
        <SectionTitle>Apariencia y avisos</SectionTitle>
        <Fila titulo="Tema">
          <Chips<Settings["tema"]> valor={ajustes.tema} onChange={(v) => guardarAjustes({ tema: v as Settings["tema"] })} opciones={[{ valor: "oscuro", etiqueta: "Oscuro" }, { valor: "claro", etiqueta: "Claro" }, { valor: "sistema", etiqueta: "Sistema" }]} />
        </Fila>
        <label className="flex items-center justify-between text-sm">
          Sonido al acabar el descanso
          <Switch checked={ajustes.sonido} onCheckedChange={(v) => guardarAjustes({ sonido: v })} />
        </label>
        <label className="flex items-center justify-between text-sm">
          Vibración
          <Switch checked={ajustes.vibracion} onCheckedChange={(v) => guardarAjustes({ vibracion: v })} />
        </label>
      </Glass>

      <Glass>
        <SectionTitle>Cuenta y sincronización</SectionTitle>
        <CuentaCard />
      </Glass>

      <AdminIA />

      <Glass className="space-y-3">
        <SectionTitle>Tus datos</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => exportarJSON()}>
            Exportar copia
          </Button>
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border text-sm hover:bg-secondary">
            <Upload className="size-4" /> Restaurar copia
            <input
              type="file"
              accept="application/json"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const n = await importarJSON(f);
                  toast.success(`${n} registros restaurados`);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "No se pudo restaurar");
                }
              }}
            />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">Exportación CSV por módulo en Progreso.</p>
        <Button
          variant="destructive"
          className="h-11 w-full rounded-xl"
          onClick={async () => {
            if (!confirm("¿Borrar TODOS los datos de este dispositivo? No se puede deshacer.")) return;
            if (!confirm("Última confirmación: se borrará perfil, rutina e historial locales.")) return;
            await db().delete();
            window.location.replace("/bienvenida/");
          }}
        >
          Borrar datos de este dispositivo
        </Button>
      </Glass>

      <Aviso>
        <p className="font-medium">Acerca de</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          App orientativa: consulta con tu médico o fisioterapeuta. Imágenes de ejercicios: free-exercise-db (dominio público,
          Unlicense). Ilustraciones, icono y estética propios, de inspiración libre y sin recursos oficiales de ninguna obra.
        </p>
      </Aviso>
    </div>
  );
}
