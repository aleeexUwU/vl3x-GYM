import type { Exercise } from "../types";
import { ANIMACION_BILATERAL } from "./bilateral";

/**
 * Animaciones de ExerciseDB (API v1 gratuita, https://oss.exercisedb.dev): un muñeco 3D
 * haciendo el ejercicio con los músculos que trabajan pintados en rojo. Se cargan desde
 * su servidor cuando hay conexión (no se copian a la app); sin red se usan las fotos.
 *
 * Emparejado a mano con el ejercicio más parecido. Varias son a dos brazos o con otro
 * apoyo: la técnica a una mano está en los pasos y en Consejos. Los que no tienen
 * equivalente (belt squat...) siguen con fotos; los de core sin animación libre usan
 * muñecos propios (components/exercise/muneco-core.tsx).
 */
const ANIMACION: Record<string, string> = {
  // Pecho
  press_mancuerna_una_mano: "SpYC0Kp",
  press_inclinado_mancuerna_una_mano: "rDAiRf9",
  press_pecho_maquina_una_mano: "DOoWcnA",
  cruce_polea_una_mano: "0CXGHya",
  contractora_una_mano: "v3xmPAR",
  press_banda_una_mano: "4x5Okof",
  press_smith_una_mano: "trqKQv2",
  // Espalda
  jalon_polea_una_mano: "U5INZY6",
  jalon_maquina_una_mano: "tTuZSDT",
  remo_mancuerna_pecho_apoyado: "C0MA9bC",
  remo_polea_baja_una_mano: "A3P4O0R",
  remo_maquina_una_mano: "7I6LNUG",
  remo_polea_alta_arrodillado: "WrYPP2g",
  pullover_polea_una_mano: "x69MAlq",
  remo_banda_una_mano: "km0sQC0",
  face_pull_una_mano: "yUdIGNs",
  remo_alto_polea_una_mano: "ZfyAGhK",
  encogimiento_mancuerna: "NJzBsGJ",
  encogimiento_polea: "Eg98Ft9",
  face_pull_banda: "tc5dYrf",
  // Hombro
  press_hombro_mancuerna_una_mano: "1TkiAFK",
  press_hombro_maquina_una_mano: "2KGnL6M",
  elevacion_frontal_mancuerna: "3eGE2JC",
  elevacion_frontal_polea: "u2X71Np",
  press_hombro_smith_una_mano: "MRaFiZP",
  elevacion_frontal_banda: "TFA88iB",
  elevacion_lateral_mancuerna: "DsgkuIt",
  elevacion_lateral_polea: "myJeTAe",
  elevacion_lateral_inclinado: "aTNKZiC",
  elevacion_lateral_banda: "sTg7iys",
  pajaro_polea_una_mano: "aqvSOQE",
  pajaro_mancuerna_pecho_apoyado: "53Ttlck",
  contractora_inversa_una_mano: "myfUsKf",
  // Brazos
  curl_mancuerna: "3s4NnTh",
  curl_martillo: "2sQGZ5b",
  curl_concentrado: "gvsWLQw",
  curl_polea_una_mano: "YTur5nR",
  curl_maquina_una_mano: "q6y3OhV",
  curl_banda: "3omWx6P",
  extension_triceps_polea_una_mano: "qRZ5S1N",
  extension_triceps_overhead_mancuerna: "kont8Ut",
  extension_triceps_overhead_polea: "i11JWU7",
  patada_triceps_pecho_apoyado: "bQy2Eni",
  extension_triceps_banda: "obe5LMq",
  curl_muneca_mancuerna: "7AnZtSv",
  extension_muneca_mancuerna: "4Jc36XM",
  paseo_granjero_una_mano: "qPEzJjA",
  curl_muneca_polea: "LrV4s90",
  // Pierna
  prensa: "10Z2DXU",
  hack_squat: "Qa55kX1",
  extension_cuadriceps: "my33uHU",
  sentadilla_goblet_una_mano: "yn8yg1r",
  bulgara_mancuerna_derecha: "qx4fgX7",
  subida_cajon: "aXtJhlg",
  sentadilla_peso_corporal: "6YUfHPL",
  sentadilla_smith: "jFtipLl",
  curl_femoral_tumbado: "17lJ1kr",
  curl_femoral_sentado: "Zg3XY7P",
  peso_muerto_rumano_mancuerna: "rR0LJzx",
  puente_isquios_talones: "aWedzZX",
  peso_muerto_rumano_smith: "UfePqpx",
  hip_thrust_maquina: "qg2PGl6",
  puente_gluteo_mancuerna: "qKBpF7I",
  patada_gluteo_polea: "Kpajagk",
  puente_gluteo_una_pierna: "rmEukuS",
  hip_thrust_smith: "qg2PGl6",
  aductor_maquina: "oHsrypV",
  aduccion_polea: "hBGWILP",
  aduccion_tumbado: "c8f5cSY",
  abductor_maquina: "CHpahtl",
  paso_lateral_banda: "O95afRA",
  abduccion_pie: "7WaDzyL",
  gemelo_maquina_pie: "dPmaUaU",
  gemelo_prensa: "Dx2RIva",
  gemelo_sentado_mancuerna: "r29jP7S",
  gemelo_pie_peso_corporal: "6HmFgmx",
  gemelo_smith: "6MaEjVA",
  hiperextension: "zhMwOwE",
  // Core
  crunch: "TFqbd8t",
  crunch_brazos_arriba: "kjJ3VoQ",
  crunch_encogido: "BMMolZ3",
  crunch_inverso: "nCU1Ekp",
  elevacion_piernas: "WhuFnR7",
  elevacion_piernas_cadera: "9IxJdtC",
  toque_talones: "qaZVsGk",
  crunch_bicicleta: "1ZFqTDN",
  giro_ruso: "XVDdcoj",
  crunch_oblicuo: "QUDd8WS",
  plancha_lateral_derecha: "RKjH6Lt",
  plancha_lateral_izquierda: "RKjH6Lt",
  dead_bug: "iny3m5y",
  pallof_banda: "9pa4H5m",
  nadador: "SP3hUez",
  superman: "SP3hUez",
  plancha_un_brazo_rodillas: "h1ezqSu",
  plancha_un_brazo: "yRpV5TC",
  puente_gluteo: "u0cNiij",
  puente_gluteo_una_pierna_casa: "rmEukuS",
  ...ANIMACION_BILATERAL,
};

export const ORIGEN_ANIMACIONES = "https://static.exercisedb.dev";

export function animacionDe(e: Pick<Exercise, "id">): string | null {
  const id = ANIMACION[e.id];
  return id ? `${ORIGEN_ANIMACIONES}/media/${id}.gif` : null;
}

export const IDS_CON_ANIMACION = Object.keys(ANIMACION);
