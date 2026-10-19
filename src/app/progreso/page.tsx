"use client";

import { Download, Flame, Scale, Trash2, Trophy } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendario } from "@/components/calendar";
import { GraficaBarras, GraficaLineas } from "@/components/charts-diferidos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Aviso, Cargando, Glass, PageHeader, SectionTitle, Stat } from "@/components/ui-kit";
import { asistencia, ejerciciosRegistrados, evolucionBrazo, records, serieEjercicio, volumenSemana } from "@/lib/app/estadisticas";
import { exportarCSV, exportarJSON } from "@/lib/app/exportar";
import { clavesHechas, fechasDe } from "@/lib/app/resumen";
import { useAbsSessions, useAjustes, useArmSessions, useBodyweights, useComidas, usePerfil, usePlan, useWorkouts } from "@/lib/db/hooks";
import { objetivosDiarios } from "@/lib/domain/nutrition/objetivos";
import { ResumenSemana } from "@/components/resumen-semana";
import { PanelRangos } from "@/components/rangos";
import { logsDeWorkouts } from "@/lib/app/gimnasio";
import { calcularRangos } from "@/lib/domain/rangos";
import { borrar, guardar, nuevoId } from "@/lib/db/repo";
import type { BodyWeight } from "@/lib/db/types";
import { formatoFecha, hoyISO, inicioSemana, sumarDias } from "@/lib/domain/dates";
import { ejercicio } from "@/lib/domain/exercises";
import { GRUPO_NOMBRE, GRUPOS } from "@/lib/domain/muscles";
import { mejorRacha, racha } from "@/lib/domain/weekly-plan";
import { cn } from "@/lib/utils";

