# Modo fotorealista: implementación y evidencia local

Fecha de los ensayos: **21 de noviembre de 2026**. Rama `codex/modo-fotorealista`, creada desde `main` en `531a65b3e9c106991ec20414f089038633d43b35`. No se modificó ni fusionó `main`. La arquitectura y los comandos del laboratorio están en [la documentación técnica](../tecnica/fotorealista.md).

Actualización del 22 de noviembre: [persistencia de aprobación, calibración oculta y corrección del reflejo angular](fotorealista-correcciones.md). Los tiempos de primera escena de este informe inicial incluían la calibración visible; el comportamiento nuevo conserva la mesa del jugador durante el ensayo.

Actualización de fondos: [paleta compartida, continuidad en perspectiva y evidencia de ambos temas](fondo-continuo.md).

**Estado: implementado para revisión en la rama; no certificado para publicación general.** Actual continúa como predeterminado. Fotorealista requiere WebGPU operativo y una comprobación de fluidez por perfil. Quedan pendientes una prueba en un equipo modesto real y la aprobación del acabado visual. Los materiales procedurales, las aproximaciones de iluminación y la transmisión en pantalla no equivalen por sí solos al acabado de las imágenes de referencia.

## Qué se entregó

- Laboratorio A/B/C: Actual r180, WebGL2 mejorado r187 y WebGPU/TSL r187; mismas geometrías, cámaras y poses. Efectos base, contacto, SSGI y SSR se comparan por separado.
- Modo opcional integrado en portada, campaña, taller, desafíos personalizados y miniaturas del catálogo. Apariencia y calidad son preferencias independientes.
- Madera, plástico y vidrio ahumado; dos entornos y configuraciones de luz, sombras estables y oclusión de contacto. Se conservan GLB, siluetas, física y cámaras.
- Paquete r187 aislado, carga diferida, recursos reproducibles, cancelación, recuperación por error y pérdida real del dispositivo. Actual no descarga el módulo ni los mapas nuevos.
- Alta y Equilibrada conservan las familias materiales. SSGI y SSR permanecen fuera de ambos perfiles: no se aprobó su calidad con la cámara ortográfica y los límites de información en pantalla.

## Equipo y método

Windows 11 Pro; Intel Core Ultra 7 265; aproximadamente 63,4 GiB de RAM utilizable; **NVIDIA GeForce RTX 5070 Ti**, controlador `32.0.16.1714`. WebGPU informó adaptador NVIDIA/Blackwell. Edge `158.0.4370.33` se utilizó para los ensayos fotorealistas; Chrome `152.0.7977.75` también completó el recorrido funcional. Los ensayos específicos usaron navegadores sin interfaz con aceleración GPU real, sin SwiftShader.

Alta se midió a 2560 × 1440 efectivos, DPR 1; Equilibrada a 1920 × 1080. Los valores son intervalos de `requestAnimationFrame`, después del calentamiento. **No son tiempos GPU obtenidos mediante timestamp queries.** La cadencia observada ronda 144 Hz: los resultados próximos a 7 ms están limitados por esa cadencia y no permiten afirmar cuánto margen GPU queda ni que WebGPU sea más rápido.

Se mantuvo una sola ruta principal de render durante cada medición. La grabación de vídeo se hizo en otra ejecución y no integra los resultados de rendimiento.

## Comparación controlada

En las capturas A/B/C de día y noche, B/C comparten mapas, poses, iluminación y color. C utiliza un filtro propio de sombras; no se afirma igualdad píxel a píxel. En los ensayos breves de reposo, A/B/C quedaron alrededor de **p95 7,1 ms y p99 7,1–7,2 ms**. Esto demuestra funcionamiento en este equipo, no una ventaja de API.

La diferencia visual proviene principalmente de los mapas de material, transmisión, entorno, iluminación y contacto. SSGI y SSR se ejecutaron individualmente sin errores de compilación en este equipo, pero un ensayo breve y una captura no certifican ausencia de artefactos. No se incluyeron en el producto.

Capturas locales: [Actual de día](../../.qa-local/fotorealista/actual-base-claro.png), [WebGL2 de día](../../.qa-local/fotorealista/webgl2-base-claro.png), [WebGPU de día](../../.qa-local/fotorealista/webgpu-base-claro.png), [WebGPU con contacto de noche](../../.qa-local/fotorealista/webgpu-contacto-oscuro.png), [acercamiento diurno](../../.qa-local/fotorealista/angulo-cerca-webgpu-claro.png). `angulos.mjs` produjo también pares en vista orbital y superior, mediante los controles existentes.

