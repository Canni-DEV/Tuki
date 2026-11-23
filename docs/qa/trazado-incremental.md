# Trazado: inicio visible y respuesta incremental

Verificación local del 23 de noviembre de 2026. Se conserva el arrastre libre, sin imán, con separación de 27 mm y regreso a Seleccionar al soltar. La ficha transparente y su centro aparecen antes del clic; en táctil aparecen al tocar. El centro inicial no se adelanta para encontrar apoyo.

## Cálculo

Comparación con `d0ee1af8b5c9c120f8b296a8aa4d4f71d9a8f057`, usando `node qa/medir-trazo-incremental.mjs --ref d0ee1af8b5c9c120f8b296a8aa4d4f71d9a8f057`. Ocho escenarios: recta y curva, con 0, 100, 150 y 190 objetos. Cada recorrido tiene 250 muestras y 249 actualizaciones. Se comparan piezas y motivos en cada prefijo. La sesión incremental se mide durante 30 recorridos después de cinco de calentamiento.

| Objetos | Curva: cálculo completo anterior, p95 | Curva: actualización incremental, p95 |
| --- | ---: | ---: |
| 0 | 4,51 ms | 0,049 ms |
| 100 | 10,55 ms | 0,048 ms |
| 150 | 13,80 ms | 0,044 ms |
| 190 | 5,99 ms | 0,036 ms |

Todas las posiciones y motivos de esos recorridos coinciden con el código anterior. La preparación inicial del contexto quedó por debajo de 0,8 ms. Ninguna actualización incremental superó 50 ms; el mayor valor observado fue 4,42 ms. Con 190 objetos, el recorrido alcanza antes el límite de fichas disponibles. Estos números miden CPU; no representan FPS ni latencia de pantalla. Las reglas de inicio inválido se verifican por separado porque el cambio intencional es no adelantar la primera ficha.

Informe con metodología y resultados: `.qa-local/trazado-incremental.json`.

## Respuesta en navegador

Equipo: Windows 11 Pro, Intel Core Ultra 7 265, NVIDIA RTX 5070 Ti, viewport 1366 × 768. Se inyectan cuatro muestras por lote y se mide desde la entrada hasta `onAfterRender` de Three.js, con GPU real. Cada recta y curva contiene 60 lotes; se descartan los primeros cinco para el percentil. La medición llega al envío del cuadro, no al barrido físico de la pantalla.

| Navegador | Escenarios | Mayor p95 | Mayor actualización medida tras calentamiento |
| --- | --- | ---: | ---: |
| Edge/Chromium 158.0.4370.33 | 0, 100, 150 y 190 objetos; recta y curva | 15,6 ms | 19,8 ms |
| Firefox 159.0 | 0, 100, 150 y 190 objetos; recta y curva | 16 ms | 20 ms |

Se cumple el objetivo de p95 ≤ 33 ms en este equipo. No se extrapola a teléfonos ni equipos de menor capacidad. Chrome no está instalado; la comprobación Chromium con GPU real utiliza Edge. Informe Chromium: `.qa-local/trazado-rendimiento-edge.json`.

Para repetir: ejecutar `qa/e2e/rendimiento-trazado.spec.ts` con `TUKI_PERF=1`, sin otras baterías simultáneas. `TUKI_CHROME` admite la ruta del Chromium instalado. La suite habitual no ejecuta este benchmark ligado al hardware.

## Cobertura funcional

Las pruebas unitarias cubren restauración incremental de curvas y juntas, extremos inválidos provisionales, inicio exacto, orientación corregible, invalidación por cambios de armado y conservación de las muestras al cancelar o soltar antes del siguiente cuadro. La batería completa de 35 archivos pasó con 551 pruebas.

Las pruebas de navegador cubren referencia previa en ambos temas, clic sin arrastre, Escape, curva coalescida y coordenadas finales de liberación, filas entre libros, pasos de 2 mm, corrección de rutas, puentes y controles de cámara. La matriz de trazado, controles, cámara y navegación tiene 60 casos ejecutables y cuatro omisiones por falta de transporte multipuntero en Firefox: 59 pasaron en la primera ejecución y el restante pasó al corregir su transporte de prueba. Informes: `.qa-local/trazado-funcional.json` y `.qa-local/trazado-tactil.json`.

La comprobación táctil usa eventos CDP de Chromium y verifica la referencia a 320 × 640 y 844 × 390, cancelación con dos dedos, cinco fichas colocadas, saldo, salida de la herramienta y victoria. Se reprodujo también en el código anterior la omisión del clic inmediatamente posterior a un arrastre inyectado por CDP en Windows. Para aislar el trazado, el ensayo conserva los gestos de dibujo táctiles y activa los botones de cámara/simulación con mouse. No certifica esa combinación como una sesión íntegramente táctil. La sesión con personas en dispositivos táctiles reales queda pendiente.

La prueba de Calidad/WebGPU pasó en Edge con GPU real: referencia inicial, siluetas durante el arrastre, confirmación y deshacer en claro y oscuro. Se inspeccionaron las capturas de ambos modos gráficos y de la referencia táctil. Informe: `.qa-local/trazado-calidad.json`; capturas en `.qa-local/trazado-calidad/`. Los tipos, la compilación con `/Tuki/` y la revisión de espacios del diff también pasaron.

El verificador de pre-push ejecuta esta comprobación de Calidad en una etapa propia de Chromium con GPU real; la excluye de la matriz funcional sin GPU para evitar una omisión artificial. La etapa valida su informe y forma parte de la constancia completa.
