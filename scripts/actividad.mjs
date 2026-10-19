// Tarjeta de actividad con datos vivos de GitHub:
// - una esfera que flota y gira con el total del año y, alrededor, un anillo en perspectiva con
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

  // --- la escena: esfera y anillo de días en perspectiva ---
  const cx = ANCHO / 2;
  const cy = y0 + 190;
  const R = 330; // semieje horizontal del anillo
  const r = 64; // semieje vertical (inclinación)
  const hMax = 92;
  const radio = 70; // de la esfera
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
  lz.defs.push(
    `<radialGradient id="esfera" cx="0.5" cy="0.5" r="0.5" fx="0.34" fy="0.3">` +
      `<stop offset="0" stop-color="#e0606c"/><stop offset="0.35" stop-color="${"#a3162a"}"/>` +
      `<stop offset="0.8" stop-color="#800517"/><stop offset="1" stop-color="#3d0209"/></radialGradient>`,
    `<radialGradient id="brillo" cx="0.36" cy="0.28" r="0.3"><stop offset="0" stop-color="#fff" stop-opacity="0.45"/>` +
      `<stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="sombra" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="${tema === "dark" ? 0.55 : 0.18}"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`,
  );

  const yBola = cy - radio * 0.55;
  lz.defs.push(
    `<filter id="halo" x="-2" y="-2" width="5" height="5"><feGaussianBlur stdDeviation="3"/></filter>`,
    `<clipPath id="bola"><circle cx="${cx}" cy="${f1(yBola)}" r="${radio}"/></clipPath>`,
    `<clipPath id="atras"><rect x="0" y="0" width="${ANCHO}" height="${f1(cy)}"/></clipPath>`,
    `<clipPath id="delante"><rect x="0" y="${f1(cy)}" width="${ANCHO}" height="${alto}"/></clipPath>`,
  );

  // Públicas y privadas, con contraste suficiente en los dos temas.
  const colPub = tema === "dark" ? t.rojos[0] : t.acento;
  const colPriv = tema === "dark" ? t.rojos[1] : t.rojos[2];
  // Paralelos fijos y meridianos que giran: la esfera parece rotar sobre su eje.
  const rejillaBola = () => {
    let g = `<g clip-path="url(#bola)" fill="none" stroke="#ffffff" stroke-width="0.8" opacity="0.16">`;
    for (const lat of [-50, -25, 0, 25, 50]) {
      const rad = (lat * Math.PI) / 180;
      const rx = radio * Math.cos(rad);
      g += `<ellipse cx="${cx}" cy="${f1(yBola + radio * Math.sin(rad))}" rx="${f1(rx)}" ry="${f1(rx * 0.18)}"/>`;
    }
    const pasos = 24;
    for (let m = 0; m < 4; m++) {
      const fase = (m * Math.PI) / 4;
      const valores = Array.from({ length: pasos + 1 }, (_, k) => f1(radio * Math.abs(Math.cos(fase + (k / pasos) * Math.PI))));
      g +=
        `<ellipse cx="${cx}" cy="${f1(yBola)}" rx="${valores[0]}" ry="${radio}">` +
        `<animate attributeName="rx" values="${valores.join(";")}" dur="9s" repeatCount="indefinite"/></ellipse>`;
    }
    return g + "</g>";
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
  const detras = barras.filter((b) => b.prof < 0.5).sort((a, b) => a.y - b.y);
  const delante = barras.filter((b) => b.prof >= 0.5).sort((a, b) => a.y - b.y);

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
  // Cometa con estela que recorre el anillo desde hoy hacia atrás en el tiempo.
  // Se dibuja dos veces, recortado: la mitad del fondo queda detrás de la
  // esfera y la de delante, encima de todo.
  const vuelta = `M${cx} ${f1(cy + r)}A${R} ${r} 0 1 1 ${cx} ${f1(cy - r)}A${R} ${r} 0 1 1 ${cx} ${f1(cy + r)}`;
  const colCometa = tema === "dark" ? "#ff9aa4" : "#c2414f";
  const cometa = (recorte) => {
    let g = `<g clip-path="url(#${recorte})">`;
    g +=
      `<circle r="7" fill="${colCometa}" opacity="0" filter="url(#halo)"><set attributeName="opacity" to="0.6" begin="1.8s"/>` +
      `<animateMotion path="${vuelta}" dur="10s" begin="1.8s" repeatCount="indefinite"/></circle>`;
    for (let k = 7; k >= 0; k--) {
      const ini = f1(1.8 + k * 0.05);
      const rad = k === 0 ? 3.4 : f1(3 - k * 0.3);
      const op = k === 0 ? 1 : f1(0.75 - k * 0.09);
      g +=
        `<circle r="${rad}" fill="${colCometa}" opacity="0"><set attributeName="opacity" to="${op}" begin="${ini}s"/>` +
        `<animateMotion path="${vuelta}" dur="10s" begin="${ini}s" repeatCount="indefinite"/></circle>`;
    }
    return g + "</g>";
  };
  for (const b of detras) lz.raw(dibujaBarra(b));
  lz.raw(cometa("atras"));
  // La esfera flota despacio; su sombra se encoge y se aclara cuando sube.
  const flota = `dur="4.5s" repeatCount="indefinite" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1"`;
  lz.raw(
    `<ellipse cx="${cx}" cy="${f1(cy + 6)}" rx="${radio * 1.15}" ry="${radio * 0.32}" fill="url(#sombra)">` +
      `<animate attributeName="rx" values="${f1(radio * 1.15)};${f1(radio * 0.95)};${f1(radio * 1.15)}" ${flota}/>` +
      `<animate attributeName="opacity" values="1;0.6;1" ${flota}/></ellipse>`,
  );
  lz.raw(
    `<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -7;0 0" ${flota}/>` +
      `<circle cx="${cx}" cy="${f1(yBola)}" r="${radio}" fill="url(#esfera)"/>` +
      rejillaBola() +
      `<circle cx="${cx}" cy="${f1(yBola)}" r="${radio}" fill="url(#brillo)"/>` +
      cuenta(c.total, cx, yBola + 4) +
      lz.texto(cx, cy - radio * 0.55 + 22, "contribuciones", "mono-pequeno", "#f3c9ce", { anchor: "middle" }) +
      `</g>`,
  );
  for (const b of delante) lz.raw(dibujaBarra(b));
  lz.raw(cometa("delante"));
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
