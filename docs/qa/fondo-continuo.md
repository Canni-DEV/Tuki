# Fondo continuo de Tuki

22 de noviembre de 2026. Rama `codex/modo-fotorealista`; sin cambios en `main` ni publicación. La [guía técnica](../tecnica/fotorealista.md#fondo-continuo-por-tema) describe la paleta y la composición.

## Resultado visual y funcional

- Fondo verde en oscuro y marfil en claro, compartido por Default, Calidad y carga inicial. Las luces de las piezas, exposición, entornos de reflexión, nogal, geometrías y controles permanecen iguales.
- El suelo conserva profundidad y sombras. Su color coincide con el fondo sin sombras, de modo que su límite ya no dibuja una franja en perspectiva. La oclusión de pantalla utiliza su profundidad para los objetos; el suelo recibe sombras estables de las luces.
- El fondo se incluye en la escena de transmisión del vidrio. Las capturas de `vuelta` permiten revisar la bolita, las bandas, la madera del lanzador y los indicadores transparentes.
- Barrido de **984 poses**: recta/vuelta, Default/Alta/Equilibrada, claro/oscuro, ortográfica/perspectiva; ocho azimuts, cinco elevaciones de 12° a 85° y vista superior. Se conserva armado, centro y tamaño de encuadre durante la órbita.
- Comprobación adicional de **192 vistas a 12°**, midiendo tres columnas del fondo entre las filas 110 y 260: error máximo de **1 nivel RGB** respecto al gradiente, salto máximo entre filas de **1 nivel**. Las regiones medidas están libres de objetos y UI; esto no es una certificación de todos los píxeles de la escena.
- **20 alternancias** de visuales, tema y cámara: 29 texturas, 40 geometrías y 7 render targets al cerrar cada activación, sin crecimiento sostenido en estos contadores. No equivale a medir toda la memoria del proceso.
- Recarga de Calidad con descarga del módulo demorada 1,8 s, en ambos temas: **0 dibujos visibles de Default**, primer tiempo de animación **0 ms**, duración visible aproximadamente 1.500 ms frente a 1.490 ms previstos. Los píxeles muestreados de carga y escena coinciden exactamente. Se reutiliza la aprobación guardada.
- Se completaron recarga, portada y jugada real en ambos temas. Los candidatos WebGL2 r187 y WebGPU base, SSGI y SSR compilaron y conservaron el fondo; estos dos últimos continúan fuera del producto.
- La revisión final de 120 poses, tras fijar el suelo antes de los objetos en el orden de dibujo, volvió a pasar en ambas mesas y perfiles sin errores.

Evidencia local: [barrido y alternancias](../../.qa-local/fotorealista/fondo/validacion/informe.json), [horizonte](../../.qa-local/fotorealista/fondo/horizonte/informe.json), [carga y entrada](../../.qa-local/fotorealista/fondo/carga/informe.json), [laboratorio](../../.qa-local/fotorealista/fondo/laboratorio/informe.json).

## Comprobación breve de coste

RTX 5070 Ti, Edge con GPU real, viewport 1600 × 1000, `vuelta` en perspectiva, dibujo continuo en reposo: dos segundos de calentamiento y diez medidos por modo/tema, sin otras pruebas en paralelo. Calidad usa Alta con contacto. Se registra el intervalo entre cuadros y el envío CPU; no timestamps GPU.

El p95 de cuadro fue **7,1 ms antes y después** en los cuatro casos. No hubo intervalos mayores de 25 ms. La cadencia de aproximadamente 144 Hz limita esta comparación; no permite afirmar que el cambio acelere el renderer ni cuantificar el margen GPU restante.

| Modo / tema | p99 antes → después | Envío CPU p95 antes → después |
|---|---:|---:|
| Default / claro | 7,5 → 7,2 ms | 1,8 → 1,9 ms |
| Default / oscuro | 7,4 → 7,2 ms | 1,4 → 1,9 ms |
| Calidad / claro | 7,4 → 7,2 ms | 2,6 → 2,3 ms |
| Calidad / oscuro | 7,2 → 7,2 ms | 2,2 → 2,3 ms |

Son muestras breves, no una batería de rendimiento ni una prueba de ausencia de regresiones en otros equipos. [Antes](../../.qa-local/fotorealista/fondo/antes/informe.json), [después](../../.qa-local/fotorealista/fondo/despues/informe.json), [script local del sondeo](../../.qa-local/fondo-medicion.mjs).

## Regresiones

- Tipos de ambos paquetes y compilación de producción bajo `/Tuki/` aprobados.
- 68 pruebas unitarias de fondo, presentación, inicio y cámara aprobadas.
- 30 E2E de apariencia, cámaras y compatibilidad aprobados en Chromium/Firefox. Dos casos multitáctiles se omiten en Firefox por la restricción CDP ya existente; no se cambiaron sus condiciones ni umbrales.
- No se volvió a ejecutar la verificación integral del proyecto ni se midió hardware modesto para esta corrección.

[Informe E2E](../../.qa-local/fotorealista/fondo/e2e.json). Para repetir el barrido: `node qa/render/fondo.mjs`; `TUKI_FONDO_HORIZONTE=1` limita la ejecución a las 192 vistas de horizonte, y `TUKI_FONDO_FAST=1` usa 120 poses de ambas mesas. Los artefactos quedan ignorados por Git.
