import {test,expect,type Page} from './entorno'
import recta from '../../src/data/recta.json' with {type:'json'}
import puerta from '../../src/data/puerta.json' with {type:'json'}
import fila from '../fixtures/recta.json' with {type:'json'}
import recorrido from '../fixtures/puerta.json' with {type:'json'}
import {inventario,perfil, type PiezaColocada} from '../../src/types'
import type {DocumentoDesafio} from '../../src/desafios'
import {dispositivos} from '../../src/dispositivos'
import {observarVictoria} from './observar-victoria'

async function biblioteca(page:Page){
  await page.addInitScript(()=>window.tukiPrueba.sembrar({completados:['recta'],audio:false,movimiento:'reducido'}))
  await page.goto('./?revision')
  await page.getByRole('button',{name:'Taller libre',exact:true}).click()
}
function reto(cableado=false){
  const n=cableado?puerta:recta,a=cableado?recorrido:fila
  const stock=inventario()
  for(const p of a.armado.piezas as PiezaColocada[])stock[p.tipo]++
  const d:DocumentoDesafio={esquema:'tuki',tipo:'desafio',version:1,id:crypto.randomUUID(),revision:1,estado:'borrador',nombre:'Desafío de prueba',
    motivo:'Ordenar los útiles y completar el recorrido.',formatoMesa:'mediana',perfilFisico:perfil.id,catalogo:'escenario-1',
    ordenFisico:'geometria',empujon:{pieza:'inicio',impulsoLocal:[0,0,.003],puntoLocal:[0,.04,0]},
    instalados:structuredClone(n.objetos) as PiezaColocada[],inventario:stock,permiteCableado:false,
    conexionesInstaladas:structuredClone(cableado?puerta.instalacion.conexiones:[]) as DocumentoDesafio['conexionesInstaladas'],secuencias:[],
    solucion:{piezas:structuredClone(a.armado.piezas) as PiezaColocada[],conexiones:[]}}
  if(cableado){
    d.instalados.push(...d.solucion.piezas);d.solucion.piezas=[];d.inventario=inventario();d.permiteCableado=true
    d.solucion.conexiones=d.conexionesInstaladas.map(({mando,receptor})=>({mando,receptor}));d.conexionesInstaladas=[]
  }
  return d
}
async function importar(page:Page,d:unknown){
  await page.locator('#archivo-mesa').setInputFiles({name:'prueba.tuki-desafio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))})
}

test('Mis desafíos mantiene texto legible en ambos temas, vacío y con contenido',async({page},info)=>{
  await biblioteca(page)
  const panel=page.getByRole('region',{name:'Mis desafíos'})
  for(const contenido of ['vacio','guardado']){
    if(contenido==='guardado'){
      await importar(page,reto())
      await expect(page.getByRole('heading',{name:'Crear desafío',exact:true})).toBeVisible()
      await page.getByRole('button',{name:'Cerrar',exact:true}).click()
    }
    for(const [width,height] of [[1366,768],[390,844]]){
      await page.setViewportSize({width,height})
      for(const tema of ['oscuro','claro']){
        await page.getByRole('button',{name:'Preferencias',exact:true}).click()
        await page.getByLabel('Apariencia').selectOption(tema)
        await page.getByRole('button',{name:'Cerrar',exact:true}).click()
        await expect(panel).toBeInViewport({ratio:1})
        await expect(panel).toContainText(contenido==='vacio'?'Podés crear un desafío':'Desafío de prueba')
        const contrastes=await panel.evaluate(el=>{
          const luminancia=(color:string)=>{
            const rgb=color.match(/[\d.]+/g)!.slice(0,3).map(v=>Number(v)/255)
              .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
            return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
          }
          const fondo=luminancia(getComputedStyle(el).backgroundColor)
          return [...el.querySelectorAll('h2,h3,p,button')].map(n=>{
            const tinta=luminancia(getComputedStyle(n).color)
            return {texto:n.textContent,contraste:(Math.max(fondo,tinta)+.05)/(Math.min(fondo,tinta)+.05)}
          })
        })
        for(const c of contrastes)expect(c.contraste,`${tema}, ${width}px, ${c.texto}`).toBeGreaterThanOrEqual(4.5)
        await page.screenshot({path:info.outputPath(`biblioteca-${contenido}-${tema}-${width}.png`)})
      }
    }
  }
})

test('certifica, exporta y conserva un borrador; cambiar reglas invalida la certificación',async({page})=>{
  await biblioteca(page);await importar(page,reto())
  await expect(page.getByRole('heading',{name:'Crear desafío',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Certificar solución',exact:true}).click()
  await expect(page.locator('.author-status')).toContainText('Solución certificada en tres intentos')
  await page.getByLabel('El jugador puede cablear').check()
  await page.getByRole('button',{name:'Guardar borrador',exact:true}).click()
  await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  await page.reload();await page.getByRole('button',{name:'Taller libre',exact:true}).click()
  const lista=page.getByRole('region',{name:'Mis desafíos'})
  await expect(lista).toContainText('Borrador')
  await expect(lista.getByRole('button',{name:'Ver solución'})).toHaveCount(0)
  await lista.getByRole('button',{name:'Editar desafío'}).click()
  await expect(page.getByLabel('El jugador puede cablear')).toBeChecked()
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar archivo'}).click()
  expect((await download).suggestedFilename()).toMatch(/\.tuki-desafio\.json$/)
})

test('importar durante la actualización de la biblioteca conserva el archivo seleccionado', async ({page}) => {
  await biblioteca(page)
  await page.getByRole('button', {name:'Preferencias', exact:true}).click()
  await page.evaluate(() => {
    const prototipo = Object.getPrototypeOf(window.tukiRevision.mesas())
    const abrir = prototipo.abrir
    prototipo.abrir = async function () {
      prototipo.abrir = abrir
      document.documentElement.dataset.actualizandoBiblioteca = 'true'
      await new Promise<void>(resolve => window.addEventListener('continuar-biblioteca', () => resolve(), {once:true}))
      return abrir.call(this)
    }
  })
  await page.getByRole('button', {name:'Cerrar', exact:true}).click()
  await expect(page.locator('html')).toHaveAttribute('data-actualizando-biblioteca', 'true')
  await importar(page, reto())
  await page.evaluate(() => window.dispatchEvent(new Event('continuar-biblioteca')))
  await expect(page.getByRole('heading', {name:'Crear desafío', exact:true})).toBeVisible()
  await expect(page.getByLabel('Nombre', {exact:true})).toHaveValue('Desafío de prueba')
})

test('revalida un desafío de cableado, permite conectarlo sin desbloqueos y separa su progreso',async({page})=>{
  await observarVictoria(page)
  await biblioteca(page);const d=reto(true)
  await page.getByRole('button',{name:'Preferencias',exact:true}).click()
  await page.getByLabel('Movimiento de la interfaz').selectOption('completo')
  await page.getByLabel('Sonido',{exact:true}).check()
  await page.getByRole('button',{name:'Cerrar',exact:true}).click()
  // The importer must recompute this intentionally untrusted certificate.
  d.estado='certificado';d.certificacion={huella:'0'.repeat(64),pasos:1,repeticiones:3,catalogo:d.catalogo,perfilFisico:perfil.id}
  await importar(page,d)
  await expect(page.getByRole('button',{name:'Empujar',exact:true})).toBeEnabled()
  expect((await page.evaluate(()=>window.tukiQA.estado())).armado.piezas).toHaveLength(0)
  await page.getByRole('button',{name:'Vista superior'}).click()
  await page.getByRole('button',{name:'Conectar / desconectar',exact:true}).click()
  const c=d.solucion.conexiones[0]
  for(const id of [c.mando,c.receptor]){
    const obj=d.instalados.find(p=>p.id===id)!,[x,y,z]=dispositivos[obj.tipo]!.borne[0],g=obj.giroY*Math.PI/180
    const p=[obj.posicion[0]+x*Math.cos(g)+z*Math.sin(g),obj.posicion[1]+y,obj.posicion[2]-x*Math.sin(g)+z*Math.cos(g)]
    const q=await page.evaluate(p=>window.tukiQA.proyectar(p),p)
    await page.mouse.click(q.x,q.y)
  }
  await expect.poll(()=>page.evaluate(()=>window.tukiQA.estado().armado.conexiones)).toEqual([c])
  await page.getByRole('button',{name:'Empujar',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Resolviste Desafío de prueba',exact:true})).toBeVisible()
  const primera=await page.evaluate(()=>window.efectoVictoria())
  expect(primera.dibujos[0]).toMatchObject({tiempo:0,cantidad:10})
  expect(primera.frases.map(f=>f.desde)).toEqual([0])
  expect(await page.evaluate(()=>window.tukiPrueba.progreso())).toEqual(['recta'])
  await page.getByRole('button',{name:'Repetir',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Resolviste Desafío de prueba',exact:true})).toBeVisible()
  const repetida=await page.evaluate(()=>window.efectoVictoria())
  expect(repetida.dibujos.filter(d=>d.tiempo===0)).toHaveLength(1)
  expect(repetida.frases.map(f=>f.desde)).toEqual([0,.48])
  await page.getByRole('button',{name:'Mis desafíos',exact:true}).click()
  await expect(page.getByRole('region',{name:'Mis desafíos'}).getByRole('button',{name:'Ver solución'})).toBeVisible()
  await page.reload()
  await page.getByRole('button',{name:'Taller libre',exact:true}).click()
  await page.getByRole('region',{name:'Mis desafíos'}).getByRole('button',{name:'Jugar',exact:true}).click()
  await page.getByRole('button',{name:'Empujar',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Resolviste Desafío de prueba',exact:true})).toBeVisible()
  expect((await page.evaluate(()=>window.efectoVictoria())).dibujos).toHaveLength(0)
})

test('copia un nivel completado al taller con su escena y sin la referencia',async({page})=>{
  await biblioteca(page)
  await page.evaluate(()=>window.tukiQA.cargar('recta'))
  await page.getByRole('button',{name:'Más acciones',exact:true}).click()
  await page.getByRole('button',{name:'Copiar al taller',exact:true}).click()
  await expect(page.getByRole('button',{name:'Volver a mis mesas',exact:true})).toBeVisible()
  expect((await page.evaluate(()=>window.tukiQA.estado())).armado.piezas.map(p=>p.id).sort()).toEqual(['inicio','meta'])
})

test('ignora las bibliotecas antiguas y deja intactos sus documentos', async ({page}) => {
  await page.addInitScript(() => window.tukiPrueba.sembrar({completados:['recta'],audio:false,movimiento:'reducido'}))
  await page.goto('./?revision')
  await page.evaluate(() => new Promise<void>((resolve,reject) => {
    const req=indexedDB.open('tuki.taller.dispositivos.v5',1)
    req.onupgradeneeded=()=>req.result.createObjectStore('mesas',{keyPath:'id'})
    req.onerror=()=>reject(req.error)
    req.onsuccess=()=>{const db=req.result,tx=db.transaction('mesas','readwrite');tx.objectStore('mesas').put({id:'anterior',mesa:{version:5,nombre:'Mesa anterior'}});tx.oncomplete=()=>{db.close();resolve()}}
  }))
  await page.getByRole('button',{name:'Taller libre',exact:true}).click()
  await expect(page.getByRole('button',{name:'Nueva mesa',exact:true})).toBeVisible()
  await expect(page.locator('[data-creacion]')).toHaveCount(0)
  const anterior = await page.evaluate(() => new Promise<unknown>((resolve,reject) => {
    const req=indexedDB.open('tuki.taller.dispositivos.v5',1)
    req.onerror=()=>reject(req.error)
    req.onsuccess=()=>{const db=req.result,get=db.transaction('mesas').objectStore('mesas').get('anterior');get.onsuccess=()=>{db.close();resolve(get.result)}}
  }))
  expect(anterior).toMatchObject({id:'anterior',mesa:{version:5,nombre:'Mesa anterior'}})
})

test('cerrar la verificación cancela el worker y conserva el borrador',async({page})=>{
  await biblioteca(page);await importar(page,reto())
  await expect(page.getByRole('button',{name:'Certificar solución',exact:true})).toBeVisible()
  await page.evaluate(()=>{
    document.querySelector<HTMLButtonElement>('[data-author=certificar]')!.click()
    document.querySelector<HTMLDialogElement>('dialog[open]')!.close()
  })
  await expect(page.locator('dialog[open]')).toHaveCount(0)
  await page.getByRole('region',{name:'Mis desafíos'}).getByRole('button',{name:'Editar desafío'}).click()
  await expect(page.locator('.author-status')).toContainText('Borrador')
})
