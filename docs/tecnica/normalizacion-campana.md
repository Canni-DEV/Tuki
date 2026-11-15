# Normalización de la campaña

Revisión del 15 de noviembre de 2026. Se conservan los 16 desafíos de campaña, la variante La llave de paso, sus identificadores, orden, desbloqueos y mecánicas principales. Las alturas, los apoyos, la decoración y las referencias de solución se ajustaron a piezas completas del catálogo. Rige la [guía de diseño](diseno-de-niveles.md).

## Resultado por nivel

La última columna indica victorias sobre 24 ajustes válidos de 2 mm o 2°. El mínimo de aceptación es 22. Los objetos instalados incluyen inicio, meta y mecanismos; no incluyen la mesa ni las piezas del jugador.

| Nivel | Revisión | Objetos instalados | Composición y ajuste | Tolerancia |
| --- | ---: | ---: | --- | ---: |
| La recta | 3 | 2 | Mesa compacta despejada; se conserva la introducción a la fila. | 24/24 |
| La curva | 4 | 3 | Vaso completo como obstáculo y espacio para el recorrido curvo. | 22/24 |
| Del libro a la mesa | 3 | 6 | Atlas grande, estuche, cuaderno y portalibros; descenso desde un apoyo real. | 23/24 |
| Alrededor de la taza | 3 | 8 | Atlas, libros individuales y taza; se conservan la fila y la variante mixta. | 22/24 |
| A la vuelta | 3 | 5 | Atlas y dos libros completos para la bajada, el codo y el retorno. | 24/24 |
| La bajada de los libros | 2 | 15 | Cajas y libros apilados por separado; alturas reales y uniones de canaletas calibradas. | 23/24 |
| El subibaja | 3 | 5 | Dos cajas cúbicas grandes y un libro; se ajustó la recepción de la segunda bola. | 22/24 |
| La bandera arriba | 2 | 9 | Dos pilas de libros individuales; conserva el lanzamiento hacia la meta elevada. | 24/24 |
| Por encima de la taza | 2 | 7 | Pilas reales y taza central; se conserva el vuelo y la recepción. | 24/24 |
| La puerta del estuche | 4 | 6 | Atlas y estuche a escala; botón y bisagra conservan su espacio de movimiento. | 23/24 |
| El disparo a tiempo | 2 | 31 | Libros y cajas de grapas individuales; la señal llega después de capturar la bola. | 24/24 |
| El puente a tiempo | 4 | 31 | Paquetes, cajas y libros; pedestal del puente y recepción más baja con resguardos físicos. | 22/24 |
| Esperá al puente | 2 | 43 | Pilas de libros y cajas de grapas; alturas reales para el retenedor y el puente. | 23/24 |
| Dos saltos | 2 | 10 | Libros completos en distintos apoyos; se ajustaron taco y placa para la doble transferencia. | 22/24 |
| El contrapeso | 2 | 17 | Libros individuales y caja de útiles; se conserva la elevación y la entrega final. | 24/24 |
| La mesa del mate | 2 | 21 | Pava, yerbera, mate, caja de té, estuche y pilas reales; se conserva la secuencia B–A–C. | 24/24 |
| La llave de paso | 4 | 13 | Taza, atlas y libros completos; se mantiene la apertura antes del paso de la bola. | 22/24 |

La llegada del puente usa una ficha receptora más baja que la canaleta: la bola la golpea por encima de su centro. Las cajas laterales y el pedestal cierran el antiguo rodeo de la isla. La solución principal requiere la segunda bola y el circuito del puente. La alternativa sigue usando ese mecanismo.

## Pruebas reproducibles

`qa/normalizacion.test.ts` comprueba, para cada uno de los 17 mapas:

