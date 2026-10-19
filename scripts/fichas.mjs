// Tarjetas fijas del perfil: contacto, sobre mí, formación y stack.
// Todo sale de datos/perfil.json.

import { ANCHO, Lienzo, datos, envolver, esc, f1, guardar, icono, medir, pildora, tarjeta } from "./comun.mjs";

const TEMAS = ["dark", "light"];
const M = 28; // margen interior

async function porTema(nombre, fn) {
  const out = {};
  for (const tema of TEMAS) out[tema] = await fn(tema);
  guardar(nombre, out);
}

// --- contacto: dos medias barras que se leen como una sola ---------------

const ICONOS_CONTACTO = {
  email: '<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="m2 4 6 5 6-5"/>',
  linkedin:
    '<rect x="1.5" y="1.5" width="13" height="13" rx="2"/><path d="M5 7v4.5M5 4.6v.01M8 11.5V7M8 9c0-1.2.9-2 2-2s1.8.8 1.8 2v2.5"/>',
};

async function contacto(tema, clave, etiqueta, valor, lado) {
  const w = ANCHO / 2;
  const h = 60;
  const lz = new Lienzo(w, h, tema, `${etiqueta}: ${valor}`);
  const t = lz.t;
  // Esquinas redondeadas solo por fuera, para que las dos mitades encajen.
  const r = 6;
  const d =
    lado === "izq"
      ? `M${w} 0.5H${r + 0.5}Q0.5 0.5 0.5 ${r + 0.5}V${h - r - 0.5}Q0.5 ${h - 0.5} ${r + 0.5} ${h - 0.5}H${w}`
      : `M0 0.5H${w - r - 0.5}Q${w - 0.5} 0.5 ${w - 0.5} ${r + 0.5}V${h - r - 0.5}Q${w - 0.5} ${h - 0.5} ${w - r - 0.5} ${h - 0.5}H0`;
  lz.raw(`<path d="${d}Z" fill="${t.panel}"/>`);
  // Un único icono, grande, inclinado y en rojo, a la derecha; entra completo
  // en la tarjeta. El texto queda solo a la izquierda.
  const rojo = tema === "dark" ? t.rojos[0] : t.acento;
  lz.raw(
    `<g transform="translate(${w - 104} 7) scale(2.9) rotate(-14 8 8)" fill="none" stroke="${rojo}" ` +
      `stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">${ICONOS_CONTACTO[clave]}</g>`,
  );
  lz.raw(`<path d="${d}" fill="none" stroke="${t.linea}"/>`);
  if (lado === "der") lz.raw(`<line x1="0.5" y1="12" x2="0.5" y2="${h - 12}" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(M, h / 2 + 5, etiqueta, "meta", "suave"));
  lz.raw(lz.texto(M + medir(etiqueta, "meta") + 12, h / 2 + 5, valor, "dato", "tinta"));
  lz.raw(`<path d="M${w - M - 8} ${h / 2 - 4}l4 4-4 4" fill="none" stroke="${t.suave}" stroke-width="1.5" stroke-linecap="round"/>`);
  return lz.render();
}

// --- sobre mí: texto a la izquierda y la "respuesta" en JSON a la derecha --

function lineasJson(lz, pares) {
  // Devuelve una lista de <text> ya coloreados, uno por línea.
  const filas = [[["{", "suave"]]];
  pares.forEach(([k, v], i) => {
    const coma = i < pares.length - 1 ? "," : "";
    const valor = Array.isArray(v)
      ? [["[", "suave"], ...v.flatMap((x, j) => [[`"${x}"`, "tinta"], ...(j < v.length - 1 ? [[", ", "suave"]] : [])]), ["]", "suave"]]
      : [[typeof v === "string" ? `"${v}"` : String(v), "tinta"]];
    filas.push([["  ", "suave"], [`"${k}"`, "acento"], [": ", "suave"], ...valor, [coma, "suave"]]);
  });
  filas.push([["}", "suave"]]);
  return filas.map((trozos) => trozos.map(([s, c]) => lz.tspan(s, "etiqueta", c)).join(""));
}

async function sobreMi(tema, p) {
  const s = p.sobre_mi;
  const anchoTexto = 440;
  const parrafos = s.texto.map((tx) => envolver(tx, "cuerpo", anchoTexto));
  const altoTexto = parrafos.reduce((a, l) => a + l.length * 24 + 12, 0) - 12;
  const filasJson = s.respuesta.length + 2;
  const altoJson = filasJson * 21 + 52;
  const alto = 60 + 32 + Math.max(altoTexto, altoJson) + 28;

  const lz = new Lienzo(ANCHO, alto, tema, "Sobre mí", s.texto.join(" "));
  const t = lz.t;
  const y0 = tarjeta(lz, "/me", "200 OK · application/json", "GET");
  let y = y0 + 44;
  parrafos.forEach((lineas, i) => {
    for (const l of lineas) {
      lz.raw(lz.texto(M, y, l, "cuerpo", i === 0 ? "tinta" : "suave"));
      y += 24;
    }
    y += 12;
  });

  // El panel se ajusta al JSON y se centra en la columna derecha, en ambos ejes.
  const anchoJson = Math.max(...jsonPlano(s.respuesta).map((l) => medir(l, "etiqueta")));
  const col = M + anchoTexto + 36;
  const jw = anchoJson + 40;
  const jx = col + (ANCHO - M - col - jw) / 2;
  const jy = y0 + 28 + (alto - 28 - (y0 + 28) - altoJson) / 2;
  lz.raw(`<rect x="${f1(jx)}" y="${f1(jy)}" width="${f1(jw)}" height="${altoJson}" rx="4" fill="${t.panel}" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(jx + 20, jy + 24, "respuesta", "mono-pequeno", "suave"));
  lz.raw(`<circle cx="${f1(jx + jw - 20)}" cy="${f1(jy + 20)}" r="3" fill="${t.acento}"/>`);
  lineasJson(lz, s.respuesta).forEach((fila, i) => {
    lz.raw(`<text x="${f1(jx + 20)}" y="${f1(jy + 50 + i * 21)}" xml:space="preserve">${fila}</text>`);
  });
  return lz.render();
}

