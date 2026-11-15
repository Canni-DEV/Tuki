# El laberinto

Variante opcional de **La curva**, identificada como `curva-laberinto`, revisión 1 y perfil `dispositivos-1`. Ganar La curva abre tanto Del libro a la mesa como esta variante. La campaña mantiene sus 16 posiciones y su siguiente desafío; la variante registra una victoria independiente, sin premios de piezas. Los guardados existentes que contienen `curva` ya permiten jugarla.

## Diseño construido

La mesa cuadrada de 90 × 90 cm contiene 46 objetos instalados: inicio, meta, 40 estuches y cuatro cajas cúbicas. Todos son piezas completas del catálogo, sin escalas especiales ni paredes invisibles. Con las 100 fichas disponibles, el máximo es de 146 objetos, por debajo del límite de 200.

La primera decisión está en la entrada. Seguir la dirección inicial lleva a una serpentina larga; doblar permite tomar un corredor lateral y entrar en las tres últimas calles. El corredor corto termina en una barrera visible, de modo que también requiere recorrer dos retornos de 180°. Incluye además dos curvas de 90° en el acceso. Los bordes superior, inferior y derecho cierran los rodeos exteriores. El empujón y el criterio de victoria son los habituales.

El esquema conceptual inicial se ajustó durante el armado: el mapa construido concentra la decisión de distancia en una bifurcación y dedica el resto a ejecutar las curvas. Los estuches tienen 6 cm de ancho y no ofrecen una superficie de colocación superior; su altura moderada permite leer los pasillos desde la cámara. La copia al Taller conserva exactamente estos objetos y sus apoyos.

## Inventario y evidencia física

El inventario se fijó después de probar los recorridos. Las 100 fichas son un presupuesto de juego, no una cantidad que el jugador esté obligado a utilizar. Las longitudes siguientes corresponden a las líneas centrales de QA, no a mínimos matemáticos de cualquier armado posible.

| Armado | Fichas del jugador | Resultado |
| --- | ---: | --- |
| Corto, trazado completo con el editor | 94 | Victoria; seis de sobra |
| Corto, cuatro trazos unidos | 92 | Victoria; ocho de sobra |
| Corto, colocación alternativa a 2,65 cm | 96 | Victoria |
| Rodeo, trazado estándar hasta agotar inventario | 100 | Cadena detenida antes de la meta |
| Rodeo completo a 4 cm, inventario de control ampliado | 145 | Victoria |
| Rodeo con rectas a 5,5 cm y curvas a 4 cm, inventario de control ampliado | 113 | Victoria |
| Rodeo con intervalos uniformes de 5,8; 5,9; 6 y 6,2 cm | 100 o menos | Cadena detenida |
| Rodeo con exactamente 100 fichas y mayor densidad en curvas | 100 | Cadena detenida en las cuatro distribuciones ensayadas |

El trazado corto mide aproximadamente 2,5705 m; la serpentina completa, 5,8187 m. La separación automática sigue siendo de 2,7 cm. Las pruebas también permiten colocación manual: no se agregó una restricción de distancias ni un detector de ruta ganadora. Las pruebas de ahorro cubren familias concretas de armados; no constituyen una búsqueda exhaustiva de todas las soluciones físicas posibles.

## Integración

- `src/data/curva-laberinto.json` contiene el escenario y su inventario.
- `Nivel.varianteDe` vincula cada variante con su desafío principal. La llave de paso usa el mismo mecanismo.
- `levels.ts` separa `campana` y `variantes`; selector, encabezado y estaciones de cámara usan ese registro. El selector muestra la condición opcional, el inventario de dominós y su estado completado.
- El editor reutiliza las superficies de apoyo durante cada cálculo del trazo. Las fichas de la previsualización no generan apoyos nuevos; las colisiones y el suavizado conservan las mismas reglas.
- `qa/laberinto.ts` define las rutas de control fuera del juego. Los armados ganadores están en `qa/fixtures/laberinto*.json`.

## Verificación reproducible

La matriz de normalización incorpora la nueva variante: escenario estable, instalación que no gana sola, reconstrucción en el Taller, diez repeticiones idénticas, reproducción lenta, solución alternativa, fallo al quitar dos fichas y 24 perturbaciones válidas. Las pruebas específicas agregan 24 ajustes de posición y giro distribuidos entre las cuatro curvas, con el umbral editorial de al menos 22 victorias.

Las pruebas de navegador cubren acceso opcional, progreso tras recargar, conservación del siguiente desafío, copia al Taller sin solución, un trazo real completo con mouse, deshacer y vistas de escritorio/móvil en ambos temas. El ensayo de rendimiento usa reloj real y se ejecuta separado de otras suites.

```powershell
npm run typecheck
npm run test:run
node art/verify_models.mjs
npm run build -- --base=/Tuki/
npx playwright test qa/e2e/laberinto.spec.ts qa/e2e/navegacion.spec.ts qa/e2e/controles.spec.ts
$env:TUKI_PERF='1'
$env:TUKI_HEADED='1'
npx playwright test qa/e2e/laberinto.spec.ts -g 'rendimiento real'
```

Las mediciones de FPS dependen del equipo y del modo de ejecución. Los resultados de Playwright incluyen capturas y adjuntos de rendimiento para revisar cada pasada.

### Resultado de la revisión 1

El cierre del 15 de noviembre de 2026 aprobó tipos, compilación de producción y los 62 modelos GLB. La suite completa aprobó 356 pruebas; el cierre dirigido agregó la prueba de cuatro trazos, para 357 comprobaciones unitarias y físicas. En navegador se aprobaron 29 comprobaciones funcionales entre Chromium y Firefox. Se omitió el gesto multipuntero de Firefox, como en la suite de navegación existente. Se revisaron las capturas en ambos temas y tamaños.

Con una RTX 5070 Ti, viewport 1366 × 768, reloj real, ventanas visibles y ninguna otra suite ejecutándose:

| Navegador | Versión | FPS mínimo de la cadena |
| --- | --- | ---: |
| Chromium | 158.0.8127.18 | 143 |
| Firefox | 160.0 | 139 |

La primera medición de Chromium sin ventana utilizó SwiftShader y dio 3–5 FPS; por eso se repitió con la GPU, según el protocolo. Esa pasada por software no se presenta como rendimiento con aceleración gráfica.
