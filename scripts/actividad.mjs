// Actividad agregada: los datos privados solo participan en las cifras.
import { pathToFileURL } from "node:url";
import { ANCHO, Lienzo, datos, f1, guardar, medir } from "./comun.mjs";
import { circular3d, COLORES } from "./circular3d.mjs";

const API = "https://api.github.com";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const COLOR_LENGUAJE = { TypeScript: "#3178c6", JavaScript: "#f1e05a", CSS: "#663399", HTML: "#e34c26", SCSS: "#c6538c", PHP: "#4f5d95", Java: "#b07219", Blade: "#f7523f", Vue: "#41b883", Python: "#3572a5" };

async function peticion(url, cuerpo) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error("Falta GITHUB_TOKEN o GH_TOKEN. Configura PROFILE_TOKEN en GitHub Actions.");
  const r = await fetch(url, {
    method: cuerpo ? "POST" : "GET",
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "perfil-pakete-123" },
  });
  if (!r.ok) throw new Error(`GitHub: HTTP ${r.status}`);
  const json = await r.json();
  if (json.errors) throw new Error("GitHub no pudo devolver los datos de actividad; comprueba los permisos del token.");
  return json;
}

export function resumirContribuciones(c, desde, hasta) {
  const dias = c.contributionCalendar.weeks.flatMap(s => s.contributionDays)
    .filter(d => d.date >= desde && d.date <= hasta)
    .map(d => ({ fecha: d.date, n: d.contributionCount }));
  const total = dias.reduce((s, d) => s + d.n, 0);
  const tipos = [
    ["Commits", c.totalCommitContributions],
    ["Pull requests", c.totalPullRequestContributions],
    ["Revisiones", c.totalPullRequestReviewContributions],
    ["Issues", c.totalIssueContributions],
  ];
  // El calendario ya incluye la actividad privada autorizada. No volver a
  // sumar restrictedContributionsCount: duplicaría esas contribuciones.
  // Incluye también creaciones de repositorios y actividad sin tipo visible.
  const otras = total - tipos.reduce((s, [, n]) => s + n, 0);
  if (otras < 0) throw new Error("El calendario y el desglose de GitHub no coinciden; se conserva la tarjeta anterior.");
  tipos.push(["Otras", otras]);
  return { dias, tipos };
}

export async function contribuciones(usuario, ahora = new Date()) {
  const hasta = ahora.toISOString().slice(0, 10);
  const inicio = new Date(`${hasta}T00:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - 364);
  const desde = inicio.toISOString().slice(0, 10);
  const r = await peticion(`${API}/graphql`, {
    query: `query($u: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $u) { contributionsCollection(from: $from, to: $to) {
        totalCommitContributions totalPullRequestContributions
        totalPullRequestReviewContributions totalIssueContributions
        contributionCalendar { weeks { contributionDays { date contributionCount } } }
      } }
    }`,
    variables: { u: usuario, from: inicio.toISOString(), to: ahora.toISOString() },
  });
  if (!r.data?.user) throw new Error("No se encontró el perfil de GitHub.");
  return resumirContribuciones(r.data.user.contributionsCollection, desde, hasta);
}

export async function lenguajes(usuario) {
  const total = new Map();
  let contados = 0;
  for (let page = 1; ; page++) {
    const lote = await peticion(`${API}/users/${encodeURIComponent(usuario)}/repos?type=owner&per_page=100&page=${page}`);
    for (const repo of lote) {
      // Filtrar antes de consultar lenguajes: ninguna ruta privada se utiliza.
      if (repo.private || repo.visibility === "internal" || repo.fork || repo.name.toLowerCase() === usuario.toLowerCase()) continue;
      contados++;
      const ls = await peticion(repo.languages_url);
      for (const [l, b] of Object.entries(ls)) total.set(l, (total.get(l) ?? 0) + b);
    }
    if (lote.length < 100) break;
  }
  const suma = [...total.values()].reduce((a, b) => a + b, 0) || 1;
  let lista = [...total].sort((a, b) => b[1] - a[1]).map(([l, b]) => [l, b / suma]);
  if (lista.length > 5) lista = [...lista.slice(0, 4), ["Otros", lista.slice(4).reduce((a, [, x]) => a + x, 0)]];
  return { lista, repos: contados };
}

export function cifras(dias) {
  if (!dias.length) throw new Error("GitHub no devolvió el calendario de actividad.");
  const total = dias.reduce((a, d) => a + d.n, 0);
  const activos = dias.filter(d => d.n > 0).length;
  let larga = 0, r = 0;
  for (const d of dias) {
    r = d.n > 0 ? r + 1 : 0;
    larga = Math.max(larga, r);
  }
  let actual = 0, i = dias.length - 1;
  if (dias[i]?.n === 0) i--;
  while (i >= 0 && dias[i].n > 0) { actual++; i--; }
  const mejor = dias.reduce((a, d) => d.n > a.n ? d : a, dias[0]);
  return { total, activos, larga, actual, mejor, hasta: dias.at(-1).fecha };
}

const fechaCorta = (iso, anio = true) => {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1]}${anio ? ` ${a}` : ""}`;
};
const diasTexto = n => `${n} ${n === 1 ? "día" : "días"}`;

