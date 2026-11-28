// Offline build of photographic materials and tileable manufacturing detail.
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
import { entorno } from './fotorealista/entornos.mjs'
const out = new URL('../public/fotorealista/recursos/', import.meta.url)
const clamp = (n, a = 0, b = 255) => Math.max(a, Math.min(b, n))
function hash(x, y) { let h = Math.imul(x ^ 59347, 374761393) ^ Math.imul(y ^ 19271, 668265263); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967295 }
function noise(u,v,nx,ny) {
  const x=u*nx,y=v*ny,ix=Math.floor(x),iy=Math.floor(y)
  const fx=x-ix,fy=y-iy,s=fx*fx*(3-2*fx),t=fy*fy*(3-2*fy)
  const h=(a,b)=>hash((a%nx+nx)%nx,(b%ny+ny)%ny)
  return (h(ix,iy)*(1-s)+h(ix+1,iy)*s)*(1-t)+(h(ix,iy+1)*(1-s)+h(ix+1,iy+1)*s)*t
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1; return n >>> 0 })
function chunk(type, data) {
  const name = Buffer.from(type), all = Buffer.concat([name, data]); let crc = 0xffffffff
  for (const v of all) crc = crcTable[(crc ^ v) & 255] ^ crc >>> 8
  const result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); all.copy(result, 4); result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4); return result
}
function png(n, rgb) {
  const header = Buffer.alloc(13); header.writeUInt32BE(n); header.writeUInt32BE(n, 4); header[8] = 8; header[9] = 2
  const raw = Buffer.alloc((n * 3 + 1) * n)
  for (let y = 0; y < n; y++) raw.set(rgb.subarray(y * n * 3, (y + 1) * n * 3), y * (n * 3 + 1) + 1)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
// Each tile covers 16 mm. RG stores the tangent normal, B the local roughness.
const surfaces = {
  papel(u,v) { return .34*noise(u,v,90,18)+.22*noise(u,v,26,68)+.14*noise(u,v,18,15) },
  carton(u,v) { return .55*noise(u,v,42,28)+.21*noise(u,v,115,95)+.12*noise(u,v,12,9) },
  tejido(u,v) {
    const a=2*Math.PI*32*u,b=2*Math.PI*32*v
    const over=.5+.5*Math.cos(a*.5)*Math.cos(b*.5)
    return .75*(over*Math.cos(a)+(1-over)*Math.cos(b))+.08*noise(u,v,120,120)
  },
  gres(u,v) { return .24*noise(u,v,38,38)-1.3*Math.max(0,.46-noise(u,v,65,65)) },
  metal(u,v) { return .45*noise(u,v,12,115)+.2*noise(u,v,5,72)+.06*noise(u,v,64,60) },
  laca(u,v) { return .18*noise(u,v,48,48)-.66*Math.max(0,noise(u,v,8,116)-.7) },
  corcho(u,v) { return .47*noise(u,v,18,18)-.9*Math.max(0,.55-noise(u,v,42,42)) }
}
function detailMap(surface) {
  const n=256, field=new Float32Array(n*n), pixels=Buffer.alloc(n*n*3)
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) field[y*n+x]=surface(x/n,y/n)
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
    const dx=field[y*n+(x+n-1)%n]-field[y*n+(x+1)%n]
    const dy=field[((y+1)%n)*n+x]-field[((y+n-1)%n)*n+x]
    const length=Math.hypot(dx,dy,1),i=y*n+x
    pixels[i*3]=Math.round(127.5*(1+dx/length))
    pixels[i*3+1]=Math.round(127.5*(1+dy/length))
    pixels[i*3+2]=clamp(190+65*field[i])
  }
  return png(n,pixels)
}

export async function bake() {
  await mkdir(out, {recursive:true})
  const files=[]
  async function emit(file, quality, buffer) {
    await writeFile(new URL(file,out), buffer)
    files.push({file,quality,bytes:buffer.length})
  }
  async function sources(folder) {
    const base = new URL('./assets/'+folder+'/', import.meta.url)
    const manifest=JSON.parse(await readFile(new URL('source.json',base),'utf8'))
    const maps=new Map()
    for(const entry of manifest.files) {
      const buffer=await readFile(new URL(entry.file,base))
      if(createHash('sha256').update(buffer).digest('hex')!==entry.sha256) throw new Error('Recurso alterado: '+entry.file)
      maps.set(entry.file,buffer)
    }
    return {manifest,maps}
  }
  const walnut=await sources('natural-walnut-veneer'), workshop=await sources('taller')
  for(const [file,buffer] of walnut.maps) await emit('nogal-'+file,'shared',buffer)
  for(const [file,buffer] of workshop.maps) if(file.endsWith('.jpg')) {
    const quality=file.includes('2k')?'alta':file.includes('1k')?'equilibrada':'shared'
    await emit(file,quality,buffer)
  }
  for(const [name,surface] of Object.entries(surfaces)) await emit('detalle-'+name+'.png','shared',detailMap(surface))
  for(const [quality,width] of [['alta',1024],['equilibrada',512]]) {
    await emit(quality+'-dia.hdr',quality,entorno(workshop.maps.get('ventana.hdr'),width,false))
    await emit(quality+'-noche.hdr',quality,entorno(workshop.maps.get('lampara.hdr'),width,true))
    // Vite copies this generated directory verbatim, including assets from older builds.
    for(const old of ['madera-color','madera-rough','madera-normal','tejido-normal']) {
      await unlink(new URL(quality+'-'+old+'.png',out)).catch(e=>{if(e.code!=='ENOENT')throw e})
    }
  }
  for(const [name,source] of [['nogal',walnut],['taller',workshop]])
    await writeFile(new URL(name+'-source.json',out), JSON.stringify(source.manifest,null,2)+'\n')
  const balanced=files.filter(f=>f.quality!=='alta').reduce((s,f)=>s+f.bytes,0),total=files.reduce((s,f)=>s+f.bytes,0)
  if(balanced>12*2**20||total>24*2**20) throw new Error('Presupuesto de recursos excedido: '+balanced+'/'+total)
  await writeFile(new URL('manifest.json',out),JSON.stringify({version:3,origin:'Tuki + Poly Haven (CC0)',balanced,total,files},null,2))
}
