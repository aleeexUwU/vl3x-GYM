"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Muñecos animados propios (SVG) para los ejercicios de core que no tienen animación
 * libre en ExerciseDB (o la que hay está mal: el "flutter kicks" es boca abajo en un
 * banco). Mismo lenguaje que ExerciseDB: figura gris con volumen, de lado, y el músculo
 * que trabaja en rojo. Es un esqueleto articulado: cada ejercicio son unas poses clave y
 * se interpola entre ellas con suavizado. Con "reducir movimiento" se queda en la pose clave.
 */

export type ClaveMuneco = "plancha" | "hollow" | "vacio" | "aleteo" | "tijeras";

export const MUNECO_CORE: Record<string, ClaveMuneco> = {
  plancha_antebrazos: "plancha",
  hollow_hold: "hollow",
  vacio_abdominal: "vacio",
  patadas_aleteo: "aleteo",
  patadas_tijera: "tijeras",
};

type P = [number, number];
interface Pose {
  cabeza: P;
  cuello: P;
  hombro: P;
  codo: P;
  mano: P;
  cadera: P;
  rodilla: P;
  tobillo: P;
  pie: P;
  /** Brazo y pierna del lado lejano (más oscuros, por detrás). */
  codo2: P;
  mano2: P;
  rodilla2: P;
  tobillo2: P;
  pie2: P;
  /** Hacia dónde mira la tripa respecto al eje hombro→cadera (1 o -1). */
  tripa: number;
  /** Barriga (vacío abdominal): 1 normal, 0 metida. */
  barriga?: number;
}

interface Clip {
  poses: Pose[];
  /** Duración de cada tramo (ms). */
  tramos: number[];
}

const rot = (p: P, c: P, grados: number): P => {
  const a = (grados * Math.PI) / 180;
  const [x, y] = [p[0] - c[0], p[1] - c[1]];
  return [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)];
};
const rotPose = (pose: Pose, c: P, g: number): Pose => {
  const out = { ...pose };
  for (const k of Object.keys(pose) as (keyof Pose)[]) {
    const v = pose[k];
    if (Array.isArray(v)) (out as Record<string, unknown>)[k] = rot(v as P, c, g);
  }
  return out;
};

// ---------- Poses ----------
const PLANCHA: Pose = {
  pie: [30, 199], tobillo: [38, 193], rodilla: [72, 186], cadera: [108, 177],
  hombro: [166, 162], cuello: [176, 156], cabeza: [190, 151],
  codo: [168, 193], mano: [198, 195],
  codo2: [160, 193], mano2: [190, 195],
  pie2: [26, 199], tobillo2: [34, 193], rodilla2: [68, 186],
  tripa: 1,
};
const PLANCHA_B: Pose = { ...PLANCHA, cadera: [108, 175], rodilla: [72, 185], hombro: [166, 161], cuello: [176, 155], cabeza: [190, 150] };

const HOLLOW: Pose = {
  cadera: [124, 192], hombro: [84, 177], cuello: [74, 172], cabeza: [62, 166],
  codo: [52, 168], mano: [22, 160], codo2: [54, 172], mano2: [24, 165],
  rodilla: [166, 182], tobillo: [204, 170], pie: [212, 162],
  rodilla2: [166, 185], tobillo2: [204, 174], pie2: [212, 166],
  tripa: -1,
};

const tumbado = (dPierna: number, dPierna2: number): Pose => {
  const cadera: P = [128, 192];
  const base = { rodilla: [168, 186] as P, tobillo: [206, 180] as P, pie: [212, 173] as P };
  const pierna = (d: number) => ({
    rodilla: rot(base.rodilla, cadera, d),
    tobillo: rot(base.tobillo, cadera, d),
    pie: rot(base.pie, cadera, d),
  });
  const a = pierna(dPierna);
  const b = pierna(dPierna2);
  return {
    cadera, hombro: [82, 186], cuello: [72, 182], cabeza: [59, 176],
    codo: [104, 196], mano: [126, 198], codo2: [102, 196], mano2: [124, 198],
    rodilla: a.rodilla, tobillo: a.tobillo, pie: a.pie,
    rodilla2: b.rodilla, tobillo2: b.tobillo, pie2: b.pie,
    tripa: -1,
  };
};

