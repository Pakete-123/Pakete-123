// Tarjeta de actividad con datos vivos de GitHub:
// - un agujero negro que flota con el total del año y, alrededor, un anillo en perspectiva con
//   una barra por día (las de delante son las más recientes; hoy, en el centro);
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

const API = "https://api.github.com";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
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
  const favorito = DIAS[porDia.indexOf(Math.max(...porDia))];
  return { total, privadas, publicas: total - privadas, activos, larga, actual, mejor, favorito, hasta: dias.at(-1).fecha };
}

const fechaCorta = (iso) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]}`;
};

async function tarjetaActividad(tema, p, act, c, priv, lng) {
  const alto = 662;
  const lz = new Lienzo(
    ANCHO, alto, tema, "Actividad en GitHub",
    `${c.total} contribuciones en los últimos 12 meses (${c.publicas} públicas y ${c.privadas} privadas), ` +
      `${c.activos} días con actividad y una racha máxima de ${c.larga} días. ` +
      `Lenguajes: ${lng.lista.map(([l, x]) => `${l} ${(x * 100).toFixed(1)} %`).join(", ")}.`,
  );
  const t = lz.t;
  const y0 = tarjeta(lz, "/activity/sync", `200 OK · sincronizado el ${c.hasta.split("-").reverse().join("/")}`, "POST");

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
  // cada ciclo), y se expande por el suelo por debajo de todas las barras.
  const onda = (attr, desde, hasta) =>
    `<animate attributeName="${attr}" values="${desde};${hasta}" dur="${ciclo}s" begin="0s" repeatCount="indefinite" ` +
    `calcMode="spline" keyTimes="0;1" keySplines="0.15 0.7 0.3 1"/>`;
  lz.raw(
    `<ellipse cx="${cx}" cy="${f1(cy)}" rx="${discoRx * 0.6}" ry="${f1(discoRx * 0.12)}" fill="none" stroke="${colPub}" stroke-width="1.8" opacity="0">` +
      onda("rx", f1(discoRx * 0.6), R + 18) + onda("ry", f1(discoRx * 0.12), r + 6) + onda("opacity", 0.9, 0) +
      onda("stroke-width", 2.4, 0.6) + `</ellipse>`,
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

  // Planetas: tres órbitas distintas alrededor del agujero, desde hoy hacia
  // atrás en el tiempo; crecen y brillan al pasar por delante.
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
      x: anim("cx", pts.map(([x]) => f1(x))),
      y: anim("cy", pts.map(([, y]) => f1(y))),
      r: (v) => anim("r", esc(v)),
      rx: (v) => anim("rx", esc(v)),
      ry: (v) => anim("ry", esc(v)),
      luz: (v) => anim("opacity", cerca.map((p) => f1(v * (0.5 + p * 0.5)))),
    };
  };
  lz.defs.push(
    `<radialGradient id="planeta1" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffb7a8"/><stop offset="0.5" stop-color="#d4433b"/><stop offset="1" stop-color="#5c0a10"/></radialGradient>`,
    `<radialGradient id="planeta2" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffe6b8"/><stop offset="0.5" stop-color="#e09a52"/><stop offset="1" stop-color="#6b3410"/></radialGradient>`,
    `<radialGradient id="planeta3" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#f3b4bb"/><stop offset="1" stop-color="#8a3a44"/></radialGradient>`,
  );
  const o1 = orbita(1.0, 16, 0);
  const o2 = orbita(0.84, 26, -11);
  const o3 = orbita(1.12, 11, -5);
  let planetas = `<g id="planetas">`;
  // 1: rojo, con un leve halo
  planetas += `<circle cx="-99" cy="-99" r="9" fill="#ff6a5c" filter="url(#halo)">${o1.x}${o1.y}${o1.r(9)}${o1.luz(0.45)}</circle>`;
  planetas += `<circle cx="-99" cy="-99" r="6" fill="url(#planeta1)">${o1.x}${o1.y}${o1.r(6)}</circle>`;
  // 2: con anillos (el anillo pasa por detrás y su mitad delantera, por delante)
  planetas += `<ellipse cx="-99" cy="-99" rx="13" ry="3.6" fill="none" stroke="#f3c48a" stroke-width="1.4" opacity="0.85">${o2.x}${o2.y}${o2.rx(13)}${o2.ry(3.6)}</ellipse>`;
  planetas += `<circle cx="-99" cy="-99" r="6.5" fill="url(#planeta2)">${o2.x}${o2.y}${o2.r(6.5)}</circle>`;
  planetas += `<ellipse cx="-99" cy="-99" rx="13" ry="3.6" fill="none" stroke="#f3c48a" stroke-width="1.4" opacity="0.85" pathLength="100" stroke-dasharray="50 50">${o2.x}${o2.y}${o2.rx(13)}${o2.ry(3.6)}</ellipse>`;
  // 3: pequeño y pálido
  planetas += `<circle cx="-99" cy="-99" r="3.6" fill="url(#planeta3)">${o3.x}${o3.y}${o3.r(3.6)}${o3.luz(1)}</circle>`;
  planetas += `</g>`;
  lz.defs.push(planetas);

  // Materia que cae: partículas que salen del anillo de días y entran en espiral
  // en el disco de acreción del agujero.
  const flujo = [];
  const nParticulas = 12;
  for (let p = 0; p < nParticulas; p++) {
    const a0 = (p / nParticulas) * Math.PI * 2;
    const pasos = 40;
    const puntos = Array.from({ length: pasos + 1 }, (_, k) => {
      const tt = k / pasos;
      const rad = R * 0.86 + (discoRx - R * 0.86) * Math.pow(tt, 0.75);
      const a = a0 - tt * Math.PI * 1.6; // gira en el mismo sentido que el disco
      const yc = cy + (yAg - cy) * tt;
      const ry = rad * (r / R) * (1 - tt) + discoRy * (rad / discoRx) * tt;
      return `${f1(cx + Math.cos(a) * rad)} ${f1(yc + Math.sin(a) * ry)}`;
    });
    const dur = f1(3.6 + (p % 4) * 0.5);
    const ini = f1(-(p * 0.43));
    const tam = f1(1.3 + (p % 3) * 0.45);
    flujo.push(
      `<circle r="${tam}" fill="${p % 2 ? "#ffb35c" : "#ff7a5c"}" opacity="0">` +
        `<animateMotion path="M${puntos.join("L")}" dur="${dur}s" begin="${ini}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0;0.95;0.95;0" keyTimes="0;0.15;0.8;1" dur="${dur}s" begin="${ini}s" repeatCount="indefinite"/></circle>`,
    );
  }
  lz.defs.push(`<g id="materia">${flujo.join("")}</g>`);

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
      lz.texto(cx, yAg + 13, "contribuciones", "mono-pequeno", "#f3c9ce", { anchor: "middle" }) +
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
  lz.raw(lz.texto(hx, hy + 26, "hoy", "mono-pequeno", "suave", { anchor: "middle" }));
  // leyenda de la escena
  const ly = cy + r + 58;
  const leyenda = [
    [colPub, `públicas ${c.publicas}`],
    [colPriv, `privadas ${c.privadas}`],
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
    [`${c.activos}`, "días con actividad"],
    [`${c.larga} d`, "racha más larga"],
    [`${c.actual} d`, "racha actual"],
    [fechaCorta(c.mejor.fecha), "mejor día"],
    [c.favorito, "día más activo"],
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
  lz.raw(lz.texto(M, by, "actividad en repositorios", "etiqueta", "suave"));
  const filas = [
    ["públicos", c.publicas, colPub],
    ["privados", c.privadas, colPriv],
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
  lz.raw(lz.texto(M, lgy, "lenguajes", "etiqueta", "suave"));
  lz.raw(lz.texto(ANCHO - M, lgy, `${lng.repos} repositorios públicos`, "mono-pequeno", "suave", { anchor: "end" }));
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
const out = {};
for (const tema of ["dark", "light"]) out[tema] = await tarjetaActividad(tema, p, act, c, priv, lng);
guardar("actividad", out);
console.log(`actividad lista: ${c.total} contribuciones (${c.privadas} privadas), ${lng.lista.length} lenguajes`);