/** Las líneas del JSON como texto plano, para medirlas. */
function jsonPlano(pares) {
  const v = (x) => (Array.isArray(x) ? `[${x.map((e) => `"${e}"`).join(", ")}]` : `"${x}"`);
  return ["{", ...pares.map(([k, x], i) => `  "${k}": ${v(x)}${i < pares.length - 1 ? "," : ""}`), "}"];
}

// --- formación: como un git log --graph -----------------------------------

async function trayectoria(tema, p) {
  const xTexto = 220;
  const anchoTexto = ANCHO - M - xTexto;
  const bloques = p.trayectoria.map((e) => ({ e, lineas: envolver(e.texto, "cuerpo", anchoTexto) }));
  const altoBloque = ({ e, lineas }) => 26 + 22 + lineas.length * 23 + (e.etiquetas ? 36 : 0) + 30;
  const alto = 60 + 30 + bloques.reduce((a, b) => a + altoBloque(b), 0);

  const lz = new Lienzo(
    ANCHO, alto, tema, "Formación",
    p.trayectoria.map((e) => `${e.titulo}, ${e.lugar} (${e.periodo})`).join("; "),
  );
  const t = lz.t;
  const y0 = tarjeta(lz, "/education/dam", `200 OK · ${p.trayectoria.length} registros`, "PATCH");
  const gx = 46;
  let y = y0 + 42;
  const yIni = y - 6;
  lz.raw(`<line x1="${gx}" y1="${yIni}" x2="${gx}" y2="${alto - 24}" stroke="${t.tenue}" stroke-width="1.5" stroke-dasharray="2 4"/>`);
  bloques.forEach(({ e, lineas }, i) => {
    if (e.actual) {
      lz.raw(`<circle cx="${gx}" cy="${y - 6}" r="9" fill="none" stroke="${t.acento}" opacity="0.4"/>`);
      lz.raw(`<circle cx="${gx}" cy="${y - 6}" r="5" fill="${t.acento}"/>`);
    } else {
      lz.raw(`<circle cx="${gx}" cy="${y - 6}" r="5" fill="${t.fondo}" stroke="${t.suave}" stroke-width="1.5"/>`);
    }
    lz.raw(lz.texto(gx + 22, y, e.periodo, "etiqueta", e.actual ? "tinta" : "suave"));
    if (e.actual) lz.raw(pildora(lz, gx + 22, y + 10, "HEAD", { color: "acento", borde: "acento", relleno: "fondo" })[0]);
    lz.raw(lz.texto(xTexto, y, e.titulo, "cuerpo-fuerte"));
    lz.raw(lz.texto(xTexto, y + 22, e.lugar, "pequeno", "suave"));
    let yy = y + 50;
    for (const l of lineas) {
      lz.raw(lz.texto(xTexto, yy, l, "cuerpo", "tinta"));
      yy += 23;
    }
    if (e.etiquetas) {
      let x = xTexto;
      for (const et of e.etiquetas) {
        const [s, w] = pildora(lz, x, yy - 8, et);
        lz.raw(s);
        x += w + 8;
      }
    }
    y += altoBloque({ e, lineas });
    if (i < bloques.length - 1) {
      lz.raw(`<line x1="${xTexto}" y1="${f1(y - 34)}" x2="${ANCHO - M}" y2="${f1(y - 34)}" stroke="${t.rejilla}"/>`);
    }
  });
  return lz.render();
}

