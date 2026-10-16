// Dona elíptica con volumen en SVG; compatible con las imágenes del README.
import { f1 } from "./comun.mjs";

export const COLORES = {
  dark: ["#b4213c", "#d86c7f", "#a7b1c2", "#e6c1a2", "#716180"],
  light: ["#92162e", "#c5536b", "#65778f", "#bc8356", "#897198"],
};
const TAU = Math.PI * 2;
const CX = 220, CY = 270, RX = 159, RY = 105, INTERIOR = .57, PROFUNDIDAD = 28;
const punto = (a, r = 1, z = 0) => [CX + RX * r * Math.cos(a), CY + RY * r * Math.sin(a) + z];
const xy = p => p.map(f1).join(" ");
const arco = (a, b, r = 1, z = 0, vuelta = 1) => `A${f1(RX * r)} ${f1(RY * r)} 0 ${b - a > Math.PI ? 1 : 0} ${vuelta} ${xy(punto(vuelta ? b : a, r, z))}`;

function cara(a, b) {
  return `M${xy(punto(a))}${arco(a, b)}L${xy(punto(b, INTERIOR))}${arco(a, b, INTERIOR, 0, 0)}Z`;
}

function pared(a, b, r) {
  return `M${xy(punto(a, r))}${arco(a, b, r)}L${xy(punto(b, r, PROFUNDIDAD))}${arco(a, b, r, PROFUNDIDAD, 0)}Z`;
}

export function circular3d(lz, tipos, total, dias) {
  const colores = COLORES[lz.tema];
  lz.defs.push(
    `<filter id="sombraCircular" x="-30%" y="-100%" width="160%" height="300%"><feGaussianBlur stdDeviation="9"/></filter>`,
    `<linearGradient id="profundidadCircular" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".48"/></linearGradient>`
  );
  lz.raw(`<ellipse cx="${CX}" cy="399" rx="145" ry="14" fill="${lz.tema === "dark" ? "#000" : "#73545d"}" opacity=".25" filter="url(#sombraCircular)"/>`);
  const sectores = [];
  let angulo = -.42;
  tipos.forEach(([nombre, n], i) => {
    if (n <= 0 || !total) return;
    const amplitud = n / total * TAU;
    // También funciona si solo hay un tipo: SVG exige un arco menor a 2 PI.
    const hueco = Math.min(.022, amplitud * .12);
    sectores.push({ a: angulo + hueco / 2, b: angulo + amplitud - hueco / 2, color: colores[i], nombre, n });
    angulo += amplitud;
  });
  if (!total) sectores.push({ a: 0, b: TAU - .001, color: lz.t.linea, nombre: "Sin actividad", n: 0 });
  // Dibujar primero las paredes interiores traseras y luego el borde frontal.
  // Cortar en múltiplos de PI conserva la oclusión al atravesar 0 o 2 PI.
  for (const interior of [true, false]) {
    for (const s of sectores) {
      const cortes = [s.a];
      for (let k = Math.floor(s.a / Math.PI) + 1; k * Math.PI < s.b; k++) cortes.push(k * Math.PI);
      cortes.push(s.b);
      for (let j = 0; j < cortes.length - 1; j++) {
        const a = cortes[j], b = cortes[j + 1];
        if ((Math.sin((a + b) / 2) < 0) !== interior) continue;
        const d = pared(a, b, interior ? INTERIOR : 1);
        lz.raw(`<path d="${d}" fill="${s.color}"/><path d="${d}" fill="url(#profundidadCircular)"/>`);
      }
    }
  }
  sectores.forEach((s, i) => {
    lz.defs.push(`<linearGradient id="sector${i}" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="${s.color}"/><stop offset="1" stop-color="${s.color}" stop-opacity=".82"/></linearGradient>`);
    lz.raw(`<g><title>${s.nombre}: ${s.n} contribuciones</title><path d="${cara(s.a, s.b)}" fill="url(#sector${i})" stroke="${s.color}" stroke-width=".7"/></g>`);
  });
  lz.raw(lz.texto(CX, 275, total.toLocaleString("es-ES"), "cifra", "tinta", { anchor: "middle", extra: ' style="font-size:42px"' }));
  lz.raw(lz.texto(CX, 297, "contribuciones", "pequeno-fuerte", "tinta", { anchor: "middle" }));
  lz.raw(lz.texto(CX, 315, `últimos ${dias} días`, "mono-pequeno", "suave", { anchor: "middle" }));
}
