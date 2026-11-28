import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// All evidence comes from the adjacent PNG files. Reviewing a second profile
// or projection works offline and does not require rerunning the GPU capture.
export function escribirGaleria(folder, detalle) {
  const title=detalle?'Fichas y materiales del taller':'Las mesas de Tuki'
  const vistas=detalle?[['frente','Dominós de frente'],['rasante','A ras de la ficha'],['gres-metal','Gres y acero'],['tela-papel','Encuadernación y papel']]:
    [['recta','La recta'],['recta-caida','La recta durante la caída'],['vuelta','A la vuelta'],['mate','La mesa del mate']]
  const sections=[]
  for(const tema of ['claro','oscuro'])for(const [vista,label] of vistas) {
    const [level,pose]=vista.split('-')
    const pares=['antes','despues'].map((revision,i)=>{
      const archivo=detalle?[revision,'PERFIL',tema,'CAMARA',vista]:[revision,'PERFIL',level,tema,'CAMARA',...(pose?[pose]:[])]
      const template=archivo.join('-')+'.png',caption=i?'Después':'Antes'
      return '<figure><figcaption>'+caption+'</figcaption><img loading="lazy" alt="'+caption+' · '+label+' · '+tema+'" data-template="'+template+'" src="'+template.replace('PERFIL','alta').replace('CAMARA','perspectiva')+'"></figure>'
    })
    sections.push('<h2>'+label+' · '+tema+'</h2><section>'+pares.join('')+'</section>')
  }
  const page=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${title}</title><style>
body{font:16px system-ui;background:#f5f1e7;color:#19332f;margin:2vw}
header{display:flex;flex-wrap:wrap;gap:1rem}select{font:inherit}
section{display:flex;gap:.7rem}figure{margin:0;min-width:0;flex:1}img{width:100%}figcaption{padding:.5em 0}
</style><h1>${title}</h1>${detalle?'<p>En las tomas de dominós, cada columna muestra una variante y la fila inferior muestra el reverso.</p>':''}
<header><label>Perfil <select id="perfil"><option value="alta">Alta</option><option value="equilibrada">Equilibrada</option></select></label>
<label>Cámara <select id="camara"><option value="perspectiva">Perspectiva</option><option value="ortografica">Ortográfica</option></select></label></header>
${sections.join('')}
<script>document.addEventListener('change',()=>{for(const img of document.querySelectorAll('img'))img.src=img.dataset.template.replace('PERFIL',document.querySelector('#perfil').value).replace('CAMARA',document.querySelector('#camara').value)})</script></html>`
  return writeFile(join(folder,'comparacion.html'),page)
}
