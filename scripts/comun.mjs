// Piezas compartidas por los generadores del perfil.
//
// - La paleta, en tema claro y oscuro.
// - La tipografía: Space Grotesk e IBM Plex Mono van incrustadas en cada SVG,
//   recortadas a los caracteres que usa. Así se ven igual en cualquier sistema
//   y el texto se puede medir para partir líneas con las métricas reales.
// - `Lienzo`, que monta un SVG y apunta qué caracteres usa cada fuente.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as fontkit from "fontkit";
import subsetFont from "subset-font";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ASSETS = path.join(RAIZ, "assets");
const FUENTES = path.join(ASSETS, "fuentes");
const CACHE_ICONOS = path.join(ASSETS, "iconos");

// Ancho de diseño: el de la columna del README en escritorio.
export const ANCHO = 860;

const SIMPLE_ICONS = (slug) => `https://cdn.jsdelivr.net/npm/simple-icons@13.21.0/icons/${slug}.svg`;

export const TEMAS = {
  dark: {
    // Neutros fríos; el rojo queda solo para los detalles.
    fondo: "#101216",
    panel: "#161920",
    linea: "#262a32",
    rejilla: "#1b1e25",
    tinta: "#e6e8eb",
    suave: "#959ba4",
    tenue: "#3a3f48",
    acento: "#800517",
    acento2: "#aeb4bd",
    ok: "#3fb950",
    // tonos de rojo, de más intenso a más apagado
    rojos: ["#800517", "#a33a47", "#6e2a32", "#45222a"],
  },
  light: {
    fondo: "#fdfafa",
    panel: "#f8f0f0",
    linea: "#ecdcdc",
    rejilla: "#f4e9e9",
    tinta: "#241b1c",
    suave: "#6e6162",
    tenue: "#cfbdbd",
    acento: "#800517",
    acento2: "#8a7d7e",
    ok: "#1a7f37",
    rojos: ["#800517", "#a8434f", "#cf8a92", "#ebc9cd"],
  },
};

// Animación mínima compartida: un parpadeo suave para los cursores. Lo demás
// se anima con SMIL en cada pieza, y solo donde aporta algo.
export const CSS_ANIM =
  "@keyframes late{0%,100%{opacity:1}50%{opacity:0}}" +
  ".la{animation:late 1.1s steps(1) infinite}" +
  "@media (prefers-reduced-motion:reduce){.la{animation:none}}";

// --- tipografía ------------------------------------------------------------

// clave -> [fichero, ejes, familia CSS, peso CSS]
const DEF_FUENTES = {
  sans400: ["SpaceGrotesk.ttf", { wght: 400 }, "PT Sans", 400],
  sans500: ["SpaceGrotesk.ttf", { wght: 500 }, "PT Sans", 500],
  sans600: ["SpaceGrotesk.ttf", { wght: 600 }, "PT Sans", 600],
  display: ["SpaceGrotesk.ttf", { wght: 700 }, "PT Display", 700],
  mono400: ["IBMPlexMono-Regular.ttf", null, "PT Mono", 400],
  mono500: ["IBMPlexMono-Medium.ttf", null, "PT Mono", 500],
};

