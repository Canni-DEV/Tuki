/** Storage revisions are local concurrency tokens, never physics revisions. */
export interface Registro<T> { id: string; revisionGuardado: number; valor: T; recuperada?: boolean }
export interface Resumen {
  id: string; clase: 'mesa' | 'desafio'; nombre: string; objetos: number
  revisionGuardado: number; propio?: boolean; estado?: 'borrador' | 'certificado'; victoria?: string
  recuperada?: boolean
  tipos?: import('./types').TipoColocable[]; secuencias?: boolean
}
type Tabla = 'documentos' | 'intentos' | 'victorias'
export class ConflictoGuardado extends Error {
  constructor() { super('El documento cambió en otra pestaña. Volvé a abrirlo antes de borrarlo.') }
}

export class Almacen extends EventTarget {
  private db?: IDBDatabase
  private apertura?: Promise<IDBDatabase>
  private canal?: BroadcastChannel
  constructor(readonly nombre = 'tuki.v1') {
    super()
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.canal = new BroadcastChannel(nombre)
      this.canal.onmessage = () => this.dispatchEvent(new Event('cambio'))
    }
  }
  abrir(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db)
    return this.apertura ??= new Promise<IDBDatabase>((resolve, reject) => {
      let terminado = false
      const req = indexedDB.open(this.nombre, 1)
      req.onupgradeneeded = () => {
        for (const tabla of ['documentos', 'intentos', 'indice']) req.result.createObjectStore(tabla, { keyPath: 'id' })
        req.result.createObjectStore('victorias')
      }
      const fallar = () => { terminado = true; reject(req.error ?? new Error('El guardado local está ocupado. Volvé a intentar.')) }
      req.onerror = fallar
      req.onblocked = () => { terminado = true; reject(new Error('El guardado local está ocupado. Volvé a intentar.')) }
      req.onsuccess = () => {
        if (terminado) { req.result.close(); return }
        this.db = req.result
        this.db.onversionchange = () => this.cerrar()
        this.db.onclose = () => { this.db = undefined; this.apertura = undefined }
        resolve(this.db)
      }
    }).catch(error => { this.apertura = undefined; throw error })
  }
  cerrar() { this.db?.close(); this.db = undefined; this.apertura = undefined }
  private avisar() { this.canal?.postMessage(null); this.dispatchEvent(new Event('cambio')) }
  async leer<T>(tabla: Tabla, id: string): Promise<T | undefined> {
    const db = await this.abrir()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(tabla), req = tx.objectStore(tabla).get(id)
      tx.oncomplete = () => resolve(req.result)
      tx.onabort = () => reject(tx.error ?? req.error)
    })
  }
  async listar(): Promise<Resumen[]> {
    const db = await this.abrir()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('indice'), req = tx.objectStore('indice').getAll()
      tx.oncomplete = () => resolve(req.result)
      tx.onabort = () => reject(tx.error ?? req.error)
    })
  }
  async victorias(): Promise<string[]> {
    const db = await this.abrir()
    return new Promise((resolve, reject) => {
      const tx = db.transaction('victorias'), req = tx.objectStore('victorias').getAllKeys()
      tx.oncomplete = () => resolve(req.result.map(String))
      tx.onabort = () => reject(tx.error ?? req.error)
    })
  }
  async completar(id: string) {
    const db = await this.abrir()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('victorias', 'readwrite')
      tx.objectStore('victorias').put(true, id)
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
    })
    this.avisar()
  }
  async guardar<T>(id: string, esperada: number, valor: T, resumen: Omit<Resumen, 'id' | 'revisionGuardado'>): Promise<Registro<T>> {
    const db = await this.abrir()
    const guardado = await new Promise<Registro<T>>((resolve, reject) => {
      const tx = db.transaction(['documentos', 'indice'], 'readwrite'), documentos = tx.objectStore('documentos')
      const req = documentos.get(id)
      let next: Registro<T>, fallo: unknown
      req.onsuccess = () => {
        try {
        const anterior = req.result as Registro<T> | undefined
        const conflicto = (anterior?.revisionGuardado ?? 0) !== esperada
        next = { id: conflicto ? crypto.randomUUID() : id, revisionGuardado: conflicto ? 1 : esperada + 1,
          valor: structuredClone(valor), recuperada: conflicto || anterior?.recuperada }
        documentos.put(next)
        tx.objectStore('indice').put({ ...resumen, id: next.id, revisionGuardado: next.revisionGuardado, recuperada: next.recuperada })
        } catch (error) { fallo = error; tx.abort() }
      }
      tx.oncomplete = () => resolve(next)
      tx.onabort = () => reject(fallo ?? tx.error ?? req.error)
    })
    this.avisar()
    return guardado
  }
  /** An attempt can change only the attempt store. A stale attempt gets its own local document copy. */
  async guardarIntento<T, A>(registro: Registro<T>, firma: string, esperada: number, armado: A,
    resumen: Omit<Resumen, 'id' | 'revisionGuardado'>, firmaActual: (valor: T) => string) {
    const db = await this.abrir()
    const resultado = await new Promise<{ registro: Registro<T>; intento: Registro<{ firma: string; armado: A }> }>((resolve, reject) => {
      const tx = db.transaction(['documentos', 'indice', 'intentos'], 'readwrite')
      const docs = tx.objectStore('documentos'), intentos = tx.objectStore('intentos')
      const doc = docs.get(registro.id), intento = intentos.get(registro.id)
      let salida: { registro: Registro<T>; intento: Registro<{ firma: string; armado: A }> }, fallo: unknown
      intento.onsuccess = () => {
        try {
        const actual = doc.result as Registro<T> | undefined
        const previo = intento.result as Registro<{ firma: string; armado: A }> | undefined
        const conflicto = !actual || firmaActual(actual.valor) !== firma || (previo?.revisionGuardado ?? 0) !== esperada
        const destino: Registro<T> = conflicto
          ? { ...structuredClone(registro), id: crypto.randomUUID(), revisionGuardado: 1, recuperada: true }
          : actual
        if (conflicto) {
          docs.put(destino)
          tx.objectStore('indice').put({ ...resumen, id: destino.id, revisionGuardado: 1, recuperada: true })
        }
        const next = { id: destino.id, revisionGuardado: conflicto ? 1 : esperada + 1, valor: { firma, armado: structuredClone(armado) } }
        intentos.put(next)
        salida = { registro: destino, intento: next }
        } catch (error) { fallo = error; tx.abort() }
      }
      tx.oncomplete = () => resolve(salida)
      tx.onabort = () => reject(fallo ?? tx.error)
    })
    this.avisar()
    return resultado
  }
  async borrar(id: string, esperada: number) {
    const db = await this.abrir()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['documentos', 'indice', 'intentos'], 'readwrite'), docs = tx.objectStore('documentos'), req = docs.get(id)
      let conflicto = false
      req.onsuccess = () => {
        if (req.result?.revisionGuardado !== esperada) { conflicto = true; tx.abort(); return }
        docs.delete(id); tx.objectStore('indice').delete(id); tx.objectStore('intentos').delete(id)
      }
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(conflicto ? new ConflictoGuardado() : tx.error)
    })
    this.avisar()
  }
}

export const almacen = new Almacen()
