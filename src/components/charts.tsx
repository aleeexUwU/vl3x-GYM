"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatoFecha } from "@/lib/domain/dates";

/** Serie de una gráfica. Colores categóricos en orden fijo: --chart-1, --chart-2, --chart-3. */
export interface Serie {
  clave: string;
  nombre: string;
  color: "1" | "2" | "3";
}

const eje = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;

function Consejo({ active, payload, label, unidad, etiquetaX }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  unidad?: string;
  etiquetaX: (v: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-foreground">{label ? etiquetaX(label) : ""}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <strong>{p.value}</strong> {unidad}
        </p>
      ))}
    </div>
  );
}

/** Tabla equivalente (accesibilidad): los mismos datos sin depender del color. */
function TablaDatos<T extends Record<string, unknown>>({ datos, x, series, etiquetaX }: {
  datos: T[];
  x: keyof T & string;
  series: Serie[];
  etiquetaX: (v: string) => string;
}) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-muted-foreground">Ver como tabla</summary>
      <div className="mt-2 max-h-56 overflow-auto">
        <table className="w-full text-left tabular-nums">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Fecha</th>
              {series.map((s) => (
                <th key={s.clave} className="py-1 pr-2 font-medium">{s.nombre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.map((d, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1 pr-2">{etiquetaX(String(d[x]))}</td>
                {series.map((s) => (
                  <td key={s.clave} className="py-1 pr-2">{String(d[s.clave] ?? "—")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

const fechaCorta = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatoFecha(v) : v);

type Fila = Record<string, string | number | null>;

export function GraficaLineas({
  datos,
  x,
  series,
  unidad,
  alto = 220,
  ajustarEje = false,
}: {
  datos: Fila[];
  x: string;
  series: Serie[];
  unidad?: string;
  alto?: number;
  /** El eje Y se ajusta a los datos (no empieza en 0): para el peso corporal, donde importan las décimas. */
  ajustarEje?: boolean;
}) {
  return (
    <figure>
      <div style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey={x} tickFormatter={fechaCorta} {...eje} minTickGap={24} />
            <YAxis
              {...eje}
              width={44}
              allowDecimals={ajustarEje}
              domain={ajustarEje ? [(min: number) => Math.floor(min - 1), (max: number) => Math.ceil(max + 1)] : undefined}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={<Consejo unidad={unidad} etiquetaX={fechaCorta} />}
            />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: "var(--foreground)" }} iconType="circle" />}
            {series.map((s) => (
              <Line
                key={s.clave}
                type="monotone"
                dataKey={s.clave}
                name={s.nombre}
                stroke={`var(--chart-${s.color})`}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2, stroke: "var(--background)", fill: `var(--chart-${s.color})` }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "var(--background)" }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <TablaDatos datos={datos} x={x} series={series} etiquetaX={fechaCorta} />
    </figure>
  );
}

export function GraficaBarras({
  datos,
  x,
  series,
  unidad,
  horizontal = false,
  alto = 220,
  etiquetaX = fechaCorta,
}: {
  datos: Fila[];
  x: string;
  series: Serie[];
  unidad?: string;
  horizontal?: boolean;
  alto?: number;
  etiquetaX?: (v: string) => string;
}) {
  return (
    <figure>
      <div style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={datos}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 8, right: 8, bottom: 0, left: horizontal ? 0 : -18 }}
            barGap={2}
          >
            <CartesianGrid stroke="var(--border)" vertical={horizontal} horizontal={!horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" {...eje} allowDecimals={false} />
                <YAxis type="category" dataKey={x} {...eje} width={110} tickFormatter={etiquetaX} />
              </>
            ) : (
              <>
                <XAxis dataKey={x} tickFormatter={etiquetaX} {...eje} minTickGap={12} />
                <YAxis {...eje} width={44} allowDecimals={false} />
              </>
            )}
            <Tooltip cursor={{ fill: "var(--secondary)" }} content={<Consejo unidad={unidad} etiquetaX={etiquetaX} />} />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />}
            {series.map((s) => (
              <Bar
                key={s.clave}
                dataKey={s.clave}
                name={s.nombre}
                fill={`var(--chart-${s.color})`}
                radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                maxBarSize={22}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TablaDatos datos={datos} x={x} series={series} etiquetaX={etiquetaX} />
    </figure>
  );
}
