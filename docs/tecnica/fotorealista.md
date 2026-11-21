# Visuales fotorealistas opcionales

Implementación en `codex/modo-fotorealista`, iniciada desde `main` en `531a65b3e9c106991ec20414f089038633d43b35`. No sustituye el render Actual, no modifica los GLB ni la simulación y no implica una publicación. El acabado visual se debe revisar junto a las capturas: esta implementación no demuestra por sí sola una equivalencia con una producción AAA.

## Uso y compatibilidad

En Preferencias, **Apariencia** sigue controlando Claro/Oscuro/Según el sistema. **Visuales** permite optar por Fotorealista y elegir Alta o Equilibrada. Actual sigue siendo el valor inicial. La preferencia se conserva por separado del tema y del progreso.

La activación comprueba contexto seguro, adaptador real, límites e inicialización WebGPU. Después ejecuta una mesa de control independiente, con física real: dos segundos de calentamiento y cinco segundos medidos por tema, al máximo de píxeles del perfil aunque la ventana sea pequeña. Requiere p95 ≤ 20 ms, p99 ≤ 33,3 ms y al menos 150 muestras válidas por tema. Un evento de ocultación cancela la comprobación, aunque el navegador suspenda los callbacks de animación. Si Alta falla se propone probar Equilibrada. No se cambia de perfil durante una jugada.

La prueba no adelanta la partida del jugador. Durante la preparación quedan bloqueados el tablero, los controles de edición y sus atajos; Preferencias sigue accesible y se puede cancelar también desde el indicador de preparación al cerrar el diálogo. Cancelar aborta las peticiones de texturas y HDR y descarta las respuestas antiguas. Al terminar, cancelar o fallar, se reinicia la marca del reloj para evitar un salto temporal. La pérdida del dispositivo vuelve a Actual conservando estado y elimina la habilitación anterior. Se puede repetir la comprobación desde Preferencias. Las aprobaciones se reutilizan solamente durante la sesión, para el mismo perfil y tamaño de viewport/DPR; una recarga vuelve a comprobarlas. Una pestaña que comienza oculta aplaza la activación hasta hacerse visible, sin borrar la preferencia compartida.

Los talleres grandes pueden exceder la carga de la mesa de control. No se ofrece un Fotorealista WebGL2 como alternativa automática. La ruta WebGL2 mejorada existe exclusivamente en el laboratorio.

## Arquitectura

| Parte | Responsabilidad |
|---|---|
| `src/espacio.ts` | Conserva el render r180, escena de juego, cámara, canvas de entrada y su invalidación. Un hook permite delegar únicamente el dibujo principal. |
| `src/render/contrato.ts` | Datos de presentación independientes de Three: geometría, grupos, mapas, matrices, parámetros ortográficos y materiales. |
| `src/render/presentacion.ts` | Extrae la representación sin entregar instancias de Three r180 al nuevo módulo. Copia buffers por revisión y matrices por cuadro. |
| `src/render/control.ts` | Compatibilidad, carga diferida, cancelación, activación, recuperación y caché de miniaturas. |
| `src/render/sondeo.ts` | Mesa de control independiente; utiliza la física existente sin cambiar sus parámetros. |
| `src/render/laboratorio.ts` | Comparación A/B/C, captura de poses y reproducción con reloj de juego suspendido. Solo se importa mediante la API de revisión. |
| `render/fotorealista/` | Paquete independiente con `three` y `@types/three` fijados en 0.187.0; WebGL2 de comparación y WebGPU/TSL. |
| `render/recursos.mjs` | Generador determinista de mapas de madera, tejido y entornos HDR originales. |
| `render/build.mjs` | Empaqueta el módulo aislado y verifica que no incorpore Three r180. Genera `public/fotorealista`, ignorado por Git. |

`npm ci` instala también el paquete aislado mediante `postinstall`. Vite genera el bundle y los recursos tanto desde su API como desde `npm run dev` y `npm run build`. Para editar el módulo aislado con el servidor ya abierto, ejecutar `npm run render:build` y recargar la página. `npm run render:typecheck` verifica sus tipos por separado.

No se comparte ningún `Object3D`, material, textura, cámara o renderer entre revisiones. El contrato admite arrays numéricos y fuentes de imagen del navegador. La ruta nueva reconstruye su escena con las mismas geometrías y transformaciones. El canvas WebGPU se superpone sin recibir eventos; el canvas original mantiene picking y controles. Solo una ruta dibuja la escena principal. Actual conserva sus recursos para poder recuperarse inmediatamente.

Los materiales y geometrías compartidos se serializan una vez por cuadro. Las partes GLB opacas repetidas se agrupan en `InstancedMesh`, con matrices independientes; la identidad, selección y colisiones continúan en la escena original. El vidrio, las ayudas de edición y los efectos personalizados mantienen objetos separados. Se agrupa por geometría, materiales, familia, sombras y orden de render, y se liberan los buffers de instancias al desaparecer un grupo. Esta optimización se utiliza tanto en B como en C para mantener comparable su carga.

