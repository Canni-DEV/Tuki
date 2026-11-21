import { chromium } from 'playwright'
import { readFile,writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
const level=JSON.parse(await readFile('src/data/recta.json','utf8'))
const fixture=JSON.parse(await readFile('qa/fixtures/recta.json','utf8'))
const document={esquema:'tuki',tipo:'desafio',version:1,id:randomUUID(),revision:1,estado:'certificado',nombre:'Prueba fotorealista',
  motivo:'Comprobar un nivel personalizado con el render activo.',formatoMesa:'mediana',perfilFisico:level.perfilFisico,catalogo:'escenario-1',
  ordenFisico:'geometria',empujon:level.empujon,instalados:level.objetos,inventario:{domino:fixture.armado.piezas.length},permiteCableado:false,
  conexionesInstaladas:[],secuencias:[],solucion:{piezas:fixture.armado.piezas,conexiones:[]},
  certificacion:{huella:'0'.repeat(64),pasos:1,repeticiones:3,catalogo:'escenario-1',perfilFisico:level.perfilFisico}}
const browser=await chromium.launch({executablePath:process.env.TUKI_CHROME??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,ignoreDefaultArgs:['--enable-unsafe-swiftshader']})
const report={browser:browser.version(),errors:[]}
let page
try {
  page=await browser.newPage({viewport:{width:1920,height:1080}})
  page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())})
  await page.addInitScript(()=>{localStorage.setItem('tuki.v1.campana.recta','true');localStorage.setItem('tuki.v1.preferencias.audio','false');localStorage.setItem('tuki.v1.preferencias.movimiento','"reducido"')})
  await page.goto(process.env.TUKI_BASE_URL??'http://127.0.0.1:4176/?revision');await page.waitForFunction(()=>!!window.tukiQA)
  await page.getByRole('button',{name:'Preferencias',exact:true}).click()
  await page.getByLabel('Calidad fotorealista',{exact:true}).selectOption('equilibrada');await page.getByLabel('Visuales',{exact:true}).selectOption('fotorealista')
  await page.waitForFunction(()=>window.tukiQA.render.fotorealista()?.active,null,{timeout:120000})
  await page.getByRole('button',{name:'Cerrar',exact:true}).click();await page.getByRole('button',{name:'Taller libre',exact:true}).click()
  // Let the library's asynchronous metadata refresh finish before selecting its input.
  await page.waitForTimeout(1000)
  await page.evaluate(()=>{window.renderNotices=[];new MutationObserver(()=>window.renderNotices.push(document.querySelector('#aviso')?.textContent)).observe(document.querySelector('#aviso'),{childList:true,subtree:true,characterData:true})})
  await page.locator('#archivo-mesa').setInputFiles({name:'foto.tuki-desafio.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))})
  await page.waitForFunction(()=>document.querySelector('[data-action=empujar]')||document.querySelector('#aviso.visible'),null,{timeout:45000})
  const problem=await page.evaluate(()=>document.querySelector('#aviso.visible')?.textContent)
  if(problem)throw new Error(problem)
  await page.getByRole('button',{name:'Vista superior',exact:true}).click()
  for(const piece of fixture.armado.piezas){
    await page.locator('#bandeja [data-tool=domino]').click()
    const position=await page.evaluate(p=>window.tukiQA.proyectar(p),piece.posicion)
    await page.mouse.click(position.x,position.y)
    await page.waitForFunction(()=>!window.tukiQA.estado().validando)
  }
  await page.getByRole('button',{name:'Empujar',exact:true}).click()
  await page.getByRole('heading',{name:'Resolviste Prueba fotorealista',exact:true}).waitFor({timeout:45000})
  report.result=await page.evaluate(()=>({game:window.tukiQA.estado(),render:window.tukiQA.render.fotorealista()}))
  if(!report.result.render.active)throw new Error('Se perdió el render durante el desafío')
  await page.screenshot({path:'.qa-local/fotorealista/desafio-personalizado.png'})
  if(report.errors.length)throw new Error(report.errors.join('\n'))
  console.log('Importación, certificación, jugada y victoria de desafío personalizado: OK')
}catch(error){report.failure=String(error);report.page=await page?.locator('body').innerText();report.notices=await page?.evaluate(()=>window.renderNotices);report.state=await page?.evaluate(()=>window.tukiQA.render.fotorealista());throw error}
finally{await browser.close();await writeFile('.qa-local/fotorealista/desafio.json',JSON.stringify(report,null,2))}