El vídeo local en `.qa-local/fotorealista/videos/` reproduce la misma secuencia de seis segundos en este orden: A día/noche, B día/noche, C día/noche. La grabación de poses tiene unas 289 muestras y se repite para medir; no sustituye una medición con física activa.

## Fluidez medida

Objetivo de aceptación Alta: p95 ≤ 18 ms y p99 ≤ 25 ms, sin pausas recurrentes > 50 ms. Umbral de habilitación por dispositivo: p95 ≤ 20 ms y p99 ≤ 33,3 ms, cinco segundos por tema tras dos segundos de calentamiento.

| Escenario | Duración medida | p95 máximo | p99 máximo | Mayor intervalo | Intervalos > 50 ms |
|---|---:|---:|---:|---:|---:|
| A la vuelta, poses idénticas, WebGPU/contacto Alta | 5 × 60 s por tema | 7,1 ms | 7,1 ms | 7,3 ms | 0 |
| A la vuelta, producción con física | 60 s por tema | 7,1 ms | 7,1 ms | 8,8 ms | 0 |
| Taller con dispositivos, 100 objetos, física | 60 s por tema | 7,1 ms | 7,1 ms | 7,4 ms | 0 |
| Taller con dispositivos, 200 objetos, física | 60 s por tema | 7,1 ms | 7,1 ms | 20,9 ms | 0 |

Las pruebas con física repiten jugadas reales y conservan la sincronización de presentación y los efectos de victoria. Se completaron 23 rondas por minuto en A la vuelta y 17 en las mesas grandes. La matriz de cinco repeticiones está completa para la reproducción controlada de A la vuelta; las mediciones adicionales con física de 100/200 objetos tienen una repetición por tema, no cinco.

El primer ensayo de 200 objetos dio p95 20,9 ms. Se corrigió el coste de presentar objetos repetidos mediante reutilización por cuadro e instancias de partes opacas. En esa mesa se pasó de 1596 nodos a 65 objetos de render, incluidos diez grupos de instancias. **No son 65 draw calls**: hay múltiples materiales y pasadas. El vidrio y los efectos permanecen independientes; la identidad de juego y las colisiones no cambiaron. Los resultados anteriores se conservan como `jugadas-antes-cache.json` y `reproduccion-antes-cache.json`.

Fuentes locales: [reproducción repetida](../../.qa-local/fotorealista/reproduccion-vuelta-alta-contacto.json), [jugadas con física](../../.qa-local/fotorealista/jugadas-reales.json), [comparación base](../../.qa-local/fotorealista/comparacion-base.json).

## Transferencia, carga y memoria

Recursos gráficos adicionales generados: **4.110 MiB en Equilibrada; 18.918 MiB acumulados incluyendo Alta**, frente a los presupuestos de 12/24 MiB. Incluyen los mapas y ambos entornos; no incluyen GLB originales ni JavaScript. El módulo aislado ocupa 1.284.172 bytes sin comprimir y 342.383 bytes con gzip calculado localmente; la transferencia real depende de la compresión del servidor.

Red simulada mediante CDP: 25 Mbps y 40 ms de latencia. El ensayo se hizo con el servidor de desarrollo; la activación funcional de la compilación bajo `/Tuki/` se comprueba por separado.

| Perfil / caché | Primera escena enviada | Listo para jugar |
|---|---:|---:|
| Equilibrada / fría | 3,56 s | 17,78 s |
| Alta / fría | 7,36 s | 21,56 s |
| Equilibrada / caliente, misma sesión | 0,44 s | 0,45 s |
| Alta / caliente, misma sesión | 0,51 s | 0,52 s |

En la versión ensayada el 21 de noviembre, la primera escena era el primer render enviado de la mesa de comprobación, no una marca de presentación del monitor. La primera activación incluía catorce segundos de calentamiento y medición diurna/nocturna. La carga caliente reutilizaba la habilitación de esa sesión; una recarga volvía a comprobarla. Los objetivos iniciales de primera escena (8/15 s) pasaron en ese ensayo, no se presentan como una garantía de red universal. La corrección del 22 de noviembre persiste la aprobación y no presenta la escena de comprobación; esa métrica ya no tiene el mismo significado.