const PILA = {
  "PT Sans": "'PT Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  "PT Display": "'PT Display', 'PT Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif",
  "PT Mono": "'PT Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

// nombre -> [fuente, tamaño, espaciado en em]
export const ESTILOS = {
  nombre: ["display", 54, -0.03],
  prompt: ["mono400", 13, 0],
  titular: ["sans400", 19, -0.005],
  seccion: ["mono500", 12, 0.02],
  meta: ["mono400", 11, 0.02],
  etiqueta: ["mono400", 11.5, 0],
  cuerpo: ["sans400", 15, 0],
  "cuerpo-fuerte": ["sans600", 15, 0],
  dato: ["sans500", 14, 0],
  titulo: ["sans600", 18, -0.01],
  cifra: ["display", 28, -0.02],
  pequeno: ["sans400", 13, 0],
  "pequeno-fuerte": ["sans500", 13, 0],
  "mono-pequeno": ["mono400", 10.5, 0.02],
};

const cacheFuentes = new Map();
function fuente(clave) {
  if (!cacheFuentes.has(clave)) {
    const [fichero, ejes] = DEF_FUENTES[clave];
    const buf = fs.readFileSync(path.join(FUENTES, fichero));
    let f = fontkit.create(buf);
    if (ejes) f = f.getVariation(ejes);
    cacheFuentes.set(clave, { buf, f });
  }
  return cacheFuentes.get(clave);
}

/** Ancho de un texto en px con las métricas de la fuente incrustada. */
export function medir(texto, estilo) {
  const [clave, tam, esp] = ESTILOS[estilo];
  const { f } = fuente(clave);
  const run = f.layout(texto);
  return (run.advanceWidth / f.unitsPerEm) * tam + esp * tam * Math.max(texto.length - 1, 0);
}

/** Parte un texto en líneas que caben en `max`, sin cortar palabras. */
export function envolver(texto, estilo, max) {
  const lineas = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (actual && medir(prueba, estilo) > max) {
      lineas.push(actual);
      actual = palabra;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

async function recorte(clave, caracteres) {
  const [, ejes] = DEF_FUENTES[clave];
  const { buf } = fuente(clave);
  const opciones = { targetFormat: "woff2" };
  if (ejes) opciones.variationAxes = ejes;
  const out = await subsetFont(buf, caracteres + " ", opciones);
  return out.toString("base64");
}

// --- utilidades ------------------------------------------------------------

export const datos = () => JSON.parse(fs.readFileSync(path.join(RAIZ, "datos", "perfil.json"), "utf8"));

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const f1 = (x) => String(Math.round(x * 10) / 10);

/** [título, trazado] de un icono de simple-icons, con caché en disco. */
export async function icono(slug) {
  fs.mkdirSync(CACHE_ICONOS, { recursive: true });
  const fichero = path.join(CACHE_ICONOS, `${slug}.svg`);
  if (!fs.existsSync(fichero)) {
    const r = await fetch(SIMPLE_ICONS(slug));
    if (!r.ok) throw new Error(`icono ${slug}: HTTP ${r.status}`);
    fs.writeFileSync(fichero, await r.text());
  }
  const svg = fs.readFileSync(fichero, "utf8");
  const d = svg.match(/<path d="([^"]+)"/);
  if (!d) throw new Error(`el icono ${slug} no tiene trazado`);
  return d[1];
}

export function guardar(nombre, porTema) {
  for (const [tema, svg] of Object.entries(porTema)) {
    fs.writeFileSync(path.join(ASSETS, `${nombre}-${tema}.svg`), svg);
  }
}

// --- el lienzo -------------------------------------------------------------

export class Lienzo {
  constructor(ancho, alto, tema, titulo, desc = "") {
    Object.assign(this, { ancho, alto, tema, titulo, desc });
    this.t = TEMAS[tema];
    this.partes = [];
    this.defs = [];
    this.css = [];
    this.usados = new Map();
    this.estilos = new Set();
  }

  raw(s) {
    this.partes.push(s);
  }

  color(c) {
    return this.t[c] ?? c;
  }

  apuntar(estilo, contenido) {
    const clave = ESTILOS[estilo][0];
    if (!this.usados.has(clave)) this.usados.set(clave, new Set());
    for (const c of contenido) this.usados.get(clave).add(c);
    this.estilos.add(estilo);
  }

  texto(x, y, contenido, estilo, color = "tinta", { anchor = "start", extra = "", mayus = false } = {}) {
    if (mayus) contenido = contenido.toUpperCase();
    this.apuntar(estilo, contenido);
    const ancla = anchor === "start" ? "" : ` text-anchor="${anchor}"`;
    return `<text x="${f1(x)}" y="${f1(y)}" class="${estilo}" fill="${this.color(color)}"${ancla}${extra}>${esc(contenido)}</text>`;
  }

  tspan(contenido, estilo, color = "tinta", extra = "") {
    this.apuntar(estilo, contenido);
    return `<tspan class="${estilo}" fill="${this.color(color)}"${extra}>${esc(contenido)}</tspan>`;
  }

  async render() {
    const reglas = [];
    for (const [clave, chars] of [...this.usados].sort()) {
      const [, , familia, peso] = DEF_FUENTES[clave];
      const b64 = await recorte(clave, [...chars].sort().join(""));
      reglas.push(`@font-face{font-family:'${familia}';font-weight:${peso};src:url(data:font/woff2;base64,${b64}) format('woff2')}`);
    }
    for (const e of [...this.estilos].sort()) {
      const [clave, tam, esp] = ESTILOS[e];
      const [, , familia, peso] = DEF_FUENTES[clave];
      reglas.push(`.${e}{font-family:${PILA[familia]};font-weight:${peso};font-size:${f1(tam)}px;letter-spacing:${esp}em}`);
    }
    const defs = this.defs.length ? `<defs>${this.defs.join("")}</defs>` : "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${f1(this.ancho)}" height="${f1(this.alto)}" ` +
      `viewBox="0 0 ${f1(this.ancho)} ${f1(this.alto)}" role="img" aria-labelledby="titulo desc">` +
      `<title id="titulo">${esc(this.titulo)}</title><desc id="desc">${esc(this.desc || this.titulo)}</desc>` +
      `<style>${reglas.join("")}${CSS_ANIM}${this.css.join("")}</style>${defs}${this.partes.join("")}</svg>\n`
    );
  }
}

/** Marco común de las tarjetas: borde neutro y una cabecera escrita como
 * petición a una API (`GET /stack`), con la respuesta resumida a la derecha.
 * Devuelve la y donde empieza el contenido. */
export function tarjeta(lz, ruta, meta = "", metodo = "GET") {
  const t = lz.t;
  const { ancho: w, alto: h } = lz;
  lz.raw(`<rect x="0.5" y="0.5" width="${f1(w - 1)}" height="${f1(h - 1)}" rx="6" fill="${t.fondo}" stroke="${t.linea}"/>`);
  const mw = medir(metodo, "seccion") + 12;
  lz.raw(`<rect x="28" y="25" width="${f1(mw)}" height="20" rx="3" fill="none" stroke="${t.acento}"/>`);
  lz.raw(lz.texto(34, 39.5, metodo, "seccion", "acento"));
  lz.raw(lz.texto(28 + mw + 10, 39.5, ruta, "seccion", "tinta"));
  if (meta) lz.raw(lz.texto(w - 28, 39.5, meta, "meta", "suave", { anchor: "end" }));
  lz.raw(`<line x1="28" y1="60.5" x2="${f1(w - 28)}" y2="60.5" stroke="${t.linea}"/>`);
  return 60;
}

/** Píldora con texto mono; devuelve [svg, ancho]. */
export function pildora(lz, x, y, texto, { color = "suave", borde = "linea", relleno = "panel" } = {}) {
  const w = medir(texto, "etiqueta") + 18;
  const svg =
    `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="22" rx="3" fill="${lz.color(relleno)}" stroke="${lz.color(borde)}"/>` +
    lz.texto(x + 9, y + 15, texto, "etiqueta", color);
  return [svg, w];
}
