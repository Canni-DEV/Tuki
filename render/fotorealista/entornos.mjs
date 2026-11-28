import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { FloatType } from 'three'

// Keep the photographed room in linear light. Compress the lightbulb/window
// cores before PMREM: the shadow-casting key represents their direct energy.
export function entorno(buffer, width, night) {
  const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  const source = new HDRLoader().setDataType(FloatType).parse(bytes)
  const step = source.width / width, height = width / 2
  const pixels = Buffer.alloc(width * height * 4)
  const knee = night ? 24 : 14
  for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
    let r=0, g=0, b=0
    for (let j=0; j<step; j++) for (let k=0; k<step; k++) {
      const i = ((y*step+j)*source.width+x*step+k)*4
      const l = .2126*source.data[i]+.7152*source.data[i+1]+.0722*source.data[i+2]
      const gain = 1 / ((1+l/knee)*step*step)
      r += source.data[i]*gain; g += source.data[i+1]*gain; b += source.data[i+2]*gain
    }
    // Grade the photographed lamp in linear light so the walnut picks up amber
    // room reflections while the screen-space backdrop retains its own palette.
    if (night) { g *= .86; b *= .54 }
    const i=(y*width+x)*4, peak=Math.max(r,g,b)
    if (peak < 1e-30) continue
    const exponent=Math.floor(Math.log2(peak))+1, scale=256/2**exponent
    pixels[i]=Math.floor(r*scale); pixels[i+1]=Math.floor(g*scale); pixels[i+2]=Math.floor(b*scale)
    pixels[i+3]=128+exponent
  }
  return Buffer.concat([Buffer.from('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y '+height+' +X '+width+'\n'),pixels])
}