Las miniaturas nuevas emplean escena, cámara y render target reutilizables de 120 × 120, iluminación neutra y caché por pieza. Se restauran las miniaturas originales al salir. Un fallo de lectura conserva la miniatura Actual y queda registrado en el diagnóstico, sin modificar exposición ni tamaño del render principal.

## Materiales e iluminación

La base de ambos perfiles incluye iluminación directa, sombras, entorno prefiltrado, materiales físicos, transmisión y oclusión de contacto. Se mantiene ACES y salida sRGB. La exposición es fija por tema.

- Día: luz principal neutra cálida, relleno y entorno con una fuente amplia para reflejos. No se confunde una luz de área con una fuente capaz de proyectar sombras.
- Noche: foco cálido localizado, relleno distinto y otro entorno HDR. No consiste en aplicar un filtro oscuro a la imagen diurna.
- Madera: mapas de color, rugosidad y normales sin iluminación horneada; veta irregular y poros. Se reutilizan las UV del catálogo, cuya escala física está documentada en `art/build_models.py`. Se normaliza la escala de la mesa respecto de las piezas. Lanzador y retenedor conservan madera y geometría.
- Plástico: se elimina la respuesta metálica de canaleta y curva; rugosidad y barniz propios. Las piezas de metal y cerámica conservan su familia material.
- Vidrio ahumado: transmisión, IOR 1,5, absorción verde y espesor de 12 mm, con bandas ámbar y opalina legibles. La transparencia no se obtiene bajando simplemente la opacidad.
- Contacto: GTAO sin acumulación temporal, con filtrado espacial y solo los buffers de color y normales que utiliza. El filtro de sombras WebGPU utiliza muestras fijas en el mapa; no rota ruido con los píxeles de la pantalla. El ajuste espacial de sombras procede del encuadre estable existente.

El brillo de la meta que usaba `onBeforeCompile` tiene equivalente TSL. Las motas de victoria que usaban `ShaderMaterial` se representan con pequeños planos orientados a la cámara, evitando el límite de tamaño de puntos de WebGPU. Sus nodos de color/opacidad conservan las salidas MRT requeridas por el contacto.

Los aros de selección `LineLoop`, no admitidos por WebGPURenderer, se convierten a segmentos cerrados en la representación nueva. Se conservan el rango visible, los índices y los grupos de material; la geometría original y el picking no cambian.

La iluminación amplia y sus sombras son una aproximación en tiempo real, no una simulación de área ni un cálculo completo de luz indirecta. La transmisión depende de la información disponible en pantalla; no resuelve todas las capas de vidrio entre sí ni objetos fuera del encuadre. Los entornos aportan reflejos estables pero no reflejan cada pieza dinámica.

SSGI y SSR se pueden seleccionar individualmente en el laboratorio. **No están habilitados en los perfiles del producto**: SSGI requiere validar sus supuestos de cámara perspectiva y los reflejos en pantalla pierden información al salir del encuadre. La base prioriza estabilidad y lectura de la bolita. No incluye path tracing, cáusticas, profundidad de campo, motion blur ni efectos de lente.

## Presupuestos

| Perfil | Píxeles efectivos máximos | Sombras | Mapas principales | Contacto |
|---|---:|---:|---:|---:|
| Equilibrada | 1920 × 1080 equivalentes | 2048 | 1024 | Media resolución, 12 muestras |
| Alta | 2560 × 1440 equivalentes | 4096 | 2048 | Resolución completa, 24 muestras |

Se conserva la proporción del viewport; el límite es de cantidad total de píxeles, no de tamaño CSS. La transmisión utiliza el framebuffer del perfil, de menor resolución efectiva en Equilibrada.

Los recursos generados ocupan **4.110 MiB** para Equilibrada y **18.918 MiB** acumulados incluyendo Alta y ambos temas, por debajo de 12/24 MiB. `recursos/manifest.json` registra cada archivo y el generador falla si supera esos límites. Son bytes de archivos gráficos adicionales; no incluyen JavaScript, GLB originales ni memoria GPU.

El bundle aislado incluye ambos candidatos de comparación y se descarga al optar por Fotorealista. No está enlazado como un módulo estático del render Actual. Los contadores `renderer.info.memory` de r187 permiten registrar recursos y una estimación de bytes; no equivalen a una medición del proceso completo ni de toda la VRAM física. Actual sigue residente durante Fotorealista.

## Laboratorio y reproducción

Usar una página de desarrollo o preview con `?revision`. Primero cargar `vuelta` y seleccionar una ruta. La API de laboratorio no es una preferencia persistente.

```js
await tukiQA.cargar('vuelta')
await tukiQA.render.seleccionar('actual')                 // A: r180
await tukiQA.render.seleccionar('webgl2', 'alta', 'base')  // B: r187
await tukiQA.render.seleccionar('webgpu', 'alta', 'base')  // C: r187
// Variantes C: 'contacto', 'ssgi', 'ssr', evaluadas por separado.
```

