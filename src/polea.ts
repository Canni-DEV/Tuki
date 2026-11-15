import type R from '@dimforge/rapier3d-compat'

/** Two vertical strands over a fixed pulley. Positive impulse is tension only. */
export class Polea {
  private readonly sumaInicial: number
  constructor(readonly a: R.RigidBody, readonly b: R.RigidBody, private world: R.World, private adjuntos: R.RigidBody[] = []) {
    this.sumaInicial = a.translation().y + b.translation().y
  }
  get extension() { return this.sumaInicial - this.a.translation().y - this.b.translation().y }
  private carga(raiz: R.RigidBody, adjuntos: R.RigidBody[] = []) {
    const grupo = new Set([raiz, ...adjuntos])
    // Condense the vertical contact island. These are actual supporting contacts,
    // not objects selected by type or by an editing-time support label.
    for (const cuerpo of grupo) for (let i = 0; i < cuerpo.numColliders(); i++) {
      const c = cuerpo.collider(i)
      this.world.contactPairsWith(c, otro => {
        const body = otro.parent()
        if (!body?.isDynamic() || grupo.has(body)) return
        this.world.contactPair(c, otro, (m, flipped) => {
          if (m.numSolverContacts() && m.normal().y * (flipped ? -1 : 1) > .7) grupo.add(body)
        })
      })
    }
    return [...grupo]
  }
  private fuerzas = new Map<R.RigidBody,number>()
  resolver(dt: number) {
    const a = this.carga(this.a,this.adjuntos), b = this.carga(this.b)
    const ma = a.reduce((m,c) => m+c.mass(),0), mb = b.reduce((m,c) => m+c.mass(),0)
    const inversa = 1/ma + 1/mb
    if (!inversa) return
    const velocidad = this.a.linvel().y + this.b.linvel().y - 2*9.81*dt
    // Speculative constraint prevents the next step extending the cable. Baumgarte
    // stabilization corrects solver drift with impulses, never by moving a body.
    const objetivo = this.extension >= 0 ? .8 * this.extension / dt : this.extension / dt
    const impulso = Math.max(0, (objetivo - velocidad) / inversa)
    const fuerzas = new Map<R.RigidBody,number>()
    fuerzas.set(this.a,impulso/dt)
    fuerzas.set(this.b,impulso/dt)
    for (const c of new Set([...this.fuerzas.keys(),...fuerzas.keys()]))
      c.addForce({x:0,y:(fuerzas.get(c)??0)-(this.fuerzas.get(c)??0),z:0},true)
    this.fuerzas=fuerzas
  }
}
