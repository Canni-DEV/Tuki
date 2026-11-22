# Correcciones de activación y reflejos

Ensayos del 22 de noviembre de 2026, en `codex/modo-fotorealista`. Equipo y navegadores: [informe inicial](fotorealista.md#equipo-y-método). RTX 5070 Ti real, Edge 158, Windows 11; sin SwiftShader. No se modifican `main`, modelos, texturas originales, física, controles ni el render Actual.

## Activación

`qa/render/aprobacion.mjs` pasó con ambos perfiles. Se verificó que:

- El ensayo no hace visible su canvas y `firstFrameAt` permanece en cero durante la calibración. El jugador ve su propia mesa y el [indicador pequeño](../../.qa-local/fotorealista/aprobacion/progreso-discreto.png).
- La primera aprobación se guarda; se reutiliza al alternar, cambiar tamaño/tema, recargar y abrir un contexto nuevo con el almacenamiento persistido, sin memoria del controlador anterior.
- El armado, cámara, selección y fase permanecen iguales.
- Repetir manualmente y cancelar conserva la aprobación anterior. Un HTTP 503 conserva la aprobación y permite reintentar sin recalibrar.
- Cada perfil necesita su propia aprobación. La destrucción real del dispositivo revoca únicamente el perfil activo y devuelve Actual.

Las nueve pruebas de `qa/render.test.ts` incluyen rechazo de registros corruptos, incompletos o fallidos; separación por perfil, GPU y revisión; y funcionamiento en sesión con almacenamiento bloqueado. La revisión de aprobación ahora es `r187-contacto-2`. El render target oculto mantiene la resolución completa, antialiasing y efectos del perfil, y se espera la cola GPU: ocultar la prueba no equivale a reducir su carga.

En esta ejecución, la comprobación de Alta obtuvo p95/p99 de 14/14 ms en ambos temas; Equilibrada, p95 de 13,8–13,9 ms y p99 de 14 ms. Son intervalos de rAF con espera de finalización GPU, no timestamp queries ni un benchmark comparable directamente con la calibración anterior, que solo enviaba trabajo. No se rebajaron los umbrales de admisión.

Informe: [aprobación y recuperación](../../.qa-local/fotorealista/aprobacion/informe.json).

La misma batería pasó también en Chrome 152 sobre la compilación de producción con base `/Tuki/`: [informe de Chrome](../../.qa-local/fotorealista/aprobacion-chrome/informe.json). La comprobación se realiza con WebGPU operativo; un resultado guardado no omite la inicialización real del dispositivo.

La prueba de veinte alternancias pasó: **una comprobación medida y diecinueve aprobaciones reutilizadas**, con contadores estables por sesión tras la primera activación y recuperación de pérdida GPU. También pasó la cancelación al ocultar la pestaña, el bloqueo del empuje durante la preparación y el reintento tras descarga fallida. Informes: [alternancias](../../.qa-local/fotorealista/estabilidad.json), [cancelación](../../.qa-local/fotorealista/cancelacion.json).

## Reflejo reproducido y corregido

Se reprodujo la captura reportada en `bajada`: alrededor de 220° de azimut y 18–22° de elevación. La luz direccional secundaria de relleno producía un reflejo concentrado sobre las caras horizontales, amplificado por el acabado de la madera. El barrido inicial cada 30° no detectaba su máximo; se añadió una exploración cada 5° alrededor de ese ángulo y cada 2° de elevación.

La corrección sustituye ese relleno por luz hemisférica difusa, manteniendo entorno, luz principal y reflejos físicos del vidrio. La madera pasa de rugosidad efectiva media aproximada .54 a .635, con clearcoat .06 y roughness de esa capa .55. La exposición y los HDR no se cambiaron. Actual permanece sin modificaciones.

En el barrido preciso 210–230° × 18–26°, las muestras del borde libre de madera con luminancia sRGB > .75 y saturación < .18 pasaron de un máximo de **95,99 % a 0 % en Oscuro**, y de **6,17 % a 0 % en Claro**. Este detector mide pérdida extensa de color, no radiancia HDR ni calidad artística; no había recorte literal a 255 en todos los canales. La inspección visual confirma que se conserva la veta y que cajas, libros y canaletas dejan de blanquearse.

Comparación con la misma cámara (220°/20°): [antes](../../.qa-local/fotorealista/reflejo-antes/bajada-webgpu-alta-oscuro-220-20.png), [después](../../.qa-local/fotorealista/reflejo-despues/bajada-webgpu-alta-oscuro-220-20.png). Informes completos: [antes](../../.qa-local/fotorealista/reflejo-antes/informe.json), [después](../../.qa-local/fotorealista/reflejo-despues/informe.json).

## Cobertura angular del producto

El barrido final usó la activación de Preferencias, con contacto habilitado, no solo el laboratorio: `bajada` y `vuelta`, Alta y Equilibrada, Claro y Oscuro, con Actual como referencia adicional. Fueron **1.512 posiciones registradas**, de las cuales 1.008 corresponden a Fotorealista, más 12 capturas superiores. No hubo errores de página o consola.

Se recorrieron azimuts 0, 30, 55, 60, 90, 120, 150, 180, 210, 220, 240, 270, 300 y 330 grados, y elevaciones 12, 18, 20, 22, 35, 54, 55, 75 y 85 grados, más vista superior. Esto cubre el rango orbital completo con muestras discretas y pasos de cámara reales; no afirma haber medido cada ángulo continuo posible. El barrido preciso anterior cubre adicionalmente el pico de la incidencia reportada.

En Fotorealista, el detector de madera desaturada dio 0 % para todas las vistas nocturnas y un máximo de 3,50 % de las muestras en las vistas diurnas. No se observaron caras de madera completamente blanqueadas. El detector no reemplaza la inspección de vidrio, canaletas y cajas; se inspeccionaron las vistas de mayor brillo y superiores en ambos temas.

Informe: [barrido completo](../../.qa-local/fotorealista/barrido-final/informe.json). Reproducción:

```powershell
$env:TUKI_SWEEP_BACKENDS='actual,fotorealista'
$env:TUKI_SWEEP_AZIMUTHS='0,30,55,60,90,120,150,180,210,220,240,270,300,330'
$env:TUKI_SWEEP_ELEVATIONS='12,18,20,22,35,54,55,75,85'
$env:TUKI_SWEEP_OUTPUT='.qa-local/fotorealista/barrido-final'
node qa/render/barrido.mjs
```

Los artefactos son locales e ignorados por Git. Los scripts y la documentación quedan en la rama. La validación de un equipo modesto real y la aprobación artística general de la feature siguen siendo pendientes del proyecto original; estas correcciones no las sustituyen.

## Juego en movimiento

`qa/render/orbita-jugada.mjs` completó cuatro jugadas ganadoras de `vuelta`, una por tema y calidad, con giro comprobado de 360° mediante los controles existentes. Se grabaron vídeo, acercamientos del vidrio y capturas intermedias de caída de fichas y bolita en movimiento. La inspección conserva el contraste de sus bandas y la lectura de canaleta y meta. No se utilizan los tiempos de esa grabación como benchmark.

Evidencia: [informe](../../.qa-local/fotorealista/orbita-jugada/informe.json), [movimiento nocturno en Alta](../../.qa-local/fotorealista/orbita-jugada/alta-oscuro-movimiento-3.png).

## Fluidez y regresiones

Sobre producción `/Tuki/`, Alta a 2560 × 1440, se ejecutó un minuto medido de física real por escenario y tema, después del calentamiento, sin grabación de vídeo y sin otro renderizador ejecutándose en paralelo:

| Escenario | Tema | p95 | p99 | Máximo | Pausas > 50 ms |
|---|---|---:|---:|---:|---:|
| Vuelta | Claro | 7,0 ms | 7,1 ms | 7,4 ms | 0 |
| Vuelta | Oscuro | 7,0 ms | 7,1 ms | 13,9 ms | 0 |
| 200 dispositivos | Claro | 7,0 ms | 7,1 ms | 14,0 ms | 0 |
| 200 dispositivos | Oscuro | 7,0 ms | 7,1 ms | 20,9 ms | 0 |

Es una comprobación de regresión de estas correcciones, no cinco repeticiones por escenario ni una medición en hardware modesto. La cadencia de 144 Hz limita los resultados próximos a 7 ms. [Informe con muestras y estado](../../.qa-local/fotorealista/jugadas-correcciones.json). Comando: `TUKI_RENDER_FIXTURE=vuelta,dispositivos200`, `TUKI_RENDER_OUTPUT=.qa-local/fotorealista/jugadas-correcciones.json`, `node qa/render/jugadas.mjs`.

La verificación integral se obtiene con `npm run verify:local`; su constancia en `.qa-local/verificaciones/<identidad>.json` comprueba la huella exacta de fuentes, dependencias y compilación. Incluye tipos, modelos, pruebas unitarias y físicas, compilación, E2E Chromium/Firefox, rendimiento de Actual con GPU real y aceptación Windows. No se rebajaron umbrales ni se modificaron las pruebas existentes de física o cámara.
