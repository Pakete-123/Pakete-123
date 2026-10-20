// Textos fijos de las tarjetas en cada idioma. Los textos personales (titular,
// sobre mí, formación…) están en datos/perfil.json; la sección "en" de ese
// fichero sustituye a la española al generar la versión en inglés.

export const IDIOMAS = ["es", "en"];

export const TEXTOS = {
  es: {
    meses: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
    dias: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    fecha: (d, m) => `${d} ${TEXTOS.es.meses[m]}`,
    fechaLarga: (a, m, d) => `${String(d).padStart(2, "0")}/${String(m + 1).padStart(2, "0")}/${a}`,
    // banner
    peticion: "petición",
    capas: [
      ["Angular", "cliente · formulario de login", "POST /api/login"],
      ["AdminMiddleware", "Laravel · comprueba el acceso", "isAdmin()"],
      ["AuthController", "Laravel · valida credenciales", "SELECT users"],
      ["MySQL", "tabla users", null],
    ],
    // tarjetas
    correo: "correo",
    respuesta: "respuesta",
    tituloSobreMi: "Sobre mí",
    tituloFormacion: "Formación",
    registros: (n) => `200 OK · ${n} registros`,
    stackMeta: (n, c) => `${n} tecnologías · ${c} capas`,
    // actividad
    sincronizado: (f) => `200 OK · sincronizado el ${f}`,
    contribuciones: "contribuciones",
    hoy: "hoy",
    publicas: "públicas",
    privadas: "privadas",
    diasActividad: "días con actividad",
    rachaLarga: "racha más larga",
    rachaActual: "racha actual",
    mejorDia: "mejor día",
    diaActivo: "día más activo",
    enRepos: "actividad en repositorios",
    publicos: "públicos",
    privados: "privados",
    lenguajes: "lenguajes",
    reposPublicos: (n) => `${n} repositorios públicos`,
    tituloActividad: "Actividad en GitHub",
    // selector de idioma
    cambiar: "Ver el perfil en inglés",
  },
  en: {
    meses: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    dias: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    fecha: (d, m) => `${TEXTOS.en.meses[m]} ${d}`,
    fechaLarga: (a, m, d) => `${TEXTOS.en.meses[m]} ${d}, ${a}`,
    peticion: "request",
    capas: [
      ["Angular", "client · login form", "POST /api/login"],
      ["AdminMiddleware", "Laravel · checks access", "isAdmin()"],
      ["AuthController", "Laravel · validates credentials", "SELECT users"],
      ["MySQL", "users table", null],
    ],
    correo: "email",
    respuesta: "response",
    tituloSobreMi: "About me",
    tituloFormacion: "Education",
    registros: (n) => `200 OK · ${n} records`,
    stackMeta: (n, c) => `${n} technologies · ${c} layers`,
    sincronizado: (f) => `200 OK · synced on ${f}`,
    contribuciones: "contributions",
    hoy: "today",
    publicas: "public",
    privadas: "private",
    diasActividad: "active days",
    rachaLarga: "longest streak",
    rachaActual: "current streak",
    mejorDia: "best day",
    diaActivo: "most active day",
    enRepos: "activity in repositories",
    publicos: "public",
    privados: "private",
    lenguajes: "languages",
    reposPublicos: (n) => `${n} public repositories`,
    tituloActividad: "GitHub activity",
    cambiar: "View the profile in Spanish",
  },
};

/** El perfil en el idioma pedido: la sección "en" sustituye a lo que traduce. */
export function perfilEn(p, idioma) {
  if (idioma === "es" || !p.en) return p;
  return { ...p, ...p.en, sobre_mi: { ...p.sobre_mi, ...p.en.sobre_mi } };
}

/** Sufijo de fichero: nada en español, "-en" en inglés. */
export const sufijo = (idioma) => (idioma === "es" ? "" : `-${idioma}`);
