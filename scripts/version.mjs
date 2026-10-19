// Pone en el README una marca de versión (?v=…) en cada imagen de assets/,
// calculada a partir de su contenido. Si un SVG cambia, cambia su dirección y
// los navegadores dejan de mostrar la copia que tenían guardada en caché.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ASSETS, RAIZ } from "./comun.mjs";

const readme = path.join(RAIZ, "README.md");
const texto = fs.readFileSync(readme, "utf8");
const nuevo = texto.replace(/assets\/([\w-]+\.svg)(\?v=[0-9a-f]+)?/g, (todo, fichero) => {
  const ruta = path.join(ASSETS, fichero);
  if (!fs.existsSync(ruta)) return todo;
  const huella = crypto.createHash("sha1").update(fs.readFileSync(ruta)).digest("hex").slice(0, 10);
  return `assets/${fichero}?v=${huella}`;
});
if (nuevo !== texto) fs.writeFileSync(readme, nuevo);
console.log(nuevo !== texto ? "README actualizado con nuevas versiones" : "README ya estaba al día");
