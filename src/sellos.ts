import { CanvasTexture, Sprite, SpriteMaterial, SRGBColorSpace } from 'three'

export function crearSello(rol: 'inicio' | 'meta') {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 192
  const ctx = canvas.getContext('2d')!
  ctx.scale(2, 2)
  const esmalte = rol === 'inicio' ? '#194e49' : '#aa4d26'
  const marfil = '#fff1d4'
  ctx.beginPath()
  ctx.arc(48, 48, 46, 0, Math.PI * 2)
  ctx.fillStyle = esmalte
  ctx.fill()
  ctx.strokeStyle = marfil
  ctx.lineWidth = 2.5
  ctx.stroke()

  ctx.fillStyle = marfil
  if (rol === 'inicio') {
    ctx.fill(new Path2D('M22 42 H52 V30 L75 48 L52 66 V54 H22 Z'))
  } else {
    // Tilt the staff slightly and give the finish flag six contrasting checks.
    ctx.transform(1, -.1, -.18, 1, 35, 28)
    ctx.fillRect(0, 0, 36, 24)
    ctx.fillStyle = esmalte
    ctx.fillRect(12, 0, 12, 12)
    ctx.fillRect(0, 12, 12, 12)
    ctx.fillRect(24, 12, 12, 12)
    ctx.strokeRect(0, 0, 36, 24)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 43)
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.stroke()
  }

  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  const sprite = new Sprite(new SpriteMaterial({
    map, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  }))
  sprite.renderOrder = 10
  return sprite
}
