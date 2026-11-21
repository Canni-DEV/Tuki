import type { Geometria } from '../../../src/render/contrato'

const cache=new WeakMap<Geometria,Geometria>()
/** WebGPU has no line-loop primitive. Close each visible range explicitly. */
export function segmentosBucle(source:Geometria):Geometria {
  const previous=cache.get(source);if(previous)return previous
  const count=source.index?.array.length??source.attributes.position.array.length/source.attributes.position.itemSize
  const vertex=(i:number)=>source.index?.array[i]??i
  const indices:number[]=[],groups:Geometria['groups']=[]
  const ranges=source.groups.length?source.groups:[{start:0,count}]
  for(const range of ranges){
    const start=Math.max(range.start,source.drawRange.start),end=Math.min(count,range.start+range.count,source.drawRange.start+source.drawRange.count)
    const offset=indices.length
    if(end-start>=2)for(let i=start;i<end;i++)indices.push(vertex(i),vertex(i+1<end?i+1:start))
    if(source.groups.length)groups.push({start:offset,count:indices.length-offset,materialIndex:range.materialIndex})
  }
  const result={...source,id:source.id+':line-loop',index:{array:new Uint32Array(indices),itemSize:1,normalized:false},groups,drawRange:{start:0,count:indices.length}}
  cache.set(source,result);return result
}
