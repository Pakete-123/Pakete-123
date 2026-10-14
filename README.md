<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/banner-dark.svg">
  <img src="assets/banner-light.svg" width="100%" alt="Pablo Torrecilla. Estudiante de 2.º de DAM en el IES Lázaro Cárdenas. Técnico Superior en DAW.">
</picture>

<p align="center">
  <a href="mailto:pablotl.dev@gmail.com"><img src="https://img.shields.io/badge/correo-pablotl.dev%40gmail.com-0969da?style=flat-square" alt="Correo: pablotl.dev@gmail.com"></a>
  <a href="https://github.com/Pakete-123?tab=repositories"><img src="https://img.shields.io/badge/repos-4%20p%C3%BAblicos-8250df?style=flat-square" alt="Repositorios públicos"></a>
  <img src="https://img.shields.io/badge/Madrid-Espa%C3%B1a-8250df?style=flat-square" alt="Madrid, España">
</p>

## Sobre mí

Estudio **2.º de DAM** en el IES Lázaro Cárdenas, después de completar el ciclo de **Técnico Superior en Desarrollo de Aplicaciones Web (DAW)**. Me interesa sobre todo el desarrollo *full stack*: me gusta entender cómo funcionan las cosas por debajo y ponerlas en práctica en proyectos propios.

En DAM se toca mucho el lado *front* (HTML, CSS, JavaScript), pero lo que más me gusta es la parte de **servidor**: bases de datos, autenticación y arquitecturas más serias.

## Proyecto destacado

### [VisorPlanosRedes](https://github.com/Pakete-123/VisorPlanosRedes)

Visor de planos de redes de los edificios y sus distribuciones, en *full stack*.

**Backend — NestJS + Prisma + PostgreSQL**

- Arquitectura modular por dominio: `auth`, `users`, `floors` y `prisma`.
- Autenticación **JWT** con guardas de acceso por **roles** mediante decorador propio (`@Roles`).
- **Generación de PDF** de los planos a partir de los datos de cada planta (`pdf.service.ts`).
- Esquema **Prisma** con **tres migraciones versionadas** y *seed* de datos de ejemplo.
- Cobertura de **tests unitarios** de cada servicio y controlador, más **tests e2e** con Jest y *mocks* del cliente de Prisma.
- **Docker Compose** para levantar el entorno completo de forma reproducible.

**Frontend** en TypeScript, servido en contenedor aparte.

> Es el proyecto del que más orgulloso estoy: es donde se juntan las tres cosas que más me gustan, que son **modelar datos**, **protegerlos** y **exponerlos por una API decente**.

## Trayectoria

| Periodo | Etapa |
|---|---|
| 2024 — 2026 | **Desarrollo de Aplicaciones Web (DAW)** — Técnico Superior |
| 2026 — ahora | **Desarrollo de Aplicaciones Multiplataforma (DAM)** — 2.º curso, IES Lázaro Cárdenas |

## Stack

**Backend** · TypeScript · NestJS · Node.js · PostgreSQL · Prisma · PHP · SQL · JWT

**Frontend** · JavaScript · HTML5 · CSS3 · Sass · Grid · Flexbox

**Herramientas** · Git · GitHub · Docker · Jest · ESLint · Prettier

## Proyectos

| Repositorio | Módulo | Descripción |
|---|---|---|
| [VisorPlanosRedes](https://github.com/Pakete-123/VisorPlanosRedes) | Proyecto propio | Visor de planos de redes *full stack*. NestJS, Prisma, JWT con roles, PDF y tests e2e. |
| [dwec-u3-notasapp](https://github.com/Pakete-123/dwec-u3-notasapp-hortelano-torrecilla) | DWEC · U.D. 3 | Gestor de notas y recordatorios en JavaScript puro, con persistencia en Web Storage y control de versiones por *snapshots*. |
| [diw-u2-localhub](https://github.com/Pakete-123/diw-u2-localhub-hortelano-torrecilla) | DIW · U.D. 2 | Landing *one-page* responsive y accesible (AA) con CSS Grid y Flexbox, dos puntos de corte y micro-Sass. |
| [Actividad_UD2](https://github.com/Pakete-123/Actividad_UD2) | DWEC · U.D. 2 | Calculadora de presupuestos para una copistería, con descuentos por umbral. En pareja con Rafael Hortelano Hernández. |

## Contacto

- Correo: [pablotl.dev@gmail.com](mailto:pablotl.dev@gmail.com)
- GitHub: [@Pakete-123](https://github.com/Pakete-123)