import type { DepthTexture, LightShadow } from 'three'
import type { Node } from 'three/webgpu'
import { float, texture, vec2 } from 'three/tsl'

/** Fixed samples in shadow-map space: camera motion cannot rotate the filter noise. */
export function sombraEstable(radius: number, mapSize: number) {
  return ({depthTexture,shadowCoord,depthLayer}: {depthTexture:DepthTexture;shadowCoord:Node<'vec3'>;shadow:LightShadow;depthLayer:Node<'int'>}) => {
    let total:Node<'float'>=float(0)
    const count=24
    for(let i=0;i<count;i++) {
      const r=Math.sqrt((i+.5)/count)*radius/mapSize,angle=i*2.399963229728653
      let depth=texture(depthTexture,shadowCoord.xy.add(vec2(Math.cos(angle)*r,Math.sin(angle)*r)))
      if('isArrayTexture' in depthTexture && depthTexture.isArrayTexture)depth=depth.depth(depthLayer)
      // Comparison samplers return a scalar; r187's declaration retains vec4.
      total=total.add(depth.compare(shadowCoord.z) as unknown as Node<'float'>)
    }
    return total.div(count)
  }
}
