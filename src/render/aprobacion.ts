import type { Calidad } from './contrato'
import type { InformeSondeo } from './sondeo'

// Bump when the representative workload, admission thresholds or pipeline cost changes.
// Theme, viewport and DPR are deliberately excluded: the probe runs at the profile ceiling.
export const revisionAprobacion = 'r187-contacto-nogal-3'
export function firmaAprobacion(quality: Calidad, adapter: GPUAdapter, userAgent: string) {
  const info=adapter.info,limits=adapter.limits
  const browser=userAgent.match(/(?:Edg|Firefox|Chrome|Version)\/\d+/g)?.join(' ')??userAgent
  return JSON.stringify([revisionAprobacion,quality,quality==='alta'?2560*1440:1920*1080,browser,
    info.vendor,info.architecture,info.device,info.description,
    limits.maxTextureDimension2D,limits.maxColorAttachments,limits.maxBufferSize,limits.maxStorageBufferBindingSize])
}

interface Aprobacion { signature: string; approvedAt: number; report: InformeSondeo }
type Almacen = Pick<Storage,'getItem'|'setItem'|'removeItem'>
const key=(quality:Calidad)=>`tuki.render.aprobacion.${quality}`
function valida(value: unknown, signature: string, now: number): value is Aprobacion {
  if(!value||typeof value!=='object')return false
  const v=value as Aprobacion,r=v.report
  if(v.signature!==signature||!Number.isFinite(v.approvedAt)||v.approvedAt<=0||v.approvedAt>now+300000||
    r?.accepted!==true||!Array.isArray(r.results)||r.results.length!==2)return false
  return r.results.every((s,i)=>s?.theme===(i?'oscuro':'claro')&&s.accepted===true&&
    Number.isInteger(s.samples)&&s.samples>=150&&
    [s.p50,s.p95,s.p99,s.max].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0)&&
    s.p50!<=s.p95!&&s.p95!<=20&&s.p95!<=s.p99!&&s.p99!<=33.3&&s.p99!<=s.max!&&
    Number.isInteger(s.over25)&&s.over25>=0&&s.over25<=s.samples&&
    Number.isInteger(s.over50)&&s.over50>=0&&s.over50<=s.over25)
}

/** At most one approval per profile. Storage restrictions must not prevent playing. */
export class Aprobaciones {
  private volatile=new Map<Calidad,Aprobacion|null>()
  constructor(private storage:()=>Almacen=()=>localStorage,private now=()=>Date.now()) {}
  read(quality:Calidad,signature:string): InformeSondeo | undefined {
    let value:unknown
    if(this.volatile.has(quality))value=this.volatile.get(quality)
    else try {value=JSON.parse(this.storage().getItem(key(quality))??'null')}catch {return}
    return valida(value,signature,this.now())?value.report:undefined
  }
  save(quality:Calidad,signature:string,report:InformeSondeo) {
    const approval={signature,approvedAt:this.now(),report}
    if(!valida(approval,signature,this.now()))return
    try {this.storage().setItem(key(quality),JSON.stringify(approval));this.volatile.delete(quality)}
    catch {this.volatile.set(quality,approval)}
  }
  revoke(quality:Calidad) {
    try {this.storage().removeItem(key(quality));this.volatile.delete(quality)}
    catch {this.volatile.set(quality,null)}
  }
}
