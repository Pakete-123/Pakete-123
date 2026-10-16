import fs from 'node:fs';
import path from 'node:path';
import { geoOrthographic, geoPath, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import { ASSETS, f1, esc } from './comun.mjs';

// Natural Earth, redistribuido por world-atlas 2.0.2 (licencia en assets/).
// https://github.com/topojson/world-atlas
const topologia = JSON.parse(fs.readFileSync(path.join(ASSETS,'tierra-110m.json'),'utf8'));
const tierra = feature(topologia, topologia.objects.land);

export function globo(lz, dias, total) {
  const t=lz.t, oscuro=lz.tema==='dark';
  const cx=220,cy=286,r=150;
  const proyeccion=geoOrthographic().translate([cx,cy]).scale(r).rotate([24,-17,-10]);
  const trazado=geoPath(proyeccion);
  const acento=oscuro?'#f3637a':'#a31938';
  lz.defs.push(
    `<radialGradient id="oceano" cx=".3" cy=".25" r=".8"><stop stop-color="${oscuro?'#334555':'#f9fcff'}"/><stop offset=".65" stop-color="${oscuro?'#15202d':'#dbe7ee'}"/><stop offset="1" stop-color="${oscuro?'#080c14':'#809aaa'}"/></radialGradient>`,
    `<radialGradient id="noche" cx=".28" cy=".25" r=".8"><stop offset=".35" stop-color="#03050b" stop-opacity="0"/><stop offset=".8" stop-color="#03050b" stop-opacity=".2"/><stop offset="1" stop-color="#03050b" stop-opacity=".75"/></radialGradient>`,
    `<radialGradient id="atmosfera"><stop offset=".8" stop-color="${acento}" stop-opacity="0"/><stop offset=".94" stop-color="${acento}" stop-opacity=".13"/><stop offset="1" stop-color="${acento}" stop-opacity="0"/></radialGradient>`);
  lz.css.push('@keyframes baliza{0%,100%{opacity:.35}50%{opacity:1}}.baliza{animation:baliza 4s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.baliza{animation:none}}');
  lz.raw(`<ellipse cx="226" cy="452" rx="122" ry="12" fill="${t.fondo}" opacity=".8"/><circle cx="${cx}" cy="${cy}" r="175" fill="url(#atmosfera)"/>`);
  lz.raw(`<ellipse cx="${cx}" cy="${cy}" rx="192" ry="63" transform="rotate(-24 ${cx} ${cy})" fill="none" stroke="${t.tenue}" stroke-dasharray="2 7" opacity=".5"/>`);
  lz.raw(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#oceano)" stroke="${t.suave}" stroke-opacity=".55"/>`);
  lz.raw(`<path d="${trazado(tierra)}" fill="${oscuro?'#566773':'#b1c2c8'}" stroke="${oscuro?'#8c9ca4':'#6f8995'}" stroke-width=".55" fill-opacity=".75"/>`);
  lz.raw(`<path d="${trazado(geoGraticule10())}" fill="none" stroke="${oscuro?'#94a3ad':'#526d80'}" stroke-opacity=".2" stroke-width=".55"/>`);
  lz.raw(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#noche)"/>`);
  // Disposición de Fibonacci: cada fecha ocupa un punto de la cara visible.
  // Son posiciones simbólicas del calendario, nunca ubicaciones de personas.
  const max=Math.max(1,...dias.map(d=>d.n));
  dias.forEach((d,i)=>{
    const a=i*Math.PI*(3-Math.sqrt(5)),rho=Math.sqrt((i+.5)/dias.length)*.94;
    const x=Math.cos(a)*rho,y=Math.sin(a)*rho;
    const px=cx+x*r,py=cy+y*r;
    if(!d.n) {
      lz.raw(`<circle cx="${f1(px)}" cy="${f1(py)}" r=".85" fill="${t.suave}" opacity=".25"/>`);
      return;
    }
    const altura=8+Math.sqrt(d.n/max)*22;
    const ex=px+x*altura,ey=py+y*altura-7*Math.sqrt(1-rho*rho);
    lz.raw(`<g><title>${esc(d.fecha)} · ${d.n} contribuciones</title><circle cx="${f1(px)}" cy="${f1(py)}" r="3" fill="${acento}" opacity=".2"/><path d="M${f1(px)} ${f1(py)}L${f1(ex)} ${f1(ey)}" stroke="${acento}" stroke-width="1.3" opacity=".8"/><circle cx="${f1(ex)}" cy="${f1(ey)}" r="${f1(1.7+Math.sqrt(d.n/max)*1.6)}" fill="${acento}"/><circle cx="${f1(ex-.5)}" cy="${f1(ey-.5)}" r=".8" fill="${t.tinta}"/></g>`);
  });
  lz.raw(`<circle class="baliza" cx="393" cy="222" r="4" fill="${acento}"/><path d="M375 157h20v20M45 395v20h20" fill="none" stroke="${t.suave}" stroke-opacity=".4"/>`);
  lz.raw(`<rect x="96" y="430" width="248" height="51" rx="12" fill="${t.fondo}" stroke="${t.linea}"/>`);
  lz.raw(lz.texto(114,464,String(total),'cifra'));
  lz.raw(lz.texto(179,451,'contribuciones','pequeno-fuerte'));
  lz.raw(lz.texto(179,468,'últimos 12 meses','mono-pequeno','suave'));
  lz.raw(lz.texto(220,496,'Puntos = días · posiciones simbólicas','mono-pequeno','suave',{anchor:'middle'}));
}
