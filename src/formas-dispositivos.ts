import type { Part, Shape, Triple } from './shapes'

const box = (at: Triple, size: Triple): Shape => ({ kind: 'box', at, size })
const cylinder = (at: Triple, diameter: number, height: number): Shape => ({ kind: 'cylinder', at, size: [diameter,height,diameter] })
const hull = (p: Triple[]): Shape => ({ kind: 'hull', at:[0,0,0], size:[0,0,0], points:p.flat() })

/** Authoring and collision volumes use the same metric descriptions. */
export function agregarDispositivos(catalog: Record<string, Shape[]>, assemblies: Record<string, Part[]>) {
  catalog.launcherBase = [box([0,.003,0],[.066,.006,.070]), cylinder([0,.008,0],.024,.004)]
  // An open front exposes the inclined outlet. The rear funnel captures incoming drops.
  for (let i=0;i<24;i++) {
    const a=i*Math.PI/12, b=(i+1)*Math.PI/12
    if (Math.sin((a+b)/2) > .1) continue
    const p: Triple[]=[]
    for (const t of [a,b]) for (const [r,y] of [[.011,.010],[.014,.010],[.029,.047],[.032,.047]])
      p.push([r*Math.cos(t),y,r*Math.sin(t)])
    catalog.launcherBase.push(hull(p))
  }
  catalog.launcherStop = [box([0,.006,.014],[.022,.012,.002])]
  catalog.launcherPin = [cylinder([0,0,0],.009,.003)]
  for (const angle of [30,45,60]) assemblies['launcher'+angle] = [
    { key:'base',asset:'launcherBase',at:[0,0,0] },
    { key:'stop',asset:'launcherStop',at:[0,.006,0],slide:'x',limits:[0,.035],mass:.002 },
    { key:'pin',asset:'launcherPin',at:[0,.009,-.012],pitch:Math.PI/2-angle*Math.PI/180 },
  ]
  const floor: Triple[]=[]
  for (const x of [-.017,.017]) for (const [z,y] of [[-.033,.015],[.033,.004]])
    floor.push([x,y,z],[x,.002,z])
  catalog.holderBase = [box([0,.001,0],[.046,.002,.066]),hull(floor),
    ...[-.020,.020].map(x=>box([x,.014,0],[.003,.026,.066]))]
  catalog.holderStop = [box([0,.010,0],[.036,.020,.002])]
  assemblies.holder = [{key:'base',asset:'holderBase',at:[0,0,0]},
    {key:'stop',asset:'holderStop',at:[0,.007,.001],slide:'y',limits:[0,.030],mass:.002}]
  catalog.springBase = [box([0,.002,0],[.054,.004,.054]),cylinder([0,.008,0],.010,.012)]
  catalog.springHead = [box([0,0,0],[.040,.003,.040])]
  for(const angle of [0,15,30]) assemblies['springplate'+angle] = [
    {key:'base',asset:'springBase',at:[0,0,0]},
    {key:'head',asset:'springHead',at:[0,.014,0],slide:'y',pitch:angle*Math.PI/180,limits:[0,.012],mass:.001},
  ]
  catalog.liftBase = [box([0,.003,0],[.090,.006,.070]),
    ...[-.040,.040].map(x=>box([x,.088,-.028],[.005,.170,.005])),
    box([0,.174,-.028],[.085,.006,.008])]
  catalog.liftPlatform = [hull([[-.018,-.002,-.022],[.018,-.002,-.022],[-.018,.011,-.022],[.018,.011,-.022],[-.018,-.002,.022],[.018,-.002,.022],[-.018,.002,.022],[.018,.002,.022]]),
    ...[-.017,.017].map(x=>box([x,.006,0],[.002,.012,.044])),
    box([0,.006,-.021],[.032,.012,.002])]
  catalog.liftStop = [box([0,.011,0],[.032,.022,.002])]
  for(const weight of [6,12,24]) {
    const h=.008+weight/1000
    catalog['liftWeight'+weight]=[box([0,h/2,0],[.026,h,.032])]
    assemblies['lift'+weight]=[
      {key:'base',asset:'liftBase',at:[0,0,0]},
      {key:'platform',asset:'liftPlatform',at:[-.022,.012,0],slide:'y',limits:[0,.12],mass:.007},
      {key:'stop',asset:'liftStop',at:[-.022,.013,.021],mass:.001},
      {key:'weight',asset:'liftWeight'+weight,at:[.024,.132,0],slide:'y',limits:[-.12,0],mass:.008+weight/1000},
    ]
  }
}