`qa/render/comparar.mjs` toma pares en reposo; `qa/render/reproducir.mjs` graba seis segundos de física una sola vez, conserva poses/cámara/recursos, y reproduce la misma secuencia en bucle. La reproducción suspende el reloj del juego y restaura matrices y visibilidad al finalizar. No ejecuta las tres rutas simultáneamente. B/C comparten mapas, geometría y tratamiento de color; el filtro de sombras de C es propio y estable, por lo que no se afirma identidad píxel a píxel con B.

```powershell
$env:TUKI_BASE_URL='http://127.0.0.1:4176/?revision'
$env:TUKI_CHROME='C:/ruta/al/chrome.exe'
node qa/render/activar.mjs
node qa/render/estabilidad.mjs
node qa/render/recorridos.mjs
node qa/render/carga.mjs
node qa/render/comparar.mjs
# Predeterminado: WebGPU + contacto, Alta, 5 × 60 s por tema.
node qa/render/reproducir.mjs
```

Variables del ensayo: `TUKI_RENDER_BACKEND` (lista A/B/C en reproducción), `TUKI_RENDER_EFFECT`, `TUKI_RENDER_QUALITY`, `TUKI_RENDER_FIXTURE`, `TUKI_RENDER_SECONDS`, `TUKI_RENDER_RUNS`. `TUKI_RENDER_VIDEO=1` captura una sesión separada; sus tiempos no se usan como benchmark. Los resultados y capturas se guardan en `.qa-local/fotorealista/`. La medición cuenta intervalos de `requestAnimationFrame` y tiempo CPU de envío, **no tiempo de ejecución GPU obtenido con timestamps**.

`qa/render/activar.mjs` comprueba la habilitación, estado conservado, miniaturas, victoria con movimiento completo y retorno a Actual. `estabilidad.mjs` prueba cancelación, veinte alternancias de modo/tema y destrucción real del dispositivo de prueba. `recorridos.mjs` cubre portada, campaña y talleres, incluidas mesas de 100/200 objetos y dispositivos; `carga.mjs` separa primera escena de comprobación y disponibilidad jugable, con red de 25 Mbps/40 ms y caché fría/caliente.

`qa/render/jugadas.mjs` mide también la ruta completa de producción con física y sincronización de escena, repitiendo jugadas durante un minuto por mesa y tema. `integrada.mjs` solicita el adaptador de bajo consumo en una página de prueba, sin modificar Windows: si el navegador sigue ofreciendo NVIDIA, no informa esa ejecución como una medición de equipo modesto.

`cancelacion.mjs` cubre descarga lenta, bloqueo del atajo de empuje, cancelación, ocultación de pestaña, error de red y reintento. `angulos.mjs` captura A/B/C con las mismas cámaras acercada, orbital y superior, usando los controles existentes.

La suite E2E ordinaria añade casos sin WebGPU y preferencia guardada con adaptador ausente, verificando que no se descarguen recursos fotorealistas. Se conservan las pruebas existentes de física, cámaras, controles y rendimiento 100/200. `verify:local` incorpora la verificación de tipos y la huella de las dependencias del paquete aislado.

## Criterios de publicación

Los resultados medidos se registran en `docs/qa/fotorealista.md`. Para publicar se requieren regresiones aprobadas, revisión visual de ambos temas y medición en un equipo modesto real. Una RTX limitada artificialmente no sustituye esa prueba. La comprobación automática por dispositivo reduce el riesgo, pero no certifica todas las mesas ni todos los controladores.

Si falla un efecto opcional, queda desactivado. Si falla la base en un equipo, se conserva Actual; no se cambia silenciosamente al candidato WebGL2. Para revertir la feature completa, se revierte su commit en esta rama: los recursos originales permanecen intactos y los archivos nuevos se generan desde su paquete y generador.

## Referencias técnicas

- [Migración y límites de WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer.html): WebGPU no mejora por sí mismo materiales ni rendimiento; shaders GLSL personalizados necesitan adaptación.
- [Three.js r187](https://github.com/mrdoob/three.js/releases/tag/r187): revisión fijada para ambos candidatos.
- [MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html): transmisión, espesor, absorción y coste de materiales físicos.
- [RectAreaLight](https://threejs.org/docs/pages/RectAreaLight.html): una fuente rectangular no proporciona shadow maps por sí sola.
- [SSGINode](https://threejs.org/docs/pages/SSGINode.html): restricciones y artefactos que impiden adoptarlo sin validación adicional.
- Código instalado r187: `WebGPUBackend.js` ignora pérdidas con motivo `destroyed`; se observa también la promesa `device.lost` para comprobar recuperación real. `NodeMaterial.js` omite la integración MRT automática al reemplazar `fragmentNode`; las motas usan `colorNode`/`opacityNode`.
