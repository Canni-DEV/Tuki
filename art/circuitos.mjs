// Resolve installed devices and resting cable geometry with the same code as the game.
import { build } from 'esbuild'
import { createRequire } from 'node:module'
const source = `
import { niveles } from './src/levels'
import { initPhysics } from './src/simulation'
import { SuperficiesCable, borne, radioCable } from './src/cables'
import { pieceAsset } from './src/types'
import { assemblies, partRotation } from './src/shapes'
import { vector, yaw } from './src/geometry'
export async function circuitos() {
  await initPhysics()
  return Object.fromEntries(niveles.filter(n => n.instalacion).map(n => {
    const s = new SuperficiesCable(n, [])
    const partes = n.instalacion.dispositivos.flatMap(p => assemblies[pieceAsset(p.tipo)].map(part => {
      const q = yaw(p.giroY)
      return { asset:part.asset, p:vector(part.at).applyQuaternion(q).add(vector(p.posicion)).toArray(),
        q:q.multiply(partRotation(part)).toArray() }
    }))
    return [n.id,{ partes, bornes:n.instalacion.dispositivos.map(p => borne(p).punto.toArray()), radio:radioCable,
      cables:n.instalacion.conexiones.flatMap(c => s.trazar(c).map(line => line.map(v => v.toArray()))) }]
  }))
}`
const result = await build({ stdin:{contents:source,resolveDir:process.cwd()}, platform:'node', bundle:true, packages:'external', format:'cjs', write:false })
const mod = {exports:{}}
new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,createRequire(import.meta.url))
console.log(JSON.stringify(await mod.exports.circuitos()))
