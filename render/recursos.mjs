// Deterministic procedural assets and pinned CC0 walnut maps. No source GLBs are changed.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'
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
function wood(n) {
  const height = new Float32Array(n * n), color = Buffer.alloc(n * n * 3), rough = Buffer.alloc(n * n * 3), normal = Buffer.alloc(n * n * 3)
  const tau = Math.PI * 2
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const u=x/n,v=y/n,warp=(noise(u,v,4,2)-.5)*.045+(noise(u,v,16,4)-.5)*.008
    const phase=(u+warp)*43+noise(u,v,8,2)*2
    const ring=Math.pow(.5+.5*Math.sin(tau*phase),10)
    const fibres=noise(u+warp,v,256,24),pores=Math.pow(Math.max(0,(fibres-.52)*2),2)
    const broad=noise(u,v,12,2)-.5,fine=hash(x,y)-.5
    const i=y*n+x,shade=broad*23-ring*21-pores*29+fine*3
    height[i]=-ring*.19-pores*.42+fine*.012
    color[i*3]=clamp(196+shade);color[i*3+1]=clamp(149+shade*.95);color[i*3+2]=clamp(94+shade*.8)
    rough.fill(clamp(157+ring*17+pores*31+fine*7),i*3,i*3+3)
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (height[y*n+(x+1)%n] - height[y*n+(x+n-1)%n]) * 1.4
    const dy = (height[((y+1)%n)*n+x] - height[((y+n-1)%n)*n+x]) * 1.4
    const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 3
    normal[i] = 127.5 - dx / l * 127.5; normal[i+1] = 127.5 - dy / l * 127.5; normal[i+2] = 127.5 + 127.5 / l
  }
  return { color, rough, normal }
}
function environment(width, dark) {
  const height = width / 2, data = Buffer.alloc(width * height * 4), tau = 2 * Math.PI
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const phi = (x / width - .5) * tau, theta = y / height * Math.PI
    const px = Math.sin(theta)*Math.sin(phi), py = Math.cos(theta), pz = Math.sin(theta)*Math.cos(phi)
    const window = Math.exp(-Math.pow((px + .52)/.25, 8) - Math.pow((py - .54)/.32, 8) - Math.pow((pz + .52)/.48, 8))
    const lamp = Math.exp(-((px+.45)**2 + (py-.69)**2 + (pz+.56)**2)/.028)
    const fill = Math.max(0, py) * (dark ? .10 : .32), light = dark ? lamp * 16 : window * 7
    const rgb = dark ? [.045+fill+light, .034+fill*.92+light*.60, .028+fill+light*.28] : [.30+fill+light, .32+fill+light*.97, .34+fill+light*.90]
    const e = Math.ceil(Math.log2(Math.max(...rgb))), scale = 256 / 2**e, i = (y*width+x)*4
    for (let c=0;c<3;c++) data[i+c] = clamp(Math.floor(rgb[c]*scale)); data[i+3] = e+128
  }
  // Flat RGBE is supported by HDRLoader; PNG and HTTP compression handle maps separately.
  return Buffer.concat([Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`), data])
}
function weave(n) {
  const pixels=Buffer.alloc(n*n*3),period=n/128
  for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
    const parity=(Math.floor(x/period)+Math.floor(y/period))%2
    const dx=Math.sin(x/period*Math.PI*2)*(parity?.16:.05),dy=Math.sin(y/period*Math.PI*2)*(parity?.05:.16)
    const l=Math.hypot(dx,dy,1),i=(y*n+x)*3
    pixels[i]=127.5+dx/l*127.5;pixels[i+1]=127.5+dy/l*127.5;pixels[i+2]=127.5+127.5/l
  }
  return pixels
}
export async function bake() {
  await mkdir(out, { recursive: true }); const files = []
  for (const [quality, n] of [['equilibrada',1024],['alta',2048]]) {
    const maps = wood(n)
    for (const [name, rgb] of Object.entries(maps)) {
      const file = `${quality}-madera-${name}.png`, buffer = png(n, rgb)
      await writeFile(new URL(file, out), buffer); files.push({ file, quality, bytes: buffer.length })
    }
    const detailFile=`${quality}-tejido-normal.png`,detail=png(n,weave(n))
    await writeFile(new URL(detailFile,out),detail);files.push({file:detailFile,quality,bytes:detail.length})
    for (const dark of [false, true]) {
      const file = `${quality}-${dark?'noche':'dia'}.hdr`, buffer = environment(n/2, dark)
      await writeFile(new URL(file, out), buffer); files.push({ file, quality, bytes: buffer.length })
    }
  }
  // Local, verbatim upstream files: builds work offline and reject changed source maps.
  const source = new URL('./assets/natural-walnut-veneer/', import.meta.url)
  const walnut = JSON.parse(await readFile(new URL('source.json', source), 'utf8'))
  for (const entry of walnut.files) {
    const buffer = await readFile(new URL(entry.file, source))
    if (createHash('sha256').update(buffer).digest('hex') !== entry.sha256) throw new Error(`Mapa de nogal alterado: ${entry.file}`)
    const file = `nogal-${entry.file}`
    await writeFile(new URL(file, out), buffer); files.push({file, quality:'shared', bytes:buffer.length})
  }
  await writeFile(new URL('nogal-source.json', out), JSON.stringify(walnut, null, 2) + '\n')
  const balanced = files.filter(f=>f.quality!=='alta').reduce((s,f)=>s+f.bytes,0), total = files.reduce((s,f)=>s+f.bytes,0)
  if (balanced > 12*2**20 || total > 24*2**20) throw new Error(`Presupuesto de recursos excedido: ${balanced}/${total}`)
  await writeFile(new URL('manifest.json', out), JSON.stringify({ version:2, origin:'Tuki procedural + Poly Haven Natural Walnut Veneer (CC0)', balanced, total, files }, null, 2))
}
