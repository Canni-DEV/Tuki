import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { Espacio } from '../src/espacio'
import { cantidadPortada, dibujarPortada } from '../src/portada'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

function presentation() {
  vi.stubGlobal('document', { documentElement: { dataset: { reducido: 'false' } } })
  const portada = {}, fila = Array.from({ length: cantidadPortada }, () => new THREE.Group())
  dibujarPortada(fila, 0)
  // No GPU context is needed to exercise the real presentation clock and clip player.
  const space = Object.assign(Object.create(Espacio.prototype), {
    portada, actual: portada, fila, pausasAnimacion: new Set(), inicioPausa: 0,
    finCaida: false, sucia: true, renderer: { render: vi.fn() },
  }) as Espacio
  return { space, fila, pose: () => fila.map(p => [...p.position.toArray(), ...p.quaternion.toArray()]) }
}

describe('tiempo de presentación durante la preparación visual', () => {
  it('no consume la animación de entrada durante una carga larga', () => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const { space, pose } = presentation(), initial = pose()
    space.pausarAnimaciones(true)
    now = 20000; space.render(now)
    expect(pose()).toEqual(initial)
    expect(space.renderer.render).not.toHaveBeenCalled()
    space.pausarAnimaciones(false); space.render(now)
    expect(pose()).toEqual(initial)
    space.render(now + 1200)
    expect(pose()).not.toEqual(initial)
  })
  it('reanuda una entrada empezada sin saltarse su tiempo al cambiar de modo', () => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const { space, pose } = presentation()
    space.render(now); now = 1300; space.render(now)
    const before = pose()
    space.pausarAnimaciones(true); now = 21300; space.render(now)
    space.pausarAnimaciones(false); space.render(now)
    expect(pose()).toEqual(before)
    space.render(now + 1000); expect(pose()).not.toEqual(before)
  })
  it('cuenta una sola pausa cuando la carga y una pérdida de contexto se superponen', () => {
    let now = 100
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const { space, pose } = presentation()
    space.render(now); now = 1300; space.render(now)
    const before = pose()
    space.pausarAnimaciones(true)
    now = 2000; space.pausarAnimaciones(true, 'contexto')
    now = 5000; space.pausarAnimaciones(false); space.render(now)
    expect(pose()).toEqual(before)
    now = 8000; space.pausarAnimaciones(false, 'contexto'); space.render(now)
    expect(pose()).toEqual(before)
    space.render(now + 1000); expect(pose()).not.toEqual(before)
  })
})