function Progreso() {
  const params = useSearchParams();
  const router = useRouter();
  const ajustes = useAjustes();
  const workouts = useWorkouts();
  const abs = useAbsSessions();
  const brazo = useArmSessions();
  const pesos = useBodyweights();
  const comidas = useComidas();
  const perfil = usePerfil();
  const plan = usePlan();
  const [ejSel, setEjSel] = useState<string | null>(null);
  const [semana, setSemana] = useState(() => inicioSemana(hoyISO()));
  const [kg, setKg] = useState("");
  const [diaSel, setDiaSel] = useState<string | null>(null);

  const hoy = hoyISO();
  const claves = useMemo(() => clavesHechas(workouts, abs, brazo), [workouts, abs, brazo]);
  if (!ajustes || !workouts || !abs || !brazo || !pesos || !comidas || !perfil || plan === undefined) return <Cargando />;
  const obj = objetivosDiarios(perfil, ajustes.dieta);

  const tab = params.get("tab") ?? "resumen";
  const fGym = fechasDe(claves, "gimnasio");
  const fAbs = fechasDe(claves, "abdominales");
  const fBrazo = fechasDe(claves, "brazo");
  const todas = [...new Set([...fGym, ...fAbs, ...fBrazo])];
  const recs = records(workouts);
  const registrados = ejerciciosRegistrados(workouts);
  const seleccionado = ejSel ?? registrados[0] ?? null;
  const vol = volumenSemana(workouts, semana);
  const volDatos = GRUPOS.filter((g) => g !== "core").map((g) => ({ grupo: GRUPO_NOMBRE[g], series: Math.round(vol[g] * 10) / 10 }));
  const completadas = workouts.filter((w) => w.estado === "completado").reverse();

  return (
    <div className="space-y-5">
      <PageHeader titulo="Progreso" subtitulo="Historial, gráficas y rachas" />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/progreso/?tab=${v}`)}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1.5 bg-transparent p-0 group-data-horizontal/tabs:h-auto">
          {[
            ["resumen", "Resumen"],
            ["rangos", "Rangos"],
            ["calendario", "Calendario"],
            ["graficas", "Gráficas"],
            ["historial", "Historial"],
            ["peso", "Peso"],
            ...(ajustes.moduloBrazo ? [["brazo", "Brazo izq."]] : []),
          ].map(([v, t]) => (
            <TabsTrigger key={v} value={v} className="h-10 flex-none rounded-xl border border-border px-3 data-[state=active]:border-primary/60 data-[state=active]:text-primary">
              {t}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="rangos" className="mt-4">
          <PanelRangos rangos={calcularRangos(logsDeWorkouts(workouts), undefined, (abs ?? []).filter((s) => !s._deleted))} />
        </TabsContent>

        <TabsContent value="resumen" className="mt-4 space-y-4">
          <ResumenSemana
            workouts={workouts}
            abs={abs}
            comidas={comidas}
            pesos={pesos}
            plan={plan}
            objetivoKcal={obj.kcal}
            objetivoProteina={obj.proteinas}
            lunesActual={inicioSemana(hoy)}
            hoy={hoy}
          />
          <div className="grid grid-cols-2 gap-2">
            <Stat etiqueta="Racha actual" valor={<span className="flex items-center gap-1"><Flame className="size-5" />{racha(todas, hoy)}</span>} detalle="días con actividad" />
            <Stat etiqueta="Mejor racha" valor={mejorRacha(todas)} detalle="días" color="violet" />
            <Stat etiqueta="Gimnasio" valor={fGym.length} detalle="sesiones" color="lime" />
            <Stat etiqueta="Core" valor={fAbs.length} detalle={`días · racha ${racha(fAbs, hoy)}`} color="warn" />
          </div>
          <Glass>
            <SectionTitle>Asistencia (12 semanas)</SectionTitle>
            <GraficaBarras
              datos={asistencia(hoy, 12, fGym, fAbs, fBrazo)}
              x="semana"
              series={[
                { clave: "gimnasio", nombre: "Gimnasio", color: "1" },
                { clave: "core", nombre: "Core", color: "2" },
                ...(ajustes.moduloBrazo ? [{ clave: "brazo", nombre: "Brazo izq.", color: "3" as const }] : []),
              ]}
              unidad="días"
            />
          </Glass>
          <Glass>
            <SectionTitle>
              <span className="flex items-center gap-2"><Trophy className="size-5 text-primary" /> Récords</span>
            </SectionTitle>
            {recs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aparecerán al completar sesiones.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {recs.slice(0, 12).map((r) => (
                  <li key={r.exerciseId} className="flex justify-between gap-3 rounded-xl bg-secondary/50 px-3 py-2">
                    <span className="min-w-0 truncate">{ejercicio(r.exerciseId).nombre}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {r.peso} kg · 1RM ≈ <strong className="text-foreground">{r.e1rm}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Glass>
        </TabsContent>

        <TabsContent value="calendario" className="mt-4 space-y-4">
          <Glass>
            <Calendario hechas={claves} tipos={ajustes.moduloBrazo ? ["gimnasio", "abdominales", "brazo"] : ["gimnasio", "abdominales"]} onDia={setDiaSel} />
          </Glass>
          {diaSel && (
            <Glass>
              <SectionTitle>{formatoFecha(diaSel, { weekday: "long", day: "numeric", month: "long" })}</SectionTitle>
              <ul className="space-y-1 text-sm">
                {workouts.filter((w) => w.fecha === diaSel).map((w) => (
                  <li key={w.id}>🏋 {w.nombre} · {w.estado === "completado" ? "completada" : "a medias"}</li>
                ))}
                {abs.filter((a) => a.fecha === diaSel).map((a) => (
                  <li key={a.id}>◆ Core en casa · {a.completado ? "completado" : "a medias"}</li>
                ))}
                {brazo.filter((b) => b.fecha === diaSel).map((b) => (
                  <li key={b.id}>✋ Brazo izquierdo · dolor {b.dolorAntes} → {b.dolorDespues ?? "—"}</li>
                ))}
                {!claves.has(`${diaSel}|gimnasio`) && !claves.has(`${diaSel}|abdominales`) && !claves.has(`${diaSel}|brazo`) && (
                  <li className="text-muted-foreground">Sin actividad completada.</li>
                )}
              </ul>
            </Glass>
          )}
        </TabsContent>

        <TabsContent value="graficas" className="mt-4 space-y-4">
          {registrados.length > 0 && (
            <Glass>
              <SectionTitle>Tu fuerza</SectionTitle>
              <p className="-mt-2 mb-2 text-xs text-muted-foreground">
                1RM estimado de tu última sesión y cuánto ha subido desde la primera. Toca uno para ver su gráfica.
              </p>
              <ul className="divide-y divide-border">
                {registrados
                  .map((id) => {
                    const serie = serieEjercicio(workouts, id).filter((p) => p.e1rm > 0);
                    if (serie.length === 0) return null;
                    const primero = serie[0].e1rm;
                    const ultimo = serie[serie.length - 1].e1rm;
                    return { id, ultimo, cambio: primero ? Math.round(((ultimo - primero) / primero) * 100) : 0, sesiones: serie.length };
                  })
                  .filter((x): x is NonNullable<typeof x> => x !== null)
                  .sort((a, b) => b.cambio - a.cambio)
                  .map((x) => (
                    <li key={x.id}>
                      <button
                        type="button"
                        className={cn("flex w-full items-center gap-3 py-2.5 text-left", seleccionado === x.id && "text-primary")}
                        onClick={() => {
                          setEjSel(x.id);
                          document.getElementById("grafica-ejercicio")?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{ejercicio(x.id).nombre}</span>
                          <span className="block text-xs text-muted-foreground">{x.sesiones} {x.sesiones === 1 ? "sesión" : "sesiones"}</span>
                        </span>
                        <span className="text-right tabular-nums">
                          <span className="block text-sm font-semibold">{Math.round(x.ultimo)} kg</span>
                          <span className={cn("block text-xs", x.cambio > 0 ? "text-lime" : x.cambio < 0 ? "text-warn" : "text-muted-foreground")}>
                            {x.cambio > 0 ? "▲ +" : x.cambio < 0 ? "▼ " : ""}
                            {x.cambio} %
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </Glass>
          )}
          <Glass id="grafica-ejercicio">
            <SectionTitle>Peso por ejercicio</SectionTitle>
            {registrados.length === 0 ? (
              <p className="text-sm text-muted-foreground">Completa alguna sesión para ver tu evolución.</p>
            ) : (
              <>
                <Select value={seleccionado ?? undefined} onValueChange={setEjSel}>
                  <SelectTrigger className="mb-3 h-11 w-full rounded-xl">
                    <SelectValue placeholder="Elige un ejercicio" />
                  </SelectTrigger>
                  <SelectContent>
                    {registrados.map((id) => (
                      <SelectItem key={id} value={id}>{ejercicio(id).nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {seleccionado && (
                  <GraficaLineas
                    datos={serieEjercicio(workouts, seleccionado)}
                    x="fecha"
                    unidad="kg"
                    series={[
                      { clave: "peso", nombre: "Peso máximo", color: "1" },
                      { clave: "e1rm", nombre: "1RM estimado", color: "2" },
                    ]}
                  />
                )}
              </>
            )}
          </Glass>
          <Glass>
            <SectionTitle
              accion={
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setSemana(sumarDias(semana, -7))} aria-label="Semana anterior">←</Button>
                  <Button variant="ghost" size="sm" onClick={() => setSemana(sumarDias(semana, 7))} aria-label="Semana siguiente" disabled={semana >= inicioSemana(hoy)}>→</Button>
                </div>
              }
            >
              Volumen semanal hecho
            </SectionTitle>
            <p className="-mt-2 mb-2 text-xs text-muted-foreground">Semana del {formatoFecha(semana)} · series efectivas completadas en el gimnasio</p>
            <GraficaBarras datos={volDatos} x="grupo" horizontal alto={420} series={[{ clave: "series", nombre: "Series", color: "1" }]} unidad="series" etiquetaX={(v) => v} />
          </Glass>
        </TabsContent>

        <TabsContent value="historial" className="mt-4 space-y-2">
          {completadas.length === 0 && <Aviso>Aún no hay sesiones completadas.</Aviso>}
          {completadas.map((w) => {
            const hechas = w.ejercicios.flatMap((e) => e.series.filter((s) => s.hecho));
            return (
              <details key={w.id} className="glass p-3">
                <summary className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  <span>
                    <span className="block font-medium">{w.nombre}</span>
                    <span className="text-xs text-muted-foreground">{formatoFecha(w.fecha, { weekday: "short", day: "numeric", month: "short" })} · {hechas.length} series{w.descarga ? " · descarga" : ""}</span>
                  </span>
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {w.ejercicios.map((e, i) => (
                    <li key={i} className="flex justify-between gap-2 border-t border-border pt-1">
                      <span className="min-w-0 truncate">{ejercicio(e.exerciseId).nombre}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {e.series.filter((s) => s.hecho).map((s) => `${s.pesoKg ?? "–"}×${s.reps}`).join("  ") || "—"}
                      </span>
                    </li>
                  ))}
                </ul>
                {w.notas && <p className="mt-2 text-xs italic text-muted-foreground">{w.notas}</p>}
              </details>
            );
          })}
        </TabsContent>

        <TabsContent value="peso" className="mt-4 space-y-4">
          <Glass className="space-y-3">
            <SectionTitle><span className="flex items-center gap-2"><Scale className="size-5 text-primary" /> Peso corporal (opcional)</span></SectionTitle>
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = Number(kg.replace(",", "."));
                if (!v || v < 20 || v > 300) return toast.error("Introduce un peso válido");
                const existente = pesos.find((p) => p.fecha === hoy);
                await guardar<BodyWeight>("bodyweights", { id: existente?.id ?? nuevoId(), fecha: hoy, kg: v });
                setKg("");
                toast.success("Peso guardado");
              }}
            >
              <Input inputMode="decimal" placeholder="kg de hoy" value={kg} onChange={(e) => setKg(e.target.value)} className="h-12 rounded-xl" aria-label="Peso de hoy en kg" />
              <Button type="submit" className="h-12 rounded-xl">Guardar</Button>
            </form>
            {pesos.length > 0 ? (
              <>
                <GraficaLineas datos={pesos.map((p) => ({ fecha: p.fecha, kg: p.kg }))} x="fecha" unidad="kg" ajustarEje series={[{ clave: "kg", nombre: "Peso", color: "1" }]} />
                <ul className="space-y-1 text-sm">
                  {[...pesos].reverse().slice(0, 6).map((p) => (
                    <li key={p.id} className="flex items-center justify-between rounded-xl bg-secondary/50 px-3 py-1.5">
                      {formatoFecha(p.fecha)} · {p.kg} kg
                      <Button variant="ghost" size="icon-sm" aria-label="Borrar" onClick={() => borrar("bodyweights", p.id)}><Trash2 /></Button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Sin registros todavía.</p>
            )}
          </Glass>
        </TabsContent>

        {ajustes.moduloBrazo && (
          <TabsContent value="brazo" className="mt-4 space-y-4">
            <Glass>
              <SectionTitle>Dolor por sesión (0–10)</SectionTitle>
              {brazo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin sesiones del brazo izquierdo.</p>
              ) : (
                <GraficaLineas
                  datos={evolucionBrazo(brazo)}
                  x="fecha"
                  series={[
                    { clave: "antes", nombre: "Antes", color: "2" },
                    { clave: "despues", nombre: "Después", color: "1" },
                  ]}
                />
              )}
            </Glass>
            <Glass>
              <SectionTitle>Volumen (reps o segundos hechos)</SectionTitle>
              <GraficaBarras datos={evolucionBrazo(brazo)} x="fecha" series={[{ clave: "volumen", nombre: "Volumen", color: "2" }]} />
            </Glass>
          </TabsContent>
        )}
      </Tabs>

      <Glass className="space-y-2">
        <SectionTitle><span className="flex items-center gap-2"><Download className="size-5 text-primary" /> Exportar datos</span></SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => exportarCSV("gimnasio")}>CSV gimnasio</Button>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => exportarCSV("abdominales")}>CSV core</Button>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => exportarCSV("peso")}>CSV peso</Button>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => exportarCSV("dieta")}>CSV dieta</Button>
          {ajustes.moduloBrazo && <Button variant="outline" className="h-11 rounded-xl" onClick={() => exportarCSV("brazo")}>CSV brazo</Button>}
          <Button className="col-span-2 h-11 rounded-xl" onClick={() => exportarJSON()}>Copia completa (JSON)</Button>
        </div>
      </Glass>
    </div>
  );
}

export default function Pagina() {
  return (
    <Suspense fallback={<Cargando />}>
      <Progreso />
    </Suspense>
  );
}
