// Tarjeta de actividad con datos vivos de GitHub:
// - globo terrestre con un punto por fecha; la altura indica actividad;
// - un resumen con cifras, el reparto por tipo y los repositorios con más commits;
// - proyectos y lenguajes de repositorios públicos y privados.
//
// Necesita un token en GITHUB_TOKEN (en el workflow lo pone Actions; en local
// vale `GITHUB_TOKEN=$(gh auth token) node scripts/actividad.mjs`).

import { globo } from "./globo.mjs";
import { ANCHO, Lienzo, datos, f1, guardar, medir } from "./comun.mjs";

const API = "https://api.github.com";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
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
      commitContributionsByRepository(maxRepositories: 100) { repository { nameWithOwner isPrivate } contributions { totalCount } }
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
    repos: c.commitContributionsByRepository.map((x) => ({ nombre: x.repository.nameWithOwner, n: x.contributions.totalCount, privado: x.repository.isPrivate })).sort((a,b) => b.n-a.n),
  };
}

async function lenguajes(usuario) {
  const repos = [];
  const viewer = await peticion(API + '/graphql', { query: '{ viewer { login } }' });
  if (viewer.errors) throw new Error('No se pudo comprobar la identidad del token');
  const propio = viewer.data.viewer.login.toLowerCase() === usuario.toLowerCase();
  for (let page = 1; ; page++) {
    const endpoint = propio ? '/user/repos?affiliation=owner&visibility=all' : '/users/' + usuario + '/repos?type=owner';
    const lote = await peticion(API + endpoint + '&per_page=100&page=' + page);
    repos.push(...lote);
    if (lote.length < 100) break;
  }
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
  return { lista, repos: contados, privados: repos.filter(r => r.private && !r.fork && r.name !== usuario).map(r => ({ nombre:r.name, lenguaje:r.language || "Código", actualizado:r.pushed_at, url:r.html_url })) };
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

// Globo terrestre y panel de repositorios privados con datos autenticados.
async function tarjetaActividad(tema, p, act, c, lng) {
  const filasPrivadas = Math.ceil(lng.privados.length / 3);
  const bloquePrivado = lng.privados.length ? 76 + filasPrivadas * 100 : 0;
  const alto = 634 + bloquePrivado;
  const lz = new Lienzo(ANCHO, alto, tema, 'Actividad en GitHub · mundo de código',
    `${c.total} contribuciones en 365 días. ${c.activos} días activos. ` +
    `${lng.repos} repositorios analizados, ${lng.privados.length} privados. ` +
    `Lenguajes por volumen de código: ${lng.lista.map(([l,v]) => `${l} ${(v*100).toFixed(1)} %`).join(', ')}.`);
  const t = lz.t;
  const brillo = tema === 'dark' ? '#d4465b' : '#a82b40';
  const lateral = tema === 'dark' ? '#400d19' : '#b66570';
  lz.defs.push(
    `<linearGradient id="panel3d" x2=".8" y2="1"><stop stop-color="${t.panel}"/><stop offset="1" stop-color="${t.fondo}"/></linearGradient>`,
    `<linearGradient id="metal" x2=".25" y2="1"><stop stop-color="${t.tenue}"/><stop offset=".5" stop-color="${t.panel}"/><stop offset="1" stop-color="${t.fondo}"/></linearGradient>`,
    `<linearGradient id="relieve" x2=".5" y2="1"><stop stop-color="${brillo}"/><stop offset="1" stop-color="${t.acento}"/></linearGradient>`,
    `<radialGradient id="luz"><stop stop-color="${t.acento}" stop-opacity=".16"/><stop offset="1" stop-color="${t.acento}" stop-opacity="0"/></radialGradient>`);
  lz.css.push('@keyframes entrada{from{transform:translateY(8px)}to{transform:translateY(0)}}.relieve{animation:entrada 1.2s ease-out both}@media(prefers-reduced-motion:reduce){.relieve{animation:none}}');
  lz.raw(`<rect x="3" y="8" width="854" height="${alto-9}" rx="16" fill="${t.tenue}" opacity=".38"/><rect x=".5" y=".5" width="859" height="${alto-12}" rx="16" fill="url(#panel3d)" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(28,35,'POST','seccion','acento'));
  lz.raw(lz.texto(79,35,'/activity/sync','seccion'));
  lz.raw(`<circle cx="603" cy="30" r="3" fill="${t.ok}"/>`);
  lz.raw(lz.texto(832,35,`sincronizado · ${fechaCorta(c.hasta)}`,'meta','suave',{anchor:'end'}));
  lz.raw(`<path d="M28 55H832" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(32,87,'01 / MI MUNDO EN CÓDIGO','meta','suave'));
  lz.raw(lz.texto(32,112,'Un año de actividad, conectado punto a punto.','pequeno','suave'));

  globo(lz, act.dias, c.total);

  const rx=446,rw=386;
  lz.raw(lz.texto(rx,87,'02 / EN CIFRAS','meta','suave'));
  let y=121;
  for(const [label,value] of [
    ['Días con actividad',`${c.activos} de ${act.dias.length}`],
    ['Racha más larga',`${c.larga} días`],['Racha actual',`${c.actual} ${c.actual === 1 ? 'día' : 'días'}`],
    ['Mejor día',`${fechaCorta(c.mejor.fecha,false)} · ${c.mejor.n}`],
  ]) {
    lz.raw(lz.texto(rx,y,label,'pequeno','suave'));
    lz.raw(lz.texto(rx+rw,y,value,'pequeno-fuerte','tinta',{anchor:'end'}));
    lz.raw(`<path d="M${rx} ${y+10}H832" stroke="${t.linea}"/>`);
    y+=29;
  }
  lz.raw(lz.texto(rx,250,'contribuciones por tipo','etiqueta','suave'));
  const totalTipos=act.tipos.reduce((a,[,v])=>a+v,0)||1;
  let x=rx;
  act.tipos.forEach(([,v],i)=>{
    const w=v/totalTipos*rw;
    if(w>0) lz.raw(`<rect x="${f1(x)}" y="263" width="${f1(Math.max(.5,w-2))}" height="7" rx="2" fill="${t.rojos[i]}"/>`);
    x+=w;
  });
  act.tipos.forEach(([label,value],i)=>{
    const xx=rx+(i%2)*198, yy=291+Math.floor(i/2)*22;
    lz.raw(`<rect x="${xx}" y="${yy-7}" width="6" height="6" rx="1" fill="${t.rojos[i]}"/>`);
    lz.raw(lz.texto(xx+12,yy,`${label} ${value}`,'mono-pequeno','suave'));
  });
  lz.raw(lz.texto(rx,348,'repositorios con más commits','etiqueta','suave'));
  const top=act.repos.slice(0,4), maxRepo=Math.max(1,...top.map(r=>r.n));
  top.forEach((r,i)=>{
    const yy=374+i*27;
    let label=r.nombre.split('/')[1];
    while(medir(label,'pequeno')>179) label=label.slice(0,-2)+'…';
    lz.raw(lz.texto(rx+(r.privado?14:0),yy,label,'pequeno'));
    if(r.privado) lz.raw(candado(rx,yy-9,t.suave));
    const w=r.n/maxRepo*139;
    lz.raw(`<rect x="647" y="${yy-7}" width="139" height="5" rx="2" fill="${t.linea}"/>`);
    if(w>0) lz.raw(`<rect x="647" y="${yy-5}" width="${f1(w)}" height="5" rx="2" fill="${lateral}"/><rect x="647" y="${yy-8}" width="${f1(w)}" height="5" rx="2" fill="url(#relieve)"/>`);
    lz.raw(lz.texto(832,yy,String(r.n),'mono-pequeno','suave',{anchor:'end'}));
  });
  if (lng.privados.length) {
    lz.raw('<path d="M28 515H832" stroke="'+t.linea+'"/>');
    lz.raw(lz.texto(28,543,'03 / DETRÁS DEL CÓDIGO','meta','suave'));
    lz.raw(lz.texto(832,543,lng.privados.length+' repositorios privados','meta','suave',{anchor:'end'}));
    lng.privados.sort((a,b)=>a.nombre.localeCompare(b.nombre)).forEach((repo,i)=>{
      const x=28+(i%3)*272,y=560+Math.floor(i/3)*100;
      lz.raw('<rect x="'+(x+2)+'" y="'+(y+5)+'" width="260" height="85" rx="10" fill="'+t.tenue+'" opacity=".2"/><rect x="'+x+'" y="'+y+'" width="260" height="84" rx="10" fill="'+t.panel+'" stroke="'+t.linea+'"/>');
      lz.raw(candado(x+16,y+13,t.suave));
      lz.raw(lz.texto(x+32,y+23,'PRIVADO','mono-pequeno','suave'));
      let nombre=repo.nombre;
      while(medir(nombre,'titulo')>220) nombre=nombre.slice(0,-2)+'…';
      lz.raw(lz.texto(x+16,y+48,nombre,'titulo'));
      const color=COLOR_LENGUAJE[repo.lenguaje]??t.suave;
      lz.raw('<circle cx="'+(x+20)+'" cy="'+(y+67)+'" r="3" fill="'+color+'"/>');
      lz.raw(lz.texto(x+30,y+71,repo.lenguaje,'mono-pequeno','suave'));
      if(repo.actualizado) lz.raw(lz.texto(x+244,y+71,fechaCorta(repo.actualizado.slice(0,10),false),'mono-pequeno','suave',{anchor:'end'}));
    });
  }
  lz.raw(`<path d="M28 ${505+bloquePrivado}H832" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(28,532+bloquePrivado,'lenguajes','etiqueta','suave'));
  lz.raw(lz.texto(832,532+bloquePrivado,`${lng.repos} repos · ${lng.privados.length} privados incluidos`,'mono-pequeno','suave',{anchor:'end'}));
  let lx=28;
  lng.lista.forEach(([l,v])=>{
    const w=v*804,color=COLOR_LENGUAJE[l]??t.suave;
    lz.raw(`<rect x="${f1(lx)}" y="${547+bloquePrivado}" width="${f1(Math.max(.5,w-2))}" height="8" rx="2" fill="${color}" opacity=".35"/><rect x="${f1(lx)}" y="${544+bloquePrivado}" width="${f1(Math.max(.5,w-2))}" height="7" rx="2" fill="${color}"/>`);
    lx+=w;
  });
  lx=28;
  for(const [l,v] of lng.lista) {
    const label=`${l} ${(v*100).toFixed(1).replace('.',',')} %`;
    lz.raw(`<rect x="${f1(lx)}" y="${569+bloquePrivado}" width="7" height="7" rx="1" fill="${COLOR_LENGUAJE[l]??t.suave}"/>`);
    lz.raw(lz.texto(lx+13,576+bloquePrivado,label,'mono-pequeno'));
    lx+=medir(label,'mono-pequeno')+34;
  }
  return lz.render();
}

function candado(x,y,color) {
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="1"><rect x="1" y="5" width="8" height="6" rx="1.3"/><path d="M3 5V3a2 2 0 0 1 4 0v2"/></g>`;
}

const p = datos();
const act = await contribuciones(p.usuario);
const c = cifras(act.dias);
const lng = await lenguajes(p.usuario);
const out = {};
for (const tema of ["dark", "light"]) out[tema] = await tarjetaActividad(tema, p, act, c, lng);
guardar("actividad", out);
console.log(`actividad lista: ${c.total} contribuciones, ${lng.lista.length} lenguajes`);
