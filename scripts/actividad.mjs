// Tarjeta de actividad con datos vivos de GitHub:
// - un agujero negro que flota con el total del año y, alrededor, un anillo en perspectiva con
//   una barra por día (las de delante son las más recientes; hoy, en el centro);
// - los ocho planetas del sistema solar orbitando el agujero;
// - las contribuciones privadas: GitHub no las devuelve en su calendario, así
//   que se cuentan los commits (de todas las ramas), pull requests e issues
//   propios en los repositorios privados, también en los que se colabora
//   (necesita un token personal), y se suman marcadas aparte;
// - un resumen, la actividad en repositorios públicos y privados y los
//   lenguajes de los repositorios públicos.
//
// Token: en Actions, GITHUB_TOKEN recibe el secreto PROFILE_TOKEN (personal,
// con lectura de los repos privados); sin acceso a ellos solo se ve lo público. En local:
// `GITHUB_TOKEN=$(gh auth token) node scripts/actividad.mjs`.

import { ANCHO, Lienzo, datos, f1, guardar, medir, tarjeta } from "./comun.mjs";
import { IDIOMAS, TEXTOS, sufijo } from "./textos.mjs";

const API = "https://api.github.com";
const M = 28;
// Colores oficiales de cada lenguaje en GitHub (linguist).
const COLOR_LENGUAJE = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  CSS: "#663399",
  HTML: "#e34c26",
  SCSS: "#c6538c",
  PHP: "#4f5d95",
  Java: "#b07219",
  Blade: "#f7523f",
  Vue: "#41b883",
  Python: "#3572a5",
};

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) {
  console.error("Falta un token. En local: GITHUB_TOKEN=$(gh auth token) node scripts/actividad.mjs");
  process.exit(1);
}

async function peticion(url, cuerpo) {
  const r = await fetch(url, {
    method: cuerpo ? "POST" : "GET",
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "perfil-pakete-123" },
  });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}

async function contribuciones(usuario) {
  const r = await peticion(`${API}/graphql`, {
    query: `query($u: String!) { user(login: $u) { contributionsCollection {
      commitContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner } contributions { totalCount } }
      contributionCalendar { weeks { contributionDays { date contributionCount weekday } } } } } }`,
    variables: { u: usuario },
  });
  if (r.errors) throw new Error(JSON.stringify(r.errors));
  const c = r.data.user.contributionsCollection;
  return {
    // El calendario de GitHub empieza en el domingo de hace algo más de un año;
    // aquí se recorta a los últimos 365 días exactos, terminando hoy.
    dias: c.contributionCalendar.weeks
      .flatMap((s) => s.contributionDays.map((d) => ({ fecha: d.date, n: d.contributionCount, priv: 0, dia: d.weekday })))
      .slice(-365),
    repos: c.commitContributionsByRepository.map((x) => [x.repository.nameWithOwner, x.contributions.totalCount]),
  };
}

/** Todas las páginas de un listado de la API REST. */
async function paginas(url, max = 10) {
  const todo = [];
  for (let pag = 1; pag <= max; pag++) {
    const lote = await peticion(`${url}${url.includes("?") ? "&" : "?"}per_page=100&page=${pag}`).catch(() => []);
    todo.push(...lote);
    if (lote.length < 100) break;
  }
  return todo;
}

/**
 * Contribuciones propias en repositorios privados (propios, como colaborador o
 * de organizaciones), por día:
 * - commits de todas las ramas, sin repetir el mismo commit entre ramas;
 * - pull requests e issues abiertas por el usuario.
 * Vacío si el token no llega a los repos privados.
 */
async function privadas(usuario, desde, yaContados) {
  let repos;
  try {
    repos = await paginas(`${API}/user/repos?visibility=private&affiliation=owner,collaborator,organization_member`);
    if (!repos.length) throw new Error("sin repos");
  } catch {
    console.warn("Sin acceso a repos privados (revisa PROFILE_TOKEN): solo se muestran contribuciones públicas.");
    return { porDia: new Map(), total: 0 };
  }
  const porDia = new Map();
  const suma = (fecha) => porDia.set(fecha, (porDia.get(fecha) ?? 0) + 1);
  let total = 0;
  for (const repo of repos) {
    if (yaContados.has(repo.full_name)) continue; // GitHub ya los cuenta: no duplicar
    const vistos = new Set();
    const ramas = await paginas(`${API}/repos/${repo.full_name}/branches`);
    for (const rama of ramas) {
      const commits = await paginas(
        `${API}/repos/${repo.full_name}/commits?sha=${encodeURIComponent(rama.name)}&author=${usuario}&since=${desde}T00:00:00Z`,
      );
      for (const c of commits) {
        if (vistos.has(c.sha)) continue;
        vistos.add(c.sha);
        suma(c.commit.author.date.slice(0, 10));
        total++;
      }
    }
  }
  // Pull requests e issues en repos privados (la búsqueda solo ve lo que el token puede ver).
  for (let pag = 1; pag <= 10; pag++) {
    const r = await peticion(
      `${API}/search/issues?q=${encodeURIComponent(`author:${usuario} is:private created:>=${desde}`)}&per_page=100&page=${pag}`,
    ).catch(() => ({ items: [] }));
    for (const it of r.items) {
      const repo = it.repository_url.split("/").slice(-2).join("/");
      if (yaContados.has(repo)) continue;
      suma(it.created_at.slice(0, 10));
      total++;
    }
    if (r.items.length < 100) break;
  }
  return { porDia, total };
}

