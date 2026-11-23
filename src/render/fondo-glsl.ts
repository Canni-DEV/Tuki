import { rgbLineal, type FondoVisual } from '../fondo'

export const uniformesFondo = () => ({
  fondoSuperior: {value: [0,0,0]}, fondoInferior: {value: [0,0,0]}, sombraFondo: {value: 0},
})
export function actualizarFondo(u: ReturnType<typeof uniformesFondo>, f: FondoVisual) {
  u.fondoSuperior.value=rgbLineal(f.superior);u.fondoInferior.value=rgbLineal(f.inferior);u.sombraFondo.value=f.sombra
}
const declaracion = `
uniform vec3 fondoSuperior;
uniform vec3 fondoInferior;
uniform float sombraFondo;
varying vec4 clipFondo;
vec3 colorFondo() {
  float y = .5 - .5 * clipFondo.y / clipFondo.w;
  return mix(fondoSuperior, fondoInferior, smoothstep(0., 1., y));
}`
export const verticeFondo = `varying vec4 clipFondo;
void main() { gl_Position = vec4(position.xy, 1., 1.); clipFondo = gl_Position; }`
export const fragmentoFondo = `${declaracion}
void main() { gl_FragColor=vec4(colorFondo(),1.);
  #include <colorspace_fragment>
}`
/** Version-independent shader hook, usable by both isolated WebGL revisions. */
export function prepararSuelo(shader: {vertexShader:string;fragmentShader:string;uniforms:Record<string,{value:unknown}>}, u: ReturnType<typeof uniformesFondo>) {
  Object.assign(shader.uniforms,u)
  shader.vertexShader='varying vec4 clipFondo;\n'+shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nclipFondo=gl_Position;')
  shader.fragmentShader=declaracion+'\n'+shader.fragmentShader.replace(
    'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
    'gl_FragColor = vec4(colorFondo() * (1. - sombraFondo * (1. - getShadowMask())), 1.);')
}
