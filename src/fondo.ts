/** Display palette shared by CSS, r180 and the isolated r187 renderer. No Three objects. */
export interface FondoVisual { superior: number; inferior: number; sombra: number }
export const fondos: Readonly<Record<'claro' | 'oscuro', Readonly<FondoVisual>>> = {
  claro: { superior: 0xf4eee2, inferior: 0xe9dfcb, sombra: .45 },
  oscuro: { superior: 0x070f0e, inferior: 0x1b271d, sombra: .35 },
}
export const fondoVisual = (oscuro: boolean): FondoVisual => ({ ...fondos[oscuro ? 'oscuro' : 'claro'] })
export function rgbLineal(hex: number) {
  return [16,8,0].map(shift => {
    const c = ((hex >> shift) & 255)/255
    return c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4
  })
}
export function colorFondo(fondo: FondoVisual, y: number) {
  const t = Math.max(0,Math.min(1,y)), mezcla = t*t*(3-2*t)
  const a=rgbLineal(fondo.superior),b=rgbLineal(fondo.inferior)
  return a.map((v,i)=>v+(b[i]-v)*mezcla)
}
export function rgbPantalla(lineal: number[]) {
  return lineal.map(c=>Math.round(255*(c<=.0031308?12.92*c:1.055*c**(1/2.4)-.055)))
}
// Sample the same smoothstep in linear light. CSS interpolation between these
// close display-space samples stays within one 8-bit value of the shaders.
export function cssFondo(fondo: FondoVisual) {
  return 'linear-gradient(180deg, '+Array.from({length:33},(_,i)=>
    `rgb(${rgbPantalla(colorFondo(fondo,i/32)).join(' ')}) ${i*100/32}%`).join(', ')+')'
}
export const cssFondos = () => `:root{--fondo-escena:${cssFondo(fondos.claro)}}:root[data-apariencia="oscuro"]{--fondo-escena:${cssFondo(fondos.oscuro)}}`