export async function tarjetaActividad(tema, act, c, lng) {
  const alto = 570;
  const lz = new Lienzo(ANCHO, alto, tema, "Actividad en GitHub · contribuciones",
    `${c.total} contribuciones en ${act.dias.length} días, representadas en un gráfico circular 3D. ` +
    `${act.tipos.map(([l, n]) => `${l}: ${n}`).join(". ")}. ${c.activos} días activos. ` +
    `Lenguajes de ${lng.repos} repositorios públicos.`);
  const t = lz.t;
  lz.defs.push(`<linearGradient id="panel3d" x2=".8" y2="1"><stop stop-color="${t.panel}"/><stop offset="1" stop-color="${t.fondo}"/></linearGradient>`);
  lz.raw(`<rect x="3" y="8" width="854" height="${alto - 9}" rx="16" fill="${t.tenue}" opacity=".38"/><rect x=".5" y=".5" width="859" height="${alto - 12}" rx="16" fill="url(#panel3d)" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(28, 35, "POST", "seccion", "acento"));
  lz.raw(lz.texto(79, 35, "/activity/sync", "seccion"));
  lz.raw(`<circle cx="603" cy="30" r="3" fill="${t.ok}"/>`);
  lz.raw(lz.texto(832, 35, `sincronizado · ${fechaCorta(c.hasta)}`, "meta", "suave", { anchor: "end" }));
  lz.raw(`<path d="M28 55H832" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(32, 87, "01 / CONTRIBUCIONES", "meta", "suave"));
  lz.raw(lz.texto(32, 112, "Un año de actividad, contribución a contribución.", "pequeno", "suave"));
  circular3d(lz, act.tipos, c.total, act.dias.length);
  lz.raw(lz.texto(220, 432, `${c.activos} días con actividad`, "pequeno-fuerte", "tinta", { anchor: "middle" }));
  lz.raw(lz.texto(220, 451, "Cada sector representa un tipo de contribución", "mono-pequeno", "suave", { anchor: "middle" }));

  const rx = 446;
  lz.raw(lz.texto(rx, 87, "02 / EN CIFRAS", "meta", "suave"));
  let y = 121;
  for (const [label, value] of [
    ["Días con actividad", `${c.activos} de ${act.dias.length}`],
    ["Racha más larga", diasTexto(c.larga)],
    ["Racha actual", diasTexto(c.actual)],
    ["Mejor día", c.total ? `${fechaCorta(c.mejor.fecha, false)} · ${c.mejor.n}` : "Sin actividad"],
  ]) {
    lz.raw(lz.texto(rx, y, label, "pequeno", "suave"));
    lz.raw(lz.texto(832, y, value, "pequeno-fuerte", "tinta", { anchor: "end" }));
    lz.raw(`<path d="M${rx} ${y + 10}H832" stroke="${t.linea}"/>`);
    y += 29;
  }
  lz.raw(lz.texto(rx, 250, "contribuciones por tipo", "etiqueta", "suave"));
  lz.raw(lz.texto(832, 250, "% del total", "mono-pequeno", "suave", { anchor: "end" }));
  act.tipos.forEach(([label, value], i) => {
    const yy = 282 + i * 32;
    lz.raw(`<rect x="${rx}" y="${yy - 9}" width="8" height="8" rx="2" fill="${COLORES[tema][i]}"/>`);
    lz.raw(lz.texto(rx + 18, yy, label, "pequeno"));
    lz.raw(lz.texto(748, yy, String(value), "pequeno-fuerte", "tinta", { anchor: "end" }));
    const porcentaje = c.total ? value / c.total * 100 : 0;
    lz.raw(lz.texto(832, yy, `${porcentaje.toFixed(1).replace(".", ",")} %`, "mono-pequeno", "suave", { anchor: "end" }));
  });

  lz.raw(`<path d="M28 478H832" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(28, 503, "lenguajes", "etiqueta", "suave"));
  lz.raw(lz.texto(832, 503, `${lng.repos} repositorios públicos`, "mono-pequeno", "suave", { anchor: "end" }));
  let x = 28;
  for (const [l, v] of lng.lista) {
    const w = v * 804, color = COLOR_LENGUAJE[l] ?? t.suave;
    lz.raw(`<rect x="${f1(x)}" y="518" width="${f1(Math.max(.5, w - 2))}" height="7" rx="2" fill="${color}"/>`);
    x += w;
  }
  x = 28;
  for (const [l, v] of lng.lista) {
    const label = `${l} ${(v * 100).toFixed(1).replace(".", ",")} %`;
    lz.raw(`<rect x="${f1(x)}" y="539" width="7" height="7" rx="1" fill="${COLOR_LENGUAJE[l] ?? t.suave}"/>`);
    lz.raw(lz.texto(x + 13, 546, label, "mono-pequeno"));
    x += medir(label, "mono-pequeno") + 34;
  }
  if (!lng.lista.length) lz.raw(lz.texto(28, 536, "Sin datos de lenguajes públicos", "pequeno", "suave"));
  return lz.render();
}

async function main() {
  const p = datos();
  const [act, lng] = await Promise.all([contribuciones(p.usuario), lenguajes(p.usuario)]);
  const c = cifras(act.dias);
  const out = {};
  for (const tema of ["dark", "light"]) out[tema] = await tarjetaActividad(tema, act, c, lng);
  guardar("actividad", out);
  console.log(`actividad lista: ${c.total} contribuciones, ${lng.lista.length} lenguajes públicos`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