- Catálogo, motivo, apoyos, colisiones y equilibrio del escenario instalado.
- Victoria de la referencia y derrota de la instalación sin piezas del jugador.
- Reconstrucción en el Taller con los mismos pasos, eventos y poses finales.
- Diez ejecuciones idénticas y una reproducción lenta.
- Una variante válida de la solución y una derrota al retirar un componente imprescindible o el circuito.
- Una matriz fija de 24 colocaciones válidas, desplazando una pieza 2 mm en X/Z o girándola 2°. Los apoyados acompañan el movimiento de su soporte. Las propuestas que incumplen las reglas de colocación se descartan antes de simular, y se continúa hasta reunir 24 válidas.

`qa/taller.test.ts`, `qa/secuencias.test.ts` y `qa/campana-dispositivos.test.ts` agregan los fallos de sincronización, el puente tardío, la bola temprana, el orden de palancas, los atajos conocidos y las uniones del descenso. Las variantes no implican que todos los mapas tengan dos recorridos completamente distintos.

Los desafíos de autor se verifican en `qa/desafios.test.ts` y `qa/e2e/desafios.spec.ts`: huella física, inventario, objetos bloqueados, cableado opcional, revalidación al importar, progreso independiente, copia de campaña sin referencia, migración v5 y cancelación del worker.

Comandos de comprobación:

```powershell
npm run typecheck
npm run test:run
node art/verify_models.mjs
npm run build -- --base=/Tuki/
npm run test:e2e
$env:TUKI_PERF='1'
$env:TUKI_HEADED='1'
npm run test:e2e -- qa/e2e/rendimiento-dispositivos.spec.ts
```

La tolerancia mide esta matriz reproducible; no garantiza cualquier desplazamiento posible. La comprobación visual y las mediciones de rendimiento complementan la simulación física. Los FPS se miden con reloj real, ventanas visibles y aceleración de la GPU, sin otras suites simultáneas; dependen del equipo y no se deducen del reloj controlado de las pruebas funcionales.

## Cierre de validación

Se aprobaron el chequeo de TypeScript, la compilación de producción, 341 pruebas unitarias y la verificación de 62 modelos GLB. La revisión visual produjo 68 capturas: los 17 escenarios en escritorio y móvil, con tema claro y oscuro, sin errores de JavaScript ni extremos fuera del encuadre. Se revisaron además el formulario de autoría y la biblioteca en ambos tamaños.

El consolidado de navegador es de 164 pruebas funcionales aprobadas (85 en Chromium y 79 en Firefox), más cuatro mediciones de rendimiento. La pasada completa detectó dos expectativas antiguas por navegador: el número de piezas del catálogo y la versión del armado interno, que sigue siendo v5 aunque el documento de mesa es v6. Tras corregirlas, los cuatro casos pasaron en un cierre dirigido sobre la misma compilación. Se omiten seis casos táctiles específicos de Firefox de escritorio por limitaciones de CDP/BiDi; esos gestos sí se verificaron en Chromium.

Medición en Windows 11 Pro, Core Ultra 7 265, RTX 5070 Ti, 63 GiB de RAM y viewport 1366 × 768:

| Navegador | 100 objetos: FPS mínimo | 200 objetos: FPS mínimo |
| --- | ---: | ---: |
| Chromium 158.0.8127.18 | 140 | 122 |
| Firefox 160.0 | 138 | 99 |

Las cuatro mediciones superan el umbral de 30 FPS. El [registro de validación](../qa/normalizacion-validacion.json) conserva la huella de la compilación, las muestras de FPS y los resultados por nivel.

Se corrigió además el contraste de «Mis desafíos»: su fondo crema fijo coincidía con el texto del tema oscuro. El panel usa ahora los colores, el borde y la sombra del tema. La regresión de navegador falló antes del ajuste y pasó después en Chromium y Firefox, comprobando contraste mínimo 4,5:1 en ambos temas, escritorio y móvil, con la biblioteca vacía y con un desafío guardado. Esta corrección de CSS es posterior a la compilación usada para las mediciones de FPS anteriores.
