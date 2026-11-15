import { certificarDesafio } from './desafios'

self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const desafio = await certificarDesafio(event.data, progreso=>self.postMessage({progreso}))
    self.postMessage({desafio})
  } catch (error) { self.postMessage({error:error instanceof Error ? error.message : 'No se pudo comprobar el desafío.'}) }
}