const VACIO: Pose = {
  pie: [134, 199], tobillo: [120, 195], rodilla: [121, 167], cadera: [118, 137],
  hombro: [121, 92], cuello: [123, 83], cabeza: [126, 71],
  codo: [123, 117], mano: [128, 139], codo2: [117, 117], mano2: [114, 139],
  pie2: [130, 199], tobillo2: [116, 195], rodilla2: [117, 167],
  tripa: 1, barriga: 1,
};

const CLIPS: Record<ClaveMuneco, Clip> = {
  plancha: { poses: [PLANCHA, PLANCHA_B, PLANCHA], tramos: [1500, 1500] },
  hollow: {
    poses: [HOLLOW, rotPose(HOLLOW, [124, 194], -4), HOLLOW, rotPose(HOLLOW, [124, 194], 3), HOLLOW],
    tramos: [800, 800, 800, 800],
  },
  aleteo: { poses: [tumbado(-12, 2), tumbado(2, -12), tumbado(-12, 2)], tramos: [420, 420] },
  tijeras: { poses: [tumbado(-16, -2), tumbado(-2, -16), tumbado(-16, -2)], tramos: [800, 800] },
  vacio: {
    poses: [VACIO, { ...VACIO, barriga: 0 }, { ...VACIO, barriga: 0 }, VACIO],
    tramos: [1200, 2400, 1200],
  },
};

const suave = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const mezclar = (a: Pose, b: Pose, t: number): Pose => {
  const out = { ...a };
  for (const k of Object.keys(a) as (keyof Pose)[]) {
    const va = a[k];
    const vb = b[k];
    if (Array.isArray(va) && Array.isArray(vb)) (out as Record<string, unknown>)[k] = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t];
    else if (typeof va === "number" && typeof vb === "number") (out as Record<string, unknown>)[k] = va + (vb - va) * t;
  }
  return out;
};

function poseEn(clip: Clip, ms: number): Pose {
  const total = clip.tramos.reduce((s, d) => s + d, 0);
  let t = ms % total;
  for (let i = 0; i < clip.tramos.length; i++) {
    if (t <= clip.tramos[i]) return mezclar(clip.poses[i], clip.poses[i + 1], suave(t / clip.tramos[i]));
    t -= clip.tramos[i];
  }
  return clip.poses[0];
}