La carga y decodificación de recursos, medidas conjuntamente, fueron 1,94/5,67 s en frío; preparación CPU de entorno 33/29 ms; compilación acumulada 362/444 ms (Equilibrada/Alta). El informe incluye Resource Timing de cada petición. Todavía no se aisló el tiempo de decodificación ni se midió compilación/ejecución con timestamps GPU.

Los contadores r187 estimaron alrededor de 449 MiB en la reproducción Alta y 577 MiB con los recursos de producción, ambos temas y miniaturas. Equilibrada quedó alrededor de 167 MiB durante las alternancias. Son estimaciones de recursos del renderer: **no incluyen toda la VRAM, el proceso del navegador ni el render Actual conservado en memoria**. No sustituyen una medición de memoria del controlador.

Fuente: [carga fría y caliente](../../.qa-local/fotorealista/carga.json).

## Integración, recuperación y compatibilidad

- Veinte alternancias de modo y tema completadas; contadores de recursos por sesión estables, sin crecimiento sostenido en esos contadores. Esto no demuestra por sí solo ausencia de toda fuga del proceso.
- Cancelación durante descarga, bloqueo de entradas de juego durante preparación, ocultación de pestaña, respuesta HTTP 503 y reintento comprobados. El estado del jugador se conserva.
- Destrucción real de `GPUDevice` detectada; retorno a Actual y partida posterior ganadora. Los errores de carga y compilación también siguen la ruta de recuperación.
- Activación Alta, victoria con movimiento completo y regreso a Actual comprobados sobre producción con base `/Tuki/`.
- Portada, campaña, talleres y dispositivos recorridos repetidamente; 45 miniaturas generadas sin errores. Un desafío personalizado importado, recertificado, completado mediante colocación de piezas y jugado se comprueba con `qa/render/desafio.mjs`. Esta prueba detectó y motivó la adaptación de los aros de selección `LineLoop` a segmentos cerrados para WebGPU.
- Chrome y Edge activaron WebGPU. Firefox de escritorio `160.0.1` no lo habilitó en este entorno: registró `The operation is insecure.` y Tuki restauró Actual. **No se informa Firefox fotorealista como aprobado.** La suite general verifica Actual en Firefox y Chromium por separado.
- Pedir un adaptador de bajo consumo devolvió nuevamente NVIDIA/Blackwell. La Intel integrada detectada por Windows **no cuenta como probada**; sigue pendiente un equipo modesto real.

Informes: [alternancias y pérdida de dispositivo](../../.qa-local/fotorealista/estabilidad.json), [cancelación y errores](../../.qa-local/fotorealista/cancelacion.json), [Chrome](../../.qa-local/fotorealista/recorridos-chrome.json), [Firefox](../../.qa-local/fotorealista/recorridos-firefox.json), [producción](../../.qa-local/fotorealista/activacion-produccion.json), [desafío](../../.qa-local/fotorealista/desafio.json).

## Regresiones y reproducción de la evidencia

Las pruebas nuevas cubren serialización sin compartir instancias de Three, actualización de datos animados, percentiles inválidos, preferencias independientes, pestaña inicialmente oculta y equipos sin WebGPU sin descarga fotorealista. No se rebajaron los umbrales existentes de modelos, física, cámaras, E2E ni rendimiento 100/200 objetos.

La aprobación completa del árbol se obtiene con `npm run verify:local`: tipos de ambos paquetes, modelos, pruebas unitarias/físicas, compilación, recursos publicados, E2E Chromium/Firefox, rendimiento con GPU real y aceptación Windows. Su constancia exacta queda en `.qa-local/verificaciones/<identidad>.json`; contiene huellas de fuentes, dependencias, equipo, navegadores y build. Este documento no sustituye esa constancia ni afirma que una ejecución incompleta haya pasado.

Los JSON extensos, capturas, vídeos y constancias son artefactos locales ignorados por Git. Los scripts de `qa/render/` y el generador de recursos sí forman parte de la rama y permiten reproducirlos. Los comandos, variables y límites metodológicos están documentados en [la guía técnica](../tecnica/fotorealista.md#laboratorio-y-reproducción).

Para publicar faltan la revisión visual del vidrio, la madera y las sombras en movimiento, el equipo modesto real y ampliar las repeticiones de las mesas de estrés. Hasta entonces la rama es revisable y el modo Actual sigue siendo la opción predeterminada utilizable.
