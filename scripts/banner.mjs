// Cabecera del perfil: el nombre a la izquierda y, a la derecha, el recorrido
// de una petición real del proyecto intermodular (POST /api/login) a través
// de sus capas, con la petición bajando por la izquierda y la respuesta
// subiendo por la derecha.

import { ANCHO, Lienzo, datos, envolver, f1, guardar, medir } from "./comun.mjs";
import { IDIOMAS, TEXTOS, perfilEn, sufijo } from "./textos.mjs";

const ALTO = 340;

// Las capas que atraviesa la petición ([título, detalle, anotación de la
// flecha de ida]) están en textos.mjs, en cada idioma.

// Iconos de trazo (16x16) para las líneas de datos.
const ICONOS = {
  ubicacion: '<path d="M8 14.5s5-4.3 5-8.5a5 5 0 0 0-10 0c0 4.2 5 8.5 5 8.5Z"/><circle cx="8" cy="6" r="1.8"/>',
  centro: '<path d="M1.5 6 8 3l6.5 3L8 9 1.5 6Z"/><path d="M4.5 7.5v3.2c0 .9 1.6 1.8 3.5 1.8s3.5-.9 3.5-1.8V7.5M14.5 6v4"/>',
  enfoque: '<rect x="2.5" y="1.5" width="11" height="13" rx="1.5"/><path d="M5.5 5h5M5.5 8h5M5.5 11h3"/>',
};

async function banner(tema, p, T) {
  const CAPAS = T.capas;
  const lz = new Lienzo(ANCHO, ALTO, tema, p.nombre, `${p.nombre}. ${p.titular}.`);
  const t = lz.t;

  lz.defs.push(
    `<pattern id="puntos" width="16" height="16" patternUnits="userSpaceOnUse">` +
      `<circle cx="1" cy="1" r="1" fill="${t.linea}"/></pattern>`,
    `<linearGradient id="desv" x1="0" x2="1"><stop offset="0.4" stop-color="#fff" stop-opacity="0"/>` +
      `<stop offset="0.75" stop-color="#fff" stop-opacity="1"/></linearGradient>`,
    `<mask id="mascara"><rect width="${ANCHO}" height="${ALTO}" fill="url(#desv)"/></mask>`,
  );
  lz.raw(`<rect x="0.5" y="0.5" width="${ANCHO - 1}" height="${ALTO - 1}" rx="6" fill="${t.fondo}" stroke="${t.linea}"/>`);
  lz.raw(`<rect x="1" y="1" width="${ANCHO - 2}" height="${ALTO - 2}" rx="6" fill="url(#puntos)" mask="url(#mascara)"/>`);

  // --- el recorrido de la petición ---
  const bx = 560; // borde izquierdo de las cajas
  const bw = 248;
  const bh = 46;
  const gap = 26;
  const y0 = (ALTO - (CAPAS.length * bh + (CAPAS.length - 1) * gap)) / 2 + 8;
  const xIda = bx + 44; // carril de bajada
  const xVuelta = bx + bw - 40; // carril de subida
  const yCaja = (i) => y0 + i * (bh + gap);

  // Los carriles son líneas discontinuas que fluyen despacio: hacia abajo la
  // petición y hacia arriba la respuesta. Es la única animación del banner.
  const flujo = (x, y1, y2) =>
    `<line x1="${x}" y1="${f1(y1)}" x2="${x}" y2="${f1(y2)}" stroke="${t.acento}" stroke-dasharray="3 4">` +
    `<animate attributeName="stroke-dashoffset" from="7" to="0" dur="0.9s" repeatCount="indefinite"/></line>`;

  CAPAS.forEach(([titulo, detalle, nota], i) => {
    const y = yCaja(i);
    const final = i === CAPAS.length - 1;
    lz.raw(`<rect x="${bx}" y="${f1(y)}" width="${bw}" height="${bh}" rx="5" fill="${t.panel}" stroke="${final ? t.acento : t.linea}"/>`);
    lz.raw(lz.texto(bx + 16, y + 20, titulo, "pequeno-fuerte", "tinta"));
    lz.raw(lz.texto(bx + 16, y + 36, detalle, "mono-pequeno", "suave"));
    lz.raw(lz.texto(bx + bw - 14, y + 20, String(i + 1).padStart(2, "0"), "mono-pequeno", "tenue", { anchor: "end" }));

    if (!final) {
      const ya = y + bh;
      const yb = yCaja(i + 1);
      // ida (baja) a la izquierda, vuelta (sube) a la derecha
      lz.raw(flujo(xIda, ya, yb - 3));
      lz.raw(`<path d="M${xIda - 3.5} ${f1(yb - 6)}l3.5 4 3.5-4" fill="none" stroke="${t.acento}"/>`);
      lz.raw(flujo(xVuelta, yb, ya + 3));
      lz.raw(`<path d="M${xVuelta - 3.5} ${f1(ya + 6)}l3.5-4 3.5 4" fill="none" stroke="${t.acento}"/>`);
      if (nota) lz.raw(lz.texto(xIda + 10, (ya + yb) / 2 + 4, nota, "mono-pequeno", "acento"));
    }
  });
  // La respuesta sale por arriba del carril de vuelta.
  lz.raw(`<line x1="${xVuelta}" y1="${f1(yCaja(0))}" x2="${xVuelta}" y2="${f1(yCaja(0) - 14)}" stroke="${t.ok}" stroke-dasharray="2 3"/>`);
  lz.raw(lz.texto(xVuelta + 8, yCaja(0) - 8, "200 OK", "mono-pequeno", "ok"));
  lz.raw(lz.texto(xIda - 8, yCaja(0) - 8, T.peticion, "mono-pequeno", "suave", { anchor: "end" }));

  // --- el texto ---
  const x0 = 44;
  lz.raw(lz.texto(x0, 76, p.prompt, "prompt", "suave"));
  lz.raw(`<rect class="la" x="${f1(x0 + medir(p.prompt, "prompt") + 8)}" y="65" width="8" height="14" fill="${t.acento}"/>`);
  lz.raw(lz.texto(x0 - 3, 134, p.nombre, "nombre"));
  let y = 168;
  for (const linea of envolver(p.titular, "titular", 470)) {
    lz.raw(lz.texto(x0, y, linea, "titular", "suave"));
    y += 26;
  }
  y += 20;
  for (const [clave, valor] of p.datos_banner) {
    lz.raw(
      `<g transform="translate(${x0} ${y - 12})" fill="none" stroke="${t.suave}" stroke-width="1.3" ` +
        `stroke-linecap="round" stroke-linejoin="round">${ICONOS[clave] ?? ""}</g>`,
    );
    lz.raw(lz.texto(x0 + 26, y, valor, "dato", "tinta"));
    y += 28;
  }
  return lz.render();
}

const base = datos();
for (const idioma of IDIOMAS) {
  const p = perfilEn(base, idioma);
  const T = TEXTOS[idioma];
  guardar(`banner${sufijo(idioma)}`, { dark: await banner("dark", p, T), light: await banner("light", p, T) });
}
console.log("banner listo");