async function lenguajes(usuario) {
  const repos = await peticion(`${API}/users/${usuario}/repos?per_page=100&type=owner`);
  const total = new Map();
  let contados = 0;
  for (const repo of repos) {
    if (repo.fork || repo.name === usuario) continue;
    contados++;
    const ls = await peticion(repo.languages_url);
    for (const [l, b] of Object.entries(ls)) total.set(l, (total.get(l) ?? 0) + b);
  }
  const suma = [...total.values()].reduce((a, b) => a + b, 0) || 1;
  let lista = [...total].sort((a, b) => b[1] - a[1]).map(([l, b]) => [l, b / suma]);
  if (lista.length > 5) {
    const resto = lista.slice(4).reduce((a, [, x]) => a + x, 0);
    lista = [...lista.slice(0, 4), ["Otros", resto]];
  }
  return { lista, repos: contados };
}

function cifras(dias) {
  const n = (d) => d.n + d.priv;
  const total = dias.reduce((a, d) => a + n(d), 0);
  const privadas = dias.reduce((a, d) => a + d.priv, 0);
  const activos = dias.filter((d) => n(d) > 0).length;
  let larga = 0;
  let r = 0;
  for (const d of dias) {
    r = n(d) > 0 ? r + 1 : 0;
    larga = Math.max(larga, r);
  }
  // Racha actual: si hoy aún no hay nada, se cuenta desde ayer.
  let actual = 0;
  let i = dias.length - 1;
  if (dias[i] && n(dias[i]) === 0) i--;
  while (i >= 0 && n(dias[i]) > 0) {
    actual++;
    i--;
  }
  const mejor = dias.reduce((a, d) => (n(d) > n(a) ? d : a), dias[0]);
  const porDia = Array(7).fill(0);
  for (const d of dias) porDia[d.dia] += n(d);
  const favorito = porDia.indexOf(Math.max(...porDia)); // 0 = domingo
  return { total, privadas, publicas: total - privadas, activos, larga, actual, mejor, favorito, hasta: dias.at(-1).fecha };
}

const fechaCorta = (iso, T) => {
  const [, m, d] = iso.split("-").map(Number);
  return T.fecha(d, m - 1);
};
const fechaLarga = (iso, T) => {
  const [a, m, d] = iso.split("-").map(Number);
  return T.fechaLarga(a, m - 1, d);
};

