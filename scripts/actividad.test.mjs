import test from "node:test";
import assert from "node:assert/strict";
import { cifras, contribuciones, lenguajes, resumirContribuciones, tarjetaActividad } from "./actividad.mjs";

const coleccion = {
  totalCommitContributions: 7,
  totalPullRequestContributions: 2,
  totalPullRequestReviewContributions: 1,
  totalIssueContributions: 0,
  restrictedContributionsCount: 3,
  contributionCalendar: { weeks: [{ contributionDays: [
    { date: "2026-10-15", contributionCount: 8 },
    { date: "2026-10-16", contributionCount: 6 },
  ] }] },
};

function tokenPrueba(t) {
  const anterior = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "token-de-prueba";
  t.after(() => {
    if (anterior === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = anterior;
  });
}

test("la actividad restringida se incluye una sola vez y el desglose suma el total", () => {
  const act = resumirContribuciones(coleccion, "2026-10-15", "2026-10-16");
  assert.equal(cifras(act.dias).total, 14);
  assert.equal(act.tipos.reduce((s, [, n]) => s + n, 0), 14);
  assert.deepEqual(act.tipos.at(-1), ["Otras", 4]);
  assert.deepEqual(Object.keys(act).sort(), ["dias", "tipos"]);
  assert.doesNotMatch(JSON.stringify(act), /restricted|repository|privado/i);
});

test("si GitHub devuelve cifras incoherentes no se publica un gráfico incorrecto", () => {
  assert.throws(() => resumirContribuciones({ ...coleccion, totalCommitContributions: 30 }, "2026-10-15", "2026-10-16"), /no coinciden/);
});

test("el intervalo de 365 días y el desglose usan las mismas fechas, también en año bisiesto", async t => {
  tokenPrueba(t);
  let consulta;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    consulta = JSON.parse(options.body);
    const c = { ...coleccion, contributionCalendar: { weeks: [{ contributionDays: [{ date: "2024-03-01", contributionCount: 14 }] }] } };
    return { ok: true, json: async () => ({ data: { user: { contributionsCollection: c } } }) };
  });
  await contribuciones("ejemplo", new Date("2024-03-01T10:00:00Z"));
  assert.equal(consulta.variables.from, "2023-03-03T00:00:00.000Z");
  assert.equal(consulta.variables.to, "2024-03-01T10:00:00.000Z");
  assert.doesNotMatch(consulta.query, /nameWithOwner|isPrivate|ContributionsByRepository/);
});

test("los repositorios privados e internos no se consultan ni afectan a los lenguajes", async t => {
  tokenPrueba(t);
  const llamadas = [];
  t.mock.method(globalThis, "fetch", async url => {
    llamadas.push(url);
    const json = url.includes("/users/") ? [
      { name: "secreto-no-publicar", private: true, languages_url: "https://api.github.com/privado" },
      { name: "interno-no-publicar", visibility: "internal", languages_url: "https://api.github.com/interno" },
      { name: "fork", fork: true, languages_url: "https://api.github.com/fork" },
      { name: "Ejemplo", languages_url: "https://api.github.com/perfil" },
      { name: "publico", private: false, languages_url: "https://api.github.com/publico" },
    ] : { JavaScript: 80, CSS: 20 };
    return { ok: true, json: async () => json };
  });
  const lng = await lenguajes("ejemplo");
  assert.deepEqual(llamadas, ["https://api.github.com/users/ejemplo/repos?type=owner&per_page=100&page=1", "https://api.github.com/publico"]);
  assert.deepEqual(lng, { repos: 1, lista: [["JavaScript", .8], ["CSS", .2]] });
  assert.doesNotMatch(JSON.stringify(lng), /secreto|interno/);
});

test("las rachas se mantienen si hoy aún no hay actividad", () => {
  const dias = [0, 1, 3, 0, 2, 0].map((n, i) => ({ n, fecha: `2026-10-${10 + i}` }));
  assert.deepEqual(cifras(dias), { total: 6, activos: 3, larga: 2, actual: 1, mejor: dias[2], hasta: "2026-10-15" });
});

test("ambos temas generan SVG sin metadatos privados, ni ranking, ni globo", async () => {
  const act = resumirContribuciones(coleccion, "2026-10-15", "2026-10-16");
  const lng = { repos: 1, lista: [["JavaScript", 1]], privados: [{ nombre: "secreto-no-publicar" }] };
  for (const tema of ["dark", "light"]) {
    const svg = await tarjetaActividad(tema, act, cifras(act.dias), lng);
    assert.match(svg, /gráfico circular 3D/);
    assert.match(svg, /14 contribuciones/);
    assert.match(svg, /1 repositorios públicos/);
    assert.doesNotMatch(svg, /secreto-no-publicar|privado|nameWithOwner|repositorios con más commits|globo|NaN|Infinity/i);
  }
});

test("cero contribuciones y un único tipo activo tienen una representación válida", async () => {
  for (const n of [0, 1]) {
    const act = { dias: [{ fecha: "2026-10-16", n }], tipos: [["Commits", n], ["Pull requests", 0], ["Revisiones", 0], ["Issues", 0], ["Otras", 0]] };
    const svg = await tarjetaActividad("dark", act, cifras(act.dias), { lista: [], repos: 0 });
    assert.doesNotMatch(svg, /NaN|Infinity/);
    assert.match(svg, /Sin datos de lenguajes públicos/);
    if (!n) assert.match(svg, /Sin actividad/);
  }
});
