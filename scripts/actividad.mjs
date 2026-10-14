// Tarjeta de actividad con datos vivos de GitHub:
// - el último año como un reloj: cada día es un trazo radial cuya longitud sale
//   de las contribuciones de ese día; el año se "dibuja" una vez al cargar;
// - un resumen con cifras, el reparto por tipo y los repositorios con más commits;
// - el reparto de lenguajes de los repositorios públicos.
//
// Necesita un token en GITHUB_TOKEN (en el workflow lo pone Actions; en local
// vale `GITHUB_TOKEN=$(gh auth token) node scripts/actividad.mjs`).

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
  console.error("Falta GITHUB_TOKEN. En local: GITHUB_TOKEN=$(gh auth token) node scripts/actividad.mjs");
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
      totalCommitContributions totalPullRequestContributions totalPullRequestReviewContributions totalIssueContributions
      commitContributionsByRepository(maxRepositories: 4) { repository { nameWithOwner } contributions { totalCount } }
      contributionCalendar { weeks { contributionDays { date contributionCount weekday } } } } } }`,
    variables: { u: usuario },
  });
  if (r.errors) throw new Error(JSON.stringify(r.errors));
  const c = r.data.user.contributionsCollection;
  return {
    // El calendario de GitHub empieza en el domingo de hace algo más de un año;
    // aquí se recorta a los últimos 365 días exactos, terminando hoy.
    dias: c.contributionCalendar.weeks
      .flatMap((s) => s.contributionDays.map((d) => ({ fecha: d.date, n: d.contributionCount, dia: d.weekday })))
      .slice(-365),
    tipos: [
      ["commits", c.totalCommitContributions],
      ["pull requests", c.totalPullRequestContributions],
      ["revisiones", c.totalPullRequestReviewContributions],
      ["issues", c.totalIssueContributions],
    ],
    repos: c.commitContributionsByRepository.map((x) => [x.repository.nameWithOwner, x.contributions.totalCount]),
  };
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
  const total = dias.reduce((a, d) => a + d.n, 0);
  const activos = dias.filter((d) => d.n > 0).length;
  let larga = 0;
  let r = 0;
  for (const d of dias) {
    r = d.n > 0 ? r + 1 : 0;
    larga = Math.max(larga, r);
  }
  // Racha actual: si hoy aún no hay nada, se cuenta desde ayer.
  let actual = 0;
  let i = dias.length - 1;
  if (dias[i]?.n === 0) i--;
  while (i >= 0 && dias[i].n > 0) {
    actual++;
    i--;
  }
  const mejor = dias.reduce((a, d) => (d.n > a.n ? d : a), dias[0]);
  const porDia = Array(7).fill(0);
  for (const d of dias) porDia[d.dia] += d.n;
  const favorito = DIAS[porDia.indexOf(Math.max(...porDia))];
  return { total, activos, larga, actual, mejor, favorito, desde: dias[0].fecha, hasta: dias.at(-1).fecha };
}

const fechaCorta = (iso, anio = true) => {
  const [a, m, d] = iso.split("-").map(Number);
  return anio ? `${d} ${MESES[m - 1]} ${a}` : `${d} ${MESES[m - 1]}`;
};

async function tarjetaActividad(tema, p, act, c, lng) {
  const alto = 560;
  const lz = new Lienzo(
    ANCHO, alto, tema, "Actividad en GitHub",
    `${c.total} contribuciones en el último año (${act.tipos.map(([k, n]) => `${n} ${k}`).join(", ")}), ` +
      `${c.activos} días con actividad y una racha máxima de ${c.larga} días. ` +
      `Lenguajes: ${lng.lista.map(([l, x]) => `${l} ${(x * 100).toFixed(1)} %`).join(", ")}.`,
  );
  const t = lz.t;
  const y0 = tarjeta(lz, "/activity/sync", `200 OK · sincronizado el ${c.hasta.split("-").reverse().join("/")}`, "POST");

  // --- el año como un reloj ---
  const cx = 214;
  const cy = y0 + 196;
  const rIn = 92;
  const largoMax = 62;
  const n = act.dias.length;
  const max = Math.max(1, ...act.dias.map((d) => d.n));
  const ang = (i) => -Math.PI / 2 + (i / n) * Math.PI * 2;

  // anillos guía
  for (const r of [rIn - 6, rIn + largoMax / 2, rIn + largoMax]) {
    lz.raw(`<circle cx="${cx}" cy="${f1(cy)}" r="${f1(r)}" fill="none" stroke="${t.rejilla}"/>`);
  }
  // meses: marca y nombre por fuera
  let mesAnterior = -1;
  act.dias.forEach((d, i) => {
    const mes = Number(d.fecha.split("-")[1]) - 1;
    if (mes !== mesAnterior) {
      const a = ang(i);
      const [c1, s1] = [Math.cos(a), Math.sin(a)];
      lz.raw(
        `<line x1="${f1(cx + c1 * (rIn - 10))}" y1="${f1(cy + s1 * (rIn - 10))}" x2="${f1(cx + c1 * (rIn + largoMax + 6))}" ` +
          `y2="${f1(cy + s1 * (rIn + largoMax + 6))}" stroke="${t.linea}"/>`,
      );
      // Nombre en mitad del mes, solo si el mes cabe entero o casi en el periodo.
      const diasEnRango = act.dias.filter((x) => x.fecha.slice(0, 7) === d.fecha.slice(0, 7)).length;
      const am = ang(i + diasEnRango / 2);
      const rl = rIn + largoMax + 20;
      if (diasEnRango >= 20) lz.raw(lz.texto(cx + Math.cos(am) * rl, cy + Math.sin(am) * rl + 4, MESES[mes], "mono-pequeno", "suave", { anchor: "middle" }));
    }
    mesAnterior = mes;
  });
  // un trazo por día; los días sin actividad, un punto
  let trazos = "";
  let puntos = "";
  act.dias.forEach((d, i) => {
    const a = ang(i);
    const [co, si] = [Math.cos(a), Math.sin(a)];
    if (d.n === 0) {
      puntos += `M${f1(cx + co * rIn)} ${f1(cy + si * rIn)}h0`;
    } else {
      const l = 6 + Math.sqrt(d.n / max) * (largoMax - 6);
      trazos += `M${f1(cx + co * rIn)} ${f1(cy + si * rIn)}L${f1(cx + co * (rIn + l))} ${f1(cy + si * (rIn + l))}`;
    }
  });
  // Máscara que barre el año una sola vez, en el sentido de las agujas del reloj.
  const rm = (rIn + largoMax + 8) / 2;
  const circ = 2 * Math.PI * rm;
  lz.defs.push(
    `<mask id="barrido"><circle cx="${cx}" cy="${f1(cy)}" r="${f1(rm)}" fill="none" stroke="#fff" stroke-width="${f1(rIn + largoMax + 12)}" ` +
      `stroke-dasharray="${f1(circ)}" stroke-dashoffset="${f1(circ)}" transform="rotate(-90 ${cx} ${f1(cy)})">` +
      `<animate attributeName="stroke-dashoffset" from="${f1(circ)}" to="0" dur="1.6s" begin="0.2s" fill="freeze" ` +
      `calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1"/></circle></mask>`,
  );
  lz.raw(
    `<g mask="url(#barrido)"><path d="${puntos}" stroke="${t.linea}" stroke-width="2" stroke-linecap="round"/>` +
      `<path d="${trazos}" stroke="${t.acento}" stroke-width="2.4" stroke-linecap="round"/></g>`,
  );
  // hoy: un punto por dentro del anillo
  const ah = ang(n - 1);
  lz.raw(`<circle cx="${f1(cx + Math.cos(ah) * (rIn - 12))}" cy="${f1(cy + Math.sin(ah) * (rIn - 12))}" r="3" fill="${t.acento}"/>`);
  lz.raw(lz.texto(cx + Math.cos(ah) * (rIn - 12) + 8, cy + Math.sin(ah) * (rIn - 12) + 13, "hoy", "mono-pequeno", "suave"));
  // centro
  lz.raw(lz.texto(cx, cy - 4, String(c.total), "cifra", "tinta", { anchor: "middle" }));
  lz.raw(lz.texto(cx, cy + 16, "contribuciones", "mono-pequeno", "suave", { anchor: "middle" }));
  lz.raw(lz.texto(cx, cy + 30, "últimos 12 meses", "mono-pequeno", "tenue", { anchor: "middle" }));

  // --- columna derecha ---
  const rx = 440;
  const rw = ANCHO - M - rx;
  let y = y0 + 40;
  const fila = (k, v, destacar = false) => {
    lz.raw(lz.texto(rx, y, k, "pequeno", "suave"));
    lz.raw(lz.texto(rx + rw, y, v, "pequeno-fuerte", destacar ? "acento" : "tinta", { anchor: "end" }));
    lz.raw(`<line x1="${rx}" y1="${y + 10.5}" x2="${rx + rw}" y2="${y + 10.5}" stroke="${t.rejilla}"/>`);
    y += 29;
  };
  lz.raw(lz.texto(rx, y, "resumen", "etiqueta", "suave"));
  y += 26;
  fila("Días con actividad", `${c.activos} de ${act.dias.length}`);
  fila("Racha más larga", `${c.larga} días`);
  fila("Racha actual", `${c.actual} ${c.actual === 1 ? "día" : "días"}`, c.actual > 0);
  fila("Día de mayor actividad", `${fechaCorta(c.mejor.fecha, false)} · ${c.mejor.n}`);
  fila("Día de la semana más activo", c.favorito);

  // reparto por tipo: una barra segmentada
  y += 14;
  lz.raw(lz.texto(rx, y, "por tipo", "etiqueta", "suave"));
  y += 14;
  const totalTipos = act.tipos.reduce((a, [, v]) => a + v, 0) || 1;
  const tonos = t.rojos;
  let x = rx;
  act.tipos.forEach(([, v], i) => {
    const w = (v / totalTipos) * rw;
    if (w > 0) lz.raw(`<rect x="${f1(x)}" y="${y}" width="${f1(Math.max(w - 2, 1))}" height="8" rx="1.5" fill="${tonos[i]}"/>`);
    x += w;
  });
  y += 28;
  x = rx;
  act.tipos.forEach(([k, v], i) => {
    lz.raw(`<rect x="${f1(x)}" y="${y - 8}" width="8" height="8" rx="1.5" fill="${tonos[i]}"/>`);
    lz.raw(lz.texto(x + 13, y, `${k}`, "mono-pequeno", "suave"));
    const wk = medir(k, "mono-pequeno");
    lz.raw(lz.texto(x + 17 + wk, y, String(v), "mono-pequeno", "tinta"));
    x += 17 + wk + medir(String(v), "mono-pequeno") + 16;
  });

  // repositorios con más commits
  y += 30;
  lz.raw(lz.texto(rx, y, "repositorios con más commits", "etiqueta", "suave"));
  y += 22;
  const maxRepo = Math.max(1, ...act.repos.map(([, v]) => v));
  act.repos.forEach(([nombre, v], i) => {
    let et = nombre.split("/")[1];
    while (medir(et, "pequeno") > 170 && et.length > 4) et = et.slice(0, -1);
    if (et !== nombre.split("/")[1]) et = `${et.slice(0, -1)}…`;
    lz.raw(lz.texto(rx, y, et, "pequeno", "tinta"));
    const bx = rx + 186;
    const bw = rw - 186 - 30;
    lz.raw(`<rect x="${bx}" y="${y - 6}" width="${f1(bw)}" height="3" rx="1.5" fill="${t.rejilla}"/>`);
    lz.raw(`<rect x="${bx}" y="${y - 6}" width="${f1((v / maxRepo) * bw)}" height="3" rx="1.5" fill="${t.rojos[Math.min(i, 2)]}"/>`);
    lz.raw(lz.texto(rx + rw, y, String(v), "mono-pequeno", "suave", { anchor: "end" }));
    y += 24;
  });

  // --- lenguajes ---
  const lgy = alto - 70;
  lz.raw(`<line x1="${M}" y1="${lgy - 24.5}" x2="${ANCHO - M}" y2="${lgy - 24.5}" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(M, lgy, "lenguajes", "etiqueta", "suave"));
  lz.raw(lz.texto(ANCHO - M, lgy, `${lng.repos} repositorios públicos`, "mono-pequeno", "suave", { anchor: "end" }));
  const colores = lng.lista.map(([l]) => COLOR_LENGUAJE[l] ?? t.suave);
  let lx = M;
  const anchoBarra = ANCHO - 2 * M;
  lng.lista.forEach(([, v], i) => {
    const w = v * anchoBarra;
    lz.raw(`<rect x="${f1(lx)}" y="${lgy + 14}" width="${f1(Math.max(w - 3, 1.5))}" height="6" rx="2" fill="${colores[i]}"/>`);
    lx += w;
  });
  lx = M;
  lng.lista.forEach(([l, v], i) => {
    const pct = `${(v * 100).toFixed(1).replace(".", ",")} %`;
    const w = medir(l, "pequeno-fuerte");
    lz.raw(`<rect x="${f1(lx)}" y="${lgy + 36}" width="8" height="8" rx="1.5" fill="${colores[i]}"/>`);
    lz.raw(lz.texto(lx + 14, lgy + 44, l, "pequeno-fuerte"));
    lz.raw(lz.texto(lx + 20 + w, lgy + 44, pct, "mono-pequeno", "suave"));
    lx += 20 + w + medir(pct, "mono-pequeno") + 24;
  });
  return lz.render();
}

const p = datos();
const act = await contribuciones(p.usuario);
const c = cifras(act.dias);
const lng = await lenguajes(p.usuario);
const out = {};
for (const tema of ["dark", "light"]) out[tema] = await tarjetaActividad(tema, p, act, c, lng);
guardar("actividad", out);
console.log(`actividad lista: ${c.total} contribuciones, ${lng.lista.length} lenguajes`);