// --- stack: capas de una aplicación, en perspectiva ------------------------
//
// Cada capa es una losa vista en dimétrica, con los logos de pie sobre ella y
// su sombra en la cara superior. A la izquierda, el nombre de la capa y sus
// tecnologías, unidos a la losa por una guía.
//
// En el README de GitHub las imágenes no reciben el ratón, así que las capas se
// iluminan solas por turnos (borde rojo y logos en su color de marca), como si
// alguien pasara el ratón por encima. Si se abre el SVG directamente, además
// funciona el hover de verdad.

// Colores de marca (simple-icons); GitHub usa la tinta del tema.
const MARCA = {
  react: "#61DAFB",
  html5: "#E34F26",
  css3: "#1572B6",
  sass: "#CC6699",
  openjdk: "#ED8B00",
  javascript: "#F7DF1E",
  typescript: "#3178C6",
  php: "#777BB4",
  mysql: "#4479A1",
  postgresql: "#4169E1",
  git: "#F05032",
  vite: "#646CFF",
  composer: "#C08A5B",
  apachemaven: "#C71A36",
  angular: "#DD0031",
  tailwindcss: "#06B6D4",
  nodedotjs: "#5FA04E",
  laravel: "#FF2D20",
  sequelize: "#52B0E7",
};

async function stack(tema, p) {
  const capas = p.stack;
  const cx = 650; // centro de las losas
  const a = 150; // semiancho
  const b = 46; // semialto
  const grosor = 12;
  const paso = 82; // separación vertical entre losas
  const yTop = 60 + 52 + b;
  const alto = yTop + (capas.length - 1) * paso + b + grosor + 30;
  const total = capas.reduce((s, c) => s + c.items.length, 0);

  const lz = new Lienzo(
    ANCHO, alto, tema, "Stack",
    capas.map((c) => `${c.capa}: ${c.items.map((i) => i[0]).join(", ")}`).join(". "),
  );
  const t = lz.t;
  tarjeta(lz, "/stack", `${total} tecnologías · ${capas.length} capas`, "OPTIONS");

  const iconos = await Promise.all(capas.map((c) => Promise.all(c.items.map(([, slug]) => icono(slug)))));

  lz.css.push(
    `.capa{cursor:default}` +
      `.capa:hover .cara{stroke:${t.acento};stroke-width:1.4}.capa:hover .guia{stroke:${t.acento}}` +
      `.capa:hover .ic{fill-opacity:1}`,
  );
  capas.forEach((c, i) =>
    c.items.forEach(([, slug], k) => {
      lz.css.push(`.capa:hover .ic-${i}-${k}{fill:${MARCA[slug] ?? t.tinta}}`);
    }),
  );

  // Ciclo de iluminación: cada capa se enciende unos segundos, una detrás de otra.
  const TURNO = 2.6;
  const periodo = capas.length * TURNO;
  const turno = (i, attr, apagado, encendido) => {
    const s0 = i * TURNO;
    const marcas = [[0, apagado], [s0, apagado], [s0 + 0.35, encendido], [s0 + TURNO - 0.45, encendido], [s0 + TURNO - 0.05, apagado], [periodo, apagado]]
      .filter((m, k, arr) => k === 0 || m[0] > arr[k - 1][0]);
    return `<animate attributeName="${attr}" values="${marcas.map((m) => m[1]).join(";")}" ` +
      `keyTimes="${marcas.map((m) => Math.round((m[0] / periodo) * 1000) / 1000).join(";")}" dur="${periodo}s" repeatCount="indefinite"/>`;
  };

  // Losas, de abajo arriba para que las de encima tapen a las de debajo.
  for (let i = capas.length - 1; i >= 0; i--) {
    const c = capas[i];
    const cy = yTop + i * paso;
    const L = [cx - a, cy];
    const R = [cx + a, cy];
    const T = [cx, cy - b];
    const B = [cx, cy + b];
    const pts = (...ps) => ps.map(([x, y]) => `${f1(x)},${f1(y)}`).join(" ");
    const partes = [];
    // zona invisible que cubre la leyenda, para que el hover funcione también ahí
    partes.push(`<rect x="${M - 8}" y="${cy - 34}" width="${L[0] - M}" height="72" fill="transparent"/>`);
    partes.push(`<polygon points="${pts(L, B, [B[0], B[1] + grosor], [L[0], L[1] + grosor])}" fill="${t.rejilla}" stroke="${t.linea}"/>`);
    partes.push(`<polygon points="${pts(B, R, [R[0], R[1] + grosor], [B[0], B[1] + grosor])}" fill="${t.panel}" stroke="${t.linea}"/>`);
    partes.push(
      `<polygon class="cara" points="${pts(T, R, B, L)}" fill="${t.fondo}" stroke="${t.linea}">` +
        turno(i, "stroke", t.linea, t.acento) + `</polygon>`,
    );
    // retícula fina sobre la cara superior
    const mat = `matrix(${a} ${b} ${-a} ${b} ${cx} ${cy - b})`;
    let rejilla = "";
    for (let k = 1; k < 6; k++) rejilla += `M${k / 6} 0V1M0 ${k / 6}H1`;
    partes.push(`<path transform="${mat}" d="${rejilla}" fill="none" stroke="${t.rejilla}" stroke-width="${f1(1 / b)}"/>`);
    // logos de pie, repartidos en horizontal sobre el centro de la losa
    const n = c.items.length;
    // Con muchas tecnologías los logos se juntan un poco para caber en la losa.
    const tam = n > 5 ? 21 : 24;
    const sep = n > 5 ? 39 : 46;
    iconos[i].forEach((d, k) => {
      const x = cx + (k - (n - 1) / 2) * sep;
      const yb = cy + 4; // donde "apoya" el logo
      partes.push(`<ellipse cx="${f1(x)}" cy="${yb}" rx="${f1(tam * 0.54)}" ry="4.5" fill="${t.linea}"/>`);
      partes.push(
        `<svg x="${f1(x - tam / 2)}" y="${yb - tam - 6}" width="${tam}" height="${tam}" viewBox="0 0 24 24">` +
          `<path class="ic ic-${i}-${k}" d="${esc(d)}" fill="${t.tinta}" fill-opacity="0.85">` +
          turno(i, "fill", t.tinta, MARCA[c.items[k][1]] ?? t.tinta) + turno(i, "fill-opacity", 0.85, 1) + `</path></svg>`,
      );
    });
    // leyenda a la izquierda y guía hasta la losa
    const ly = cy;
    partes.push(`<line class="guia" x1="${M + 420}" y1="${ly + 0.5}" x2="${L[0] - 8}" y2="${ly + 0.5}" stroke="${t.tenue}" stroke-dasharray="2 3">` +
        turno(i, "stroke", t.tenue, t.acento) + `</line>`);
    partes.push(`<circle cx="${L[0] - 4}" cy="${ly + 0.5}" r="2" fill="${t.suave}">${turno(i, "fill", t.suave, t.acento)}</circle>`);
    partes.push(lz.texto(M, ly - 16, c.capa, "seccion", "tinta"));
    // Leyenda en una o dos líneas, según quepa antes de la guía.
    let x = M;
    let fila = 0;
    c.items.forEach(([nombre], k) => {
      const ancho = 20 + medir(nombre, "dato");
      if (x > M && x + ancho > M + 405) {
        x = M;
        fila++;
      }
      const yf = ly + fila * 21;
      partes.push(
        `<svg x="${f1(x)}" y="${yf - 2}" width="14" height="14" viewBox="0 0 24 24">` +
          `<path class="ic ic-${i}-${k}" d="${esc(iconos[i][k])}" fill="${t.suave}">` +
          turno(i, "fill", t.suave, MARCA[c.items[k][1]] ?? t.tinta) + `</path></svg>`,
      );
      partes.push(lz.texto(x + 20, yf + 10, nombre, "dato", "tinta"));
      x += 20 + medir(nombre, "dato") + 18;
    });
    lz.raw(`<g class="capa">${partes.join("")}</g>`);
  }
  return lz.render();
}

// -------------------------------------------------------------------------

const p = datos();
await porTema("contacto-email", (tm) => contacto(tm, "email", "correo", p.contacto.email, "izq"));
await porTema("contacto-linkedin", (tm) => contacto(tm, "linkedin", "linkedin", `in/${p.contacto.linkedin}`, "der"));
await porTema("sobre-mi", (tm) => sobreMi(tm, p));
await porTema("trayectoria", (tm) => trayectoria(tm, p));
await porTema("stack", (tm) => stack(tm, p));
console.log("fichas listas");