async function tarjetaActividad(tema, p, act, c, priv, lng, T, idioma) {
  const MESES = T.meses;
  const alto = 662;
  const lz = new Lienzo(
    ANCHO, alto, tema, T.tituloActividad,
    idioma === "es"
      ? `${c.total} contribuciones en los últimos 12 meses (${c.publicas} públicas y ${c.privadas} privadas), ` +
          `${c.activos} días con actividad y una racha máxima de ${c.larga} días. ` +
          `Lenguajes: ${lng.lista.map(([l, x]) => `${l} ${(x * 100).toFixed(1)} %`).join(", ")}.`
      : `${c.total} contributions in the last 12 months (${c.publicas} public and ${c.privadas} private), ` +
          `${c.activos} active days and a longest streak of ${c.larga} days. ` +
          `Languages: ${lng.lista.map(([l, x]) => `${l} ${(x * 100).toFixed(1)}%`).join(", ")}.`,
  );
  const t = lz.t;
  const y0 = tarjeta(lz, "/activity/sync", T.sincronizado(fechaLarga(c.hasta, T)), "POST");

  // --- la escena: agujero negro y anillo de días en perspectiva ---
  const cx = ANCHO / 2;
  const cy = y0 + 190;
  const R = 330; // semieje horizontal del anillo
  const r = 64; // semieje vertical (inclinación)
  const hMax = 92;
  const n = act.dias.length;
  const max = Math.max(1, ...act.dias.map((d) => d.n + d.priv));
  // Hoy queda delante, justo en el centro, y los días anteriores van pegados a
  // su izquierda, alejándose hacia el fondo. El año da la vuelta y el día más
  // antiguo acaba a la derecha de hoy, separado por un hueco con los dos años.
  const hueco = Math.PI * 2 * 0.06; // a la derecha de hoy
  const ang = (i) => Math.PI / 2 + ((n - 1 - i) / (n - 1)) * (Math.PI * 2 - hueco);
  const pos = (a) => [cx + Math.cos(a) * R, cy + Math.sin(a) * r];

  lz.css.push(
    "@keyframes sube{from{transform:scaleY(0)}to{transform:scaleY(1)}}" +
      ".b{transform-box:fill-box;transform-origin:50% 100%;animation:sube 1s cubic-bezier(.2,.8,.2,1) both}" +
      "@keyframes entra{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
      ".en{animation:entra .7s cubic-bezier(.2,.8,.2,1) both}" +
      "@keyframes llena{from{transform:scaleX(0)}to{transform:scaleX(1)}}" +
      ".ll{transform-box:fill-box;transform-origin:0 50%;animation:llena 1.1s cubic-bezier(.2,.8,.2,1) both}" +
      "@media (prefers-reduced-motion:reduce){.b,.en,.ll{animation:none}}",
  );
  // --- agujero negro ---
  // Horizonte negro con anillo de fotones, disco de acreción incandescente que
  // gira (mitad trasera detrás del horizonte y delantera por delante) y el arco
  // de luz que la gravedad curva por encima. Todo flota sobre el anillo.
  const yAg = cy - 34; // centro del agujero
  const rh = 50; // radio del horizonte
  const discoRx = 132;
  const discoRy = 24;
  const inclina = -7; // grados
  lz.defs.push(
    `<radialGradient id="resplandor" cx="0.5" cy="0.5" r="0.5">` +
      `<stop offset="0" stop-color="#ffb35c" stop-opacity="${tema === "dark" ? 0.55 : 0.4}"/>` +
      `<stop offset="0.35" stop-color="#e2452f" stop-opacity="${tema === "dark" ? 0.32 : 0.22}"/>` +
      `<stop offset="0.7" stop-color="#800517" stop-opacity="${tema === "dark" ? 0.16 : 0.1}"/>` +
      `<stop offset="1" stop-color="#800517" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="disco" x1="0" x2="1">` +
      `<stop offset="0" stop-color="#800517" stop-opacity="0.15"/><stop offset="0.18" stop-color="#c62a2a"/>` +
      `<stop offset="0.4" stop-color="#ff9a3d"/><stop offset="0.5" stop-color="#fff0c2"/><stop offset="0.6" stop-color="#ffb04a"/>` +
      `<stop offset="0.82" stop-color="#c62a2a"/><stop offset="1" stop-color="#800517" stop-opacity="0.15"/></linearGradient>`,
    `<linearGradient id="lente" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#fff3d1"/><stop offset="0.5" stop-color="#ffa14a"/><stop offset="1" stop-color="#c62a2a"/></linearGradient>`,
    `<radialGradient id="suelo" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ff6a3a" stop-opacity="${tema === "dark" ? 0.35 : 0.22}"/>` +
      `<stop offset="1" stop-color="#800517" stop-opacity="0"/></radialGradient>`,
    `<filter id="halo" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="3"/></filter>`,
    `<filter id="difumina" x="-0.5" y="-1" width="2" height="3"><feGaussianBlur stdDeviation="2.2"/></filter>`,
    `<clipPath id="mitadAtras"><rect x="0" y="0" width="${ANCHO}" height="${f1(yAg)}"/></clipPath>`,
    `<clipPath id="mitadDelante"><rect x="0" y="${f1(yAg)}" width="${ANCHO}" height="${alto}"/></clipPath>`,
  );

  // Públicas y privadas, con contraste suficiente en los dos temas.
  const colPub = tema === "dark" ? t.rojos[0] : t.acento;
  const colPriv = tema === "dark" ? t.rojos[1] : t.rojos[2];

  // El disco: banda gruesa con degradado y, encima, rachas que giran.
  const disco = (mitad) => {
    const giro = (dash, dur, op, ancho) =>
      `<ellipse cx="${cx}" cy="${f1(yAg)}" rx="${discoRx}" ry="${discoRy}" fill="none" stroke="#fff4d6" stroke-width="${ancho}" ` +
      `stroke-dasharray="${dash}" opacity="${op}" stroke-linecap="round">` +
      `<animate attributeName="stroke-dashoffset" from="0" to="-${f1(2 * Math.PI * discoRx)}" dur="${dur}s" repeatCount="indefinite"/></ellipse>`;
    return (
      `<g clip-path="url(#${mitad})"><g transform="rotate(${inclina} ${cx} ${f1(yAg)})">` +
      `<ellipse cx="${cx}" cy="${f1(yAg)}" rx="${discoRx + 6}" ry="${discoRy + 3}" fill="none" stroke="url(#disco)" stroke-width="16" opacity="0.55" filter="url(#difumina)"/>` +
      `<ellipse cx="${cx}" cy="${f1(yAg)}" rx="${discoRx}" ry="${discoRy}" fill="none" stroke="url(#disco)" stroke-width="10"/>` +
      `<ellipse cx="${cx}" cy="${f1(yAg)}" rx="${discoRx - 16}" ry="${discoRy - 4}" fill="none" stroke="url(#disco)" stroke-width="5" opacity="0.8"/>` +
      giro("40 26 14 34", 7, 0.5, 1.6) +
      giro("8 30 22 44", 5, 0.35, 1.1) +
      `</g></g>`
    );
  };

  // El total cuenta desde 0 al cargar (fotogramas que se van relevando).
  const cuenta = (total, x, y) => {
    const marcos = 16;
    let g = "";
    for (let k = 0; k <= marcos; k++) {
      const v = Math.round(total * (1 - Math.pow(1 - k / marcos, 3)));
      const ini = 0.2 + k * 0.07;
      g +=
        `<g opacity="${k === 0 ? 1 : 0}">` +
        (k > 0 ? `<set attributeName="opacity" to="1" begin="${f1(ini)}s"/>` : "") +
        (k < marcos ? `<set attributeName="opacity" to="0" begin="${f1(ini + 0.07)}s"/>` : "") +
        lz.texto(x, y, String(v), "cifra", "#ffffff", { anchor: "middle" }) +
        "</g>";
    }
    return g;
  };

  // Barras: [x, ybase, alto, profundidad 0 (fondo) .. 1 (delante)]
  const barras = act.dias.map((d, i) => {
    const a = ang(i);
    const [x, y] = pos(a);
    const total = d.n + d.priv;
    const h = total ? 6 + Math.sqrt(total / max) * (hMax - 6) : 0;
    return { x, y, h, prof: (Math.sin(a) + 1) / 2, i, d };
  });
  // Cada barra se reparte entre públicas (abajo) y privadas (arriba) según lo
  // que hubo ese día; si solo hubo de un tipo, sale entera de ese color.
  const dibujaBarra = (b) => {
    if (!b.h) {
      return `<circle cx="${f1(b.x)}" cy="${f1(b.y)}" r="${f1(0.8 + b.prof * 0.6)}" fill="${t.tenue}" opacity="${f1(0.35 + b.prof * 0.65)}"/>`;
    }
    const w = 1.4 + b.prof * 1.6;
    const x = f1(b.x - w / 2);
    const total = b.d.n + b.d.priv;
    const hPub = (b.d.n / total) * b.h;
    let segmentos = "";
    if (b.d.priv) segmentos += `<rect x="${x}" y="${f1(b.y - b.h)}" width="${f1(w)}" height="${f1(b.h)}" rx="${f1(w / 2)}" fill="${colPriv}"/>`;
    if (b.d.n) segmentos += `<rect x="${x}" y="${f1(b.y - hPub)}" width="${f1(w)}" height="${f1(hPub)}" rx="${f1(w / 2)}" fill="${colPub}"/>`;
    return (
      `<g class="b" style="animation-delay:${f1(0.15 + ((n - 1 - b.i) / n) * 1.4)}s" opacity="${f1(0.4 + b.prof * 0.6)}">` +
      `${segmentos}</g>`
    );
  };

  // suelo: elipses guía
  lz.raw(`<ellipse cx="${cx}" cy="${f1(cy)}" rx="${R + 18}" ry="${r + 6}" fill="none" stroke="${t.rejilla}"/>`);
  lz.raw(`<ellipse cx="${cx}" cy="${f1(cy)}" rx="${R}" ry="${r}" fill="none" stroke="${t.linea}"/>`);
  lz.raw(`<ellipse cx="${cx}" cy="${f1(cy)}" rx="${R - 18}" ry="${r - 4}" fill="none" stroke="${t.rejilla}"/>`);
  // meses, por fuera del anillo
  let mesAnterior = -1;
  act.dias.forEach((d, i) => {
    const mes = Number(d.fecha.split("-")[1]) - 1;
    if (mes !== mesAnterior) {
      const diasEnRango = act.dias.filter((x) => x.fecha.slice(0, 7) === d.fecha.slice(0, 7)).length;
      const a = ang(i + diasEnRango / 2);
      const prof = (Math.sin(a) + 1) / 2;
      const x = cx + Math.cos(a) * (R + 40);
      const y = cy + Math.sin(a) * (r + 22) + 4;
      if (diasEnRango >= 20) {
        lz.raw(
          `<g opacity="${f1(0.45 + prof * 0.55)}">${lz.texto(x, y, MESES[mes], "mono-pequeno", "suave", { anchor: "middle" })}</g>`,
        );
      }
    }
    mesAnterior = mes;
  });

  // La flotación del agujero: abajo en t = 0, arriba a mitad de ciclo.
  const ciclo = 4.5;
  const flota = `dur="${ciclo}s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"`;

  // Resplandor del agujero sobre el suelo, más intenso cuando está abajo.
  lz.raw(
    `<ellipse cx="${cx}" cy="${f1(cy)}" rx="${discoRx * 1.5}" ry="${f1(discoRx * 0.38)}" fill="url(#suelo)">` +
      `<animate attributeName="opacity" values="1;0.55;1" ${flota}/></ellipse>`,
  );
  // Onda: nace en el rebote, justo cuando el agujero empieza a subir (inicio de
  // cada ciclo), y se expande por el suelo hasta la línea de las barras. Lleva
  // una máscara con la silueta de todas las barras (algo más anchas): donde hay
  // una barra la onda no se pinta, aunque la barra sea semitransparente.
  const siluetas = barras
    .filter((b) => b.h)
    .map((b) => {
      const w = 1.4 + b.prof * 1.6 + 3;
      return `<rect x="${f1(b.x - w / 2)}" y="${f1(b.y - b.h - 2)}" width="${f1(w)}" height="${f1(b.h + 4)}" rx="${f1(w / 2)}"/>`;
    })
    .join("");
  lz.defs.push(
    `<mask id="sinBarras" maskUnits="userSpaceOnUse" x="0" y="0" width="${ANCHO}" height="${alto}">` +
      `<rect width="${ANCHO}" height="${alto}" fill="#fff"/><g fill="#000">${siluetas}</g></mask>`,
  );
  const onda = (attr, desde, hasta) =>
    `<animate attributeName="${attr}" values="${desde};${hasta}" dur="${ciclo}s" begin="0s" repeatCount="indefinite" ` +
    `calcMode="spline" keyTimes="0;1" keySplines="0.15 0.7 0.3 1"/>`;
  lz.raw(
    `<g mask="url(#sinBarras)">` +
      `<ellipse cx="${cx}" cy="${f1(cy)}" rx="${discoRx * 0.6}" ry="${f1(discoRx * 0.12)}" fill="none" stroke="${colPub}" stroke-width="1.8" opacity="0">` +
      onda("rx", f1(discoRx * 0.6), R - 6) + onda("ry", f1(discoRx * 0.12), r - 2) + onda("opacity", 0.9, 0) +
      onda("stroke-width", 2.4, 0.6) + `</ellipse></g>`,
  );

  // --- profundidad ---
  // El suelo se divide en franjas horizontales, de atrás (arriba) hacia delante
  // (abajo). Cada franja se dibuja en orden: sus barras y, encima, el trozo de
  // planetas y de materia que cae en ella. Así lo que está más cerca tapa a lo
  // que está más lejos. Planetas y materia se definen una vez y se reutilizan
  // recortados (<use>).
  const yIni = cy - r - 14;
  const yFin = cy + r + 14;
  const nFranjas = 18;
  const bordes = Array.from({ length: nFranjas + 1 }, (_, k) => yIni + ((yFin - yIni) * k) / nFranjas);
  bordes[0] = 0;
  bordes[nFranjas] = alto;
  bordes.slice(0, -1).forEach((y0f, k) => {
    lz.defs.push(`<clipPath id="franja${k}"><rect x="0" y="${f1(y0f)}" width="${ANCHO}" height="${f1(bordes[k + 1] - y0f)}"/></clipPath>`);
  });

  // Sistema solar: los ocho planetas orbitan el agujero negro, cada uno en su
  // órbita y más rápido cuanto más cerca está. Se mueven desde hoy hacia atrás
  // en el tiempo y crecen y brillan al pasar por delante.
  const muestras = 72;
  const orbita = (escalaOrb, dur, desfase) => {
    const angs = Array.from({ length: muestras + 1 }, (_, k) => Math.PI / 2 + (k / muestras) * Math.PI * 2);
    const cerca = angs.map((a) => (Math.sin(a) + 1) / 2);
    const pts = angs.map((a) => [cx + Math.cos(a) * R * escalaOrb, cy + Math.sin(a) * r * escalaOrb]);
    const kt = angs.map((_, k) => f1((k / muestras) * 1000) / 1000).join(";");
    const anim = (attr, valores) =>
      `<animate attributeName="${attr}" values="${valores.join(";")}" keyTimes="${kt}" dur="${dur}s" begin="${desfase}s" repeatCount="indefinite"/>`;
    const esc = (v) => cerca.map((p) => f1(v * (0.55 + p * 0.6)));
    return {
      pos: anim("cx", pts.map(([x]) => f1(x))) + anim("cy", pts.map(([, y]) => f1(y))),
      r: (v) => anim("r", esc(v)),
      rx: (v) => anim("rx", esc(v)),
      ry: (v) => anim("ry", esc(v)),
      luz: (v) => anim("opacity", cerca.map((p) => f1(v * (0.55 + p * 0.45)))),
    };
  };
  // Superficies: degradados con la luz que viene del agujero (arriba a la
  // izquierda del planeta) y una sombra común para el lado oscuro.
  const superficie = (id, stops, lineal = false) =>
    lineal
      ? `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`
      : `<radialGradient id="${id}" cx="0.4" cy="0.35" r="0.7">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</radialGradient>`;
  lz.defs.push(
    superficie("p-mercurio", [[0, "#d9d4cf"], [0.6, "#8f8a85"], [1, "#4a4744"]]),
    superficie("p-venus", [[0, "#fff4d6"], [0.6, "#e6c27a"], [1, "#8a6a2c"]]),
    superficie("p-tierra", [[0, "#9fd8ff"], [0.45, "#2f7fd1"], [0.7, "#2f9e5a"], [1, "#123a6b"]]),
    superficie("p-marte", [[0, "#ffb08a"], [0.55, "#c4502c"], [1, "#5e1d0c"]]),
    superficie("p-jupiter", [[0, "#f1dcc0"], [0.18, "#c9955f"], [0.3, "#f3e3cc"], [0.45, "#b9784a"], [0.58, "#ead2b0"], [0.72, "#a8653b"], [0.86, "#e7cfa9"], [1, "#9a5f37"]], true),
    superficie("p-saturno", [[0, "#fbefd0"], [0.35, "#e8cf96"], [0.55, "#d8b878"], [0.75, "#efdcaa"], [1, "#b8955a"]], true),
    superficie("p-urano", [[0, "#e6ffff"], [0.55, "#7fdbe6"], [1, "#2d7c8a"]]),
    superficie("p-neptuno", [[0, "#a9c4ff"], [0.55, "#3557d6"], [1, "#14246b"]]),
    `<radialGradient id="p-sombra" cx="0.38" cy="0.32" r="0.75"><stop offset="0.45" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="0.6"/></radialGradient>`,
  );
  // [nombre, escala de órbita, periodo (s), desfase (s), radio, superficie, anillo]
  const SISTEMA = [
    ["mercurio", 0.46, 9, -2, 3.4, "p-mercurio"],
    ["venus", 0.55, 13, -7, 5.2, "p-venus"],
    ["tierra", 0.64, 17, -3, 5.5, "p-tierra"],
    ["marte", 0.73, 22, -15, 4.3, "p-marte"],
    ["jupiter", 0.84, 30, -9, 11, "p-jupiter"],
    ["saturno", 0.94, 38, -27, 9, "p-saturno", "saturno"],
    ["urano", 1.08, 48, -14, 6.8, "p-urano", "urano"],
    ["neptuno", 1.18, 60, -41, 6.5, "p-neptuno"],
  ];
  let planetas = `<g id="planetas">`;
  for (const [, esc, dur, desfase, radioP, sup, anillo] of SISTEMA) {
    const o = orbita(esc, dur, desfase);
    const aro = (frente) =>
      `<ellipse cx="-99" cy="-99" rx="1" ry="1" fill="none" ` +
      (anillo === "saturno"
        ? `stroke="#e9d3a0" stroke-width="${f1(radioP * 0.32)}" opacity="0.9"`
        : `stroke="#bff3f7" stroke-width="0.7" opacity="0.7"`) +
      (frente ? ` pathLength="100" stroke-dasharray="50 50"` : "") +
      `>${o.pos}${o.rx(radioP * (anillo === "saturno" ? 2.2 : 1.7))}${o.ry(radioP * (anillo === "saturno" ? 0.62 : 1.15))}</ellipse>`;
    let g = `<g>${o.luz(1)}`;
    if (anillo) g += aro(false);
    g += `<circle cx="-99" cy="-99" r="${radioP}" fill="url(#${sup})">${o.pos}${o.r(radioP)}</circle>`;
    g += `<circle cx="-99" cy="-99" r="${radioP}" fill="url(#p-sombra)">${o.pos}${o.r(radioP)}</circle>`;
    if (anillo) g += aro(true); // mitad delantera del anillo, por delante del planeta
    planetas += g + `</g>`;
  }
  planetas += `</g>`;
  lz.defs.push(planetas);

  // Rocas espaciales: fragmentos irregulares que salen del anillo de días y el
  // agujero atrae en espiral. Giran sobre sí mismas, se calientan hasta quedar
  // incandescentes y se encogen al llegar al disco de acreción, donde desaparecen.
  const FORMAS = [
    "M-1 -0.8L0.4 -1.1L1.1 -0.2L0.7 0.9L-0.5 1L-1.1 0.2Z",
    "M-0.9 -1L0.8 -0.7L1 0.5L0 1.1L-1.1 0.4Z",
    "M-0.6 -1.1L0.9 -0.9L1.1 0.3L0.3 1L-0.9 0.8L-1.1 -0.3Z",
  ];
  const rocas = [];
  const nRocas = 16;
  for (let p = 0; p < nRocas; p++) {
    const a0 = (p / nRocas) * Math.PI * 2 + (p % 3) * 0.4;
    const pasos = 40;
    const puntos = Array.from({ length: pasos + 1 }, (_, k) => {
      const tt = k / pasos;
      const rad = R * (0.8 + (p % 4) * 0.05) + (discoRx - R * 0.8) * Math.pow(tt, 0.75);
      const a = a0 - tt * Math.PI * 1.5; // gira en el mismo sentido que el disco
      const yc = cy + (yAg - cy) * tt;
      const ry = rad * (r / R) * (1 - tt) + discoRy * (rad / discoRx) * tt;
      return `${f1(cx + Math.cos(a) * rad)} ${f1(yc + Math.sin(a) * ry)}`;
    });
    const dur = f1(5 + (p % 5) * 0.8);
    const ini = f1(-(p * 0.71));
    const tam = f1(1.6 + (p % 4) * 0.55);
    const ciclo = `dur="${dur}s" begin="${ini}s" repeatCount="indefinite"`;
    rocas.push(
      `<g><animateMotion path="M${puntos.join("L")}" ${ciclo}/>` +
        // tamaño y opacidad: aparece, viaja y se consume al llegar al disco
        `<g opacity="0"><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" ${ciclo}/>` +
        `<g><animateTransform attributeName="transform" type="scale" values="${tam};${tam};${f1(tam * 0.35)}" keyTimes="0;0.6;1" ${ciclo}/>` +
        `<path d="${FORMAS[p % FORMAS.length]}" fill="#8b817a" stroke="#4a4340" stroke-width="0.25">` +
        `<animateTransform attributeName="transform" type="rotate" from="0" to="${p % 2 ? 360 : -360}" dur="${f1(2 + (p % 3))}s" repeatCount="indefinite"/>` +
        // se calienta al acercarse: gris, naranja, casi blanco
        `<animate attributeName="fill" values="#8b817a;#8b817a;#ff7a3c;#ffe2b0" keyTimes="0;0.45;0.8;1" ${ciclo}/>` +
        `</path></g></g></g>`,
    );
  }
  lz.defs.push(`<g id="materia">${rocas.join("")}</g>`);

  // Barras repartidas por franjas según la y de su base.
  const franjaDe = (y) => Math.max(0, Math.min(nFranjas - 1, bordes.findIndex((b, k) => k > 0 && y < b) - 1));
  const porFranja = Array.from({ length: nFranjas }, () => []);
  for (const b of barras) porFranja[franjaDe(b.y)].push(b);
  const franja = (k) => {
    for (const b of porFranja[k].sort((a, b2) => a.y - b2.y)) lz.raw(dibujaBarra(b));
    lz.raw(`<use href="#materia" clip-path="url(#franja${k})"/><use href="#planetas" clip-path="url(#franja${k})"/>`);
  };
  // Franjas del fondo, detrás del agujero.
  const kCentro = franjaDe(yAg + discoRy);
  for (let k = 0; k < kCentro; k++) franja(k);

  // El agujero negro, flotando.
  lz.raw(
    `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" ${flota}/>` +
      `<circle cx="${cx}" cy="${f1(yAg)}" r="${rh * 2.6}" fill="url(#resplandor)"><animate attributeName="opacity" values="1;0.75;1" ${flota}/></circle>` +
      disco("mitadAtras") +
      // arco de luz curvado alrededor del horizonte (lente gravitatoria)
      `<circle cx="${cx}" cy="${f1(yAg)}" r="${rh + 9}" fill="none" stroke="url(#lente)" stroke-width="9" opacity="0.9" filter="url(#difumina)"/>` +
      `<circle cx="${cx}" cy="${f1(yAg)}" r="${rh + 6}" fill="none" stroke="url(#lente)" stroke-width="4"/>` +
      // horizonte y anillo de fotones
      `<circle cx="${cx}" cy="${f1(yAg)}" r="${rh}" fill="#050203"/>` +
      `<circle cx="${cx}" cy="${f1(yAg)}" r="${rh + 1.2}" fill="none" stroke="#fff1d6" stroke-width="1.2" opacity="0.9">` +
      `<animate attributeName="opacity" values="0.9;0.55;0.9" dur="3s" repeatCount="indefinite"/></circle>` +
      disco("mitadDelante") +
      cuenta(c.total, cx, yAg - 1) +
      lz.texto(cx, yAg + 13, T.contribuciones, "mono-pequeno", "#f3c9ce", { anchor: "middle" }) +
      `</g>`,
  );
  // Franjas de delante, por encima del agujero.
  for (let k = kCentro; k < nFranjas; k++) franja(k);
  // En el hueco, el año actual junto a hoy y el anterior junto al día más antiguo.
  const [gx, gy] = pos(Math.PI / 2 - hueco / 2);
  const anioIni = act.dias[0].fecha.slice(0, 4);
  const anioFin = c.hasta.slice(0, 4);
  lz.raw(`<rect x="${f1(gx - 44)}" y="${f1(gy - 9)}" width="88" height="18" fill="${t.fondo}"/>`);
  lz.raw(`<line x1="${f1(gx)}" y1="${f1(gy - 8)}" x2="${f1(gx)}" y2="${f1(gy + 8)}" stroke="${t.tenue}"/>`);
  lz.raw(lz.texto(gx - 7, gy + 4, anioFin, "mono-pequeno", "tinta", { anchor: "end" }));
  lz.raw(lz.texto(gx + 7, gy + 4, anioIni, "mono-pequeno", "suave"));
  // hoy
  const [hx, hy] = pos(ang(n - 1));
  lz.raw(
    `<circle cx="${f1(hx)}" cy="${f1(hy + 10)}" r="2.5" fill="none" stroke="${colPub}">` +
      `<animate attributeName="r" values="2.5;9" dur="2s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0.9;0" dur="2s" repeatCount="indefinite"/></circle>`,
  );
  lz.raw(`<circle cx="${f1(hx)}" cy="${f1(hy + 10)}" r="2.5" fill="${colPub}"/>`);
  lz.raw(lz.texto(hx, hy + 26, T.hoy, "mono-pequeno", "suave", { anchor: "middle" }));
  // leyenda de la escena
  const ly = cy + r + 58;
  const leyenda = [
    [colPub, `${T.publicas} ${c.publicas}`],
    [colPriv, `${T.privadas} ${c.privadas}`],
  ];
  const anchoLeyenda = leyenda.reduce((a, [, s]) => a + 14 + medir(s, "mono-pequeno") + 20, -20);
  let lx = cx - anchoLeyenda / 2;
  for (const [col, s] of leyenda) {
    lz.raw(`<rect x="${f1(lx)}" y="${ly - 8}" width="8" height="8" rx="1.5" fill="${col}"/>`);
    lz.raw(lz.texto(lx + 14, ly, s, "mono-pequeno", "suave"));
    lx += 14 + medir(s, "mono-pequeno") + 20;
  }

  // --- cifras en fila, centradas ---
  const fy = ly + 22;
  const tiles = [
    [`${c.activos}`, T.diasActividad],
    [`${c.larga} d`, T.rachaLarga],
    [`${c.actual} d`, T.rachaActual],
    [fechaCorta(c.mejor.fecha, T), T.mejorDia],
    [T.dias[c.favorito], T.diaActivo],
  ];
  const tw = (ANCHO - 2 * M - 4 * 10) / 5;
  tiles.forEach(([v, k], i) => {
    const x = M + i * (tw + 10);
    lz.raw(
      `<g class="en" style="animation-delay:${f1(1.1 + i * 0.1)}s">` +
        `<rect x="${f1(x)}" y="${fy}" width="${f1(tw)}" height="66" rx="4" fill="${t.panel}" stroke="${t.linea}"/>` +
        lz.texto(x + tw / 2, fy + 34, v, "cifra", "tinta", { anchor: "middle" }) +
        lz.texto(x + tw / 2, fy + 53, k, "mono-pequeno", "suave", { anchor: "middle" }) +
        "</g>",
    );
  });

  // --- repositorios públicos y privados, solo dos filas ---
  const by = fy + 66 + 40;
  const anchoCol = ANCHO - 2 * M;
  lz.raw(lz.texto(M, by, T.enRepos, "etiqueta", "suave"));
  const filas = [
    [T.publicos, c.publicas, colPub],
    [T.privados, c.privadas, colPriv],
  ];
  const maxFila = Math.max(1, ...filas.map(([, v]) => v));
  filas.forEach(([nombre, v, color], i) => {
    const yy = by + 26 + i * 26;
    lz.raw(lz.texto(M, yy, nombre, "pequeno", "tinta"));
    const bx = M + 140;
    const bw = anchoCol - 140 - 40;
    lz.raw(`<rect x="${bx}" y="${yy - 6}" width="${f1(bw)}" height="4" rx="2" fill="${t.rejilla}"/>`);
    lz.raw(`<rect class="ll" style="animation-delay:${f1(1.6 + i * 0.15)}s" x="${bx}" y="${yy - 6}" width="${f1((v / maxFila) * bw)}" height="4" rx="2" fill="${color}"/>`);
    lz.raw(lz.texto(M + anchoCol, yy, String(v), "mono-pequeno", "suave", { anchor: "end" }));
  });

  // --- lenguajes ---
  const lgy = alto - 66;
  lz.raw(`<line x1="${M}" y1="${lgy - 24.5}" x2="${ANCHO - M}" y2="${lgy - 24.5}" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(M, lgy, T.lenguajes, "etiqueta", "suave"));
  lz.raw(lz.texto(ANCHO - M, lgy, T.reposPublicos(lng.repos), "mono-pequeno", "suave", { anchor: "end" }));
  const colores = lng.lista.map(([l]) => COLOR_LENGUAJE[l] ?? t.suave);
  let lx2 = M;
  const anchoBarra = ANCHO - 2 * M;
  lng.lista.forEach(([, v], i) => {
    const w = v * anchoBarra;
    lz.raw(`<rect class="ll" style="animation-delay:${f1(1.9 + i * 0.1)}s" x="${f1(lx2)}" y="${lgy + 14}" width="${f1(Math.max(w - 3, 1.5))}" height="6" rx="2" fill="${colores[i]}"/>`);
    lx2 += w;
  });
  lx2 = M;
  lng.lista.forEach(([l, v], i) => {
    const pct = `${(v * 100).toFixed(1).replace(".", ",")} %`;
    const w = medir(l, "pequeno-fuerte");
    lz.raw(`<rect x="${f1(lx2)}" y="${lgy + 36}" width="8" height="8" rx="1.5" fill="${colores[i]}"/>`);
    lz.raw(lz.texto(lx2 + 14, lgy + 44, l, "pequeno-fuerte"));
    lz.raw(lz.texto(lx2 + 20 + w, lgy + 44, pct, "mono-pequeno", "suave"));
    lx2 += 20 + w + medir(pct, "mono-pequeno") + 24;
  });
  return lz.render();
}

const p = datos();
const act = await contribuciones(p.usuario);
const priv = await privadas(p.usuario, act.dias[0].fecha, new Set(act.repos.map(([r]) => r)));
for (const d of act.dias) d.priv = priv.porDia.get(d.fecha) ?? 0;
const c = cifras(act.dias);
const lng = await lenguajes(p.usuario);
for (const idioma of IDIOMAS) {
  const out = {};
  for (const tema of ["dark", "light"]) out[tema] = await tarjetaActividad(tema, p, act, c, priv, lng, TEXTOS[idioma], idioma);
  guardar(`actividad${sufijo(idioma)}`, out);
}
console.log(`actividad lista: ${c.total} contribuciones (${c.privadas} privadas), ${lng.lista.length} lenguajes`);