function useReducido(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

// ---------- Dibujo ----------
const BORDE = "rgb(78, 78, 84)";
type Seg = [P, P, number];

/**
 * Silueta en dos pasadas (todos los contornos y luego todos los rellenos) para que las
 * articulaciones se fundan sin costuras, como un maniquí.
 */
function Silueta({ segs, cabeza, lejos = false }: { segs: Seg[]; cabeza?: P; lejos?: boolean }) {
  const linea = (s: Seg, extra: number, color: string, k: number) => (
    <line key={k} x1={s[0][0]} y1={s[0][1]} x2={s[1][0]} y2={s[1][1]} stroke={color} strokeWidth={s[2] + extra} strokeLinecap="round" />
  );
  const relleno = lejos ? "url(#muneco-lejos)" : "url(#muneco-piel)";
  return (
    <g>
      {segs.map((s, k) => linea(s, 2.6, BORDE, k))}
      {cabeza && <circle cx={cabeza[0]} cy={cabeza[1]} r={11.8} fill={BORDE} />}
      {segs.map((s, k) => linea(s, 0, lejos ? "rgb(178, 178, 184)" : "rgb(222, 222, 226)", k))}
      {cabeza && <circle cx={cabeza[0]} cy={cabeza[1]} r={10.5} fill={relleno} />}
    </g>
  );
}

function Figura({ p, mov }: { p: Pose; mov: boolean }) {
  // Abdomen: franja del tronco del lado de la tripa, del 35 % al 90 % hacia la cadera.
  const dx = p.cadera[0] - p.hombro[0];
  const dy = p.cadera[1] - p.hombro[1];
  const L = Math.hypot(dx, dy) || 1;
  const nx = (-dy / L) * p.tripa;
  const ny = (dx / L) * p.tripa;
  const en = (t: number, off: number): P => [p.hombro[0] + dx * t + nx * off, p.hombro[1] + dy * t + ny * off];
  const barriga = p.barriga ?? 0;
  const lejos: Seg[] = [
    [p.cadera, p.rodilla2, 15],
    [p.rodilla2, p.tobillo2, 10],
    [p.tobillo2, p.pie2, 6],
    [p.hombro, p.codo2, 10],
    [p.codo2, p.mano2, 7],
  ];
  const cerca: Seg[] = [
    [p.cuello, p.hombro, 10],
    [p.hombro, p.cadera, 24],
    ...(barriga > 0 ? ([[en(0.45, 6 * barriga), en(0.82, 5 * barriga), 16 * barriga + 4]] as Seg[]) : []),
    [p.cadera, p.rodilla, 16],
    [p.rodilla, p.tobillo, 11],
    [p.tobillo, p.pie, 6],
    [p.hombro, p.codo, 11],
    [p.codo, p.mano, 8],
  ];
  const a1 = en(0.36, 4 + 3 * barriga);
  const a2 = en(0.88, 3 + 3 * barriga);
  return (
    <g>
      <Silueta segs={lejos} lejos />
      <Silueta segs={cerca} cabeza={p.cabeza} />
      <line x1={a1[0]} y1={a1[1]} x2={a2[0]} y2={a2[1]} stroke="rgb(208, 56, 64)" strokeWidth={9 + 4 * barriga} strokeLinecap="round">
        {mov && <animate attributeName="opacity" values="0.65;1;0.65" dur="1.6s" repeatCount="indefinite" />}
      </line>
      {/* Brazo cercano por encima del abdomen (de pie, va por delante). */}
      {p.barriga != null && <Silueta segs={[[p.hombro, p.codo, 11], [p.codo, p.mano, 8]]} />}
    </g>
  );
}

export function MunecoCore({ clave, nombre, className }: { clave: ClaveMuneco; nombre: string; className?: string }) {
  const reducido = useReducido();
  const clip = CLIPS[clave];
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (reducido) return;
    let id = 0;
    const inicio = performance.now();
    let ultimo = 0;
    const paso = (t: number) => {
      // ~30 fps: suficiente para un movimiento lento y gasta la mitad.
      if (t - ultimo > 33) {
        ultimo = t;
        setMs(t - inicio);
      }
      id = requestAnimationFrame(paso);
    };
    id = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(id);
  }, [reducido]);
  const pose = reducido ? clip.poses[1] : poseEn(clip, ms);
  const de = clave === "vacio" ? "40 50 160 158" : "0 118 240 100";
  return (
    <svg viewBox={de} className={className} role="img" aria-label={`Animación de ${nombre} con el músculo que trabaja en rojo`}>
      <defs>
        <linearGradient id="muneco-piel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(244, 244, 246)" />
          <stop offset="1" stopColor="rgb(184, 184, 190)" />
        </linearGradient>
        <linearGradient id="muneco-lejos" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgb(206, 206, 210)" />
          <stop offset="1" stopColor="rgb(150, 150, 158)" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={240} height={240} fill="white" />
      <line x1={8} y1={203} x2={232} y2={203} stroke="rgb(214, 214, 218)" strokeWidth={2} strokeLinecap="round" />
      <Figura p={pose} mov={!reducido} />
    </svg>
  );
}
