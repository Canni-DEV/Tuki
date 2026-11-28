import { NormalRGPacking, type Texture } from 'three'
import type { MeshPhysicalNodeMaterial, Node } from 'three/webgpu'
import { abs, attribute, float, materialColor, mix, normalGeometry, normalMap, normalViewGeometry, positionView, smoothstep, texture, uv, vec2 } from 'three/tsl'

export const superficies = ['papel','carton','tejido','gres','metal','laca','corcho'] as const
type Superficie = typeof superficies[number]
const response: Record<Superficie, [roughness:number, normalStrength:number]> = {
  papel: [.89, .65],
  carton: [.94, .95],
  tejido: [.94, .75],
  gres: [.82, 1],
  metal: [.28, .58],
  laca: [.36, .55],
  corcho: [.95, 1.15],
}

function superficie(asset: string, name: string): Superficie | undefined {
  if (/^(shoebox|parcel|shipping|teabox)/.test(asset)) return /Marfil|Sombra grabada|Canto mandarina/.test(name) ? 'papel' : 'carton'
  if (/Tela/.test(name)) return 'tejido'
  if (/Papel|cuadernillo/.test(name)) return 'papel'
  if (/Gres|gres/.test(name)) return 'gres'
  if (/Acero|Latón/.test(name)) return 'metal'
  if (/Corcho|Calabaza|Yerba/.test(name)) return 'corcho'
  if (/Petróleo|Esmalte|esmalte|Bermellón|Canto mandarina/.test(name)) return 'laca'
}

// Physical length of the repeat is 16 mm with the exported 80 × 40 mm UVs.
// Mipmaps average the signed slopes before the normal is reconstructed.
export function acabado(m: MeshPhysicalNodeMaterial, asset:string, name:string, maps:ReadonlyMap<string,Texture>) {
  const kind = superficie(asset,name)
  if (!kind) return
  // Radial machining marks on turned parts cross the planar UV charts in the
  // GLB. Use continuous object-space coordinates on the side and the lid.
  const turned = kind === 'metal' && ['kettle','mate','tin'].includes(asset)
  const local = attribute('position','vec3').toVarying()
  const coords = turned
    ? vec2(local.x.add(local.z.mul(.5)),local.y.add(local.xz.length().mul(.8))).div(.016)
    : uv().mul(vec2(5,2.5))
  const sample = texture(maps.get(kind)!, coords)
  const brass = name.includes('Latón')
  let [roughness,strength] = response[kind]
  if (name.includes('crema moteado')) { roughness=.29; strength=.48 }
  if (brass) roughness=.43
  if (name.includes('Calabaza')) {
    // The library also uses the gourd pigment for the pocketbook's binding.
    roughness = asset==='mate' ? .46 : .66
    strength = asset==='mate' ? .41 : .72
  }
  let wear: Node<'float'> = float(1)
  if (asset==='domino' && kind==='laca') {
    // Use the original vertex coordinates, before the instance transform.
    const edge = float(.0125).sub(abs(local.x)).min(float(.025).sub(abs(local.y.sub(.025))))
    wear = mix(float(.32),float(1.45),smoothstep(0,.0022,edge).oneMinus())
  }
  if (turned) {
    // Surface-gradient bump in metres. No chart tangent is shared between
    // triangles, so the reflected window remains continuous around the steel.
    const n = normalViewGeometry
    const dx = positionView.dFdx(), dy = positionView.dFdy()
    const tx = dy.cross(n), ty = n.cross(dx), det = dx.dot(tx)
    const height = sample.b.mul(.000025)
    const gradient = tx.mul(height.dFdx()).add(ty.mul(height.dFdy()))
    m.normalNode = n.mul(det.abs().max(1e-12)).sub(gradient.mul(det.sign())).normalize()
  } else {
    const detail = normalMap(sample,vec2(wear.mul(strength)))
    detail.unpackNormalMode = NormalRGPacking
    m.normalNode = detail
  }
  // The small unresolved slopes also broaden the specular lobe at distance.
  const footprint = coords.mul(256).fwidth().length()
  m.roughnessNode = sample.b.sub(.78).mul(.6).add(roughness)
    .add(smoothstep(1,6,footprint).mul(.035)).add(wear.sub(1).mul(.07)).clamp(.12,1)
  if (kind==='papel' || kind==='carton' || kind==='tejido' || kind==='corcho') {
    let fibre = sample.b.sub(.78).mul(kind==='corcho' ? .85 : .45).add(1)
    if (kind==='papel' && /^(book|atlas|pocketbook|notebook)/.test(asset)) {
      const sheet = attribute('position','vec3').toVarying().y.div(.0011)
      const resolved = smoothstep(.18,.5,sheet.fwidth()).oneMinus()
      const edge = abs(normalGeometry.toVarying().y).oneMinus().clamp()
      const seam = sheet.mul(2*Math.PI).cos().max(0).pow(4)
      fibre = fibre.mul(float(1).sub(seam.mul(resolved).mul(edge).mul(.17)))
    }
    m.colorNode = materialColor.mul(fibre)
  }
  if (kind==='metal' && !turned) m.anisotropy = brass ? .22 : .30
}
