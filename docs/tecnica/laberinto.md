# El laberinto — Ordenando la mesa

Variante opcional de **La curva**, identificada como `curva-laberinto`, revisión 2 y perfil `dispositivos-1`. Ganar La curva abre tanto Del libro a la mesa como esta variante. La campaña mantiene sus 16 posiciones; la variante registra una victoria independiente, sin premios de piezas. Su acceso, progreso y copia al Taller conservan el mecanismo existente.

## Composición

La revisión 2 reemplaza la serpentina de estuches por el concepto aprobado «Ordenando la mesa». La mesa cuadrada de 90 × 90 cm contiene 36 objetos instalados: inicio, meta y 34 objetos domésticos de 16 tipos. Combina libros, atlas, cajas, un estuche, pava, mate, yerbera, vasos, posavasos y servilletero. Las orientaciones irregulares, las siluetas redondas y las pilas separan pequeños grupos; no hay filas de paredes repetidas ni un marco artificial.

Cada objeto conserva sus dimensiones y colisiones de catálogo. Las pilas tienen piezas individuales y apoyos explícitos. La pila central alcanza 6 cm: una ficha que cae desde el tablero no puede activar directamente una ficha apoyada arriba. Las demás superficies siguen disponibles conforme a las reglas normales del juego. No se agregó un detector de ruta, paredes invisibles ni restricciones especiales de colocación.

Inicio y meta están en huecos interiores. El camino de control atraviesa el centro, rodea la pila y cambia de dirección alrededor del mate. Los dos rodeos de control pasan por los laterales y las cajas de arriba. La disposición deja bifurcaciones y puntos de reencuentro; no dibuja ni señala la solución. Las rutas de QA son ejemplos reproducibles, no mínimos matemáticos ni una enumeración de todas las soluciones posibles.

## Inventario y calibración

El inventario final es de **42 dominós**. Mantener los 100 originales permitiría completar ambos rodeos con el trazado automático. La cantidad se ajustó al tamaño real del nuevo escenario y a su recorrido central. Con todo el inventario colocado hay 78 objetos, por debajo del límite de 200.

| Armado de control | Fichas del jugador | Resultado |
| --- | ---: | --- |
| Centro, un trazo completo del editor | 39 | Victoria; tres de sobra |
| Centro, tres trazos unidos | 38 | Victoria; cuatro de sobra |
| Centro, separación alternativa de 2,65 cm | 40 | Victoria |
| Centro, colocación manual a 3,5 cm | 30 | Victoria; el ahorro manual sigue siendo válido |
| Izquierda, trazado con inventario normal | 42 | Se agota antes de completar el recorrido; cadena detenida |
| Derecha, trazado con inventario normal | 42 | Se agota antes de completar el recorrido; cadena detenida |
| Izquierda, trazado con inventario de control ampliado | 71 | Victoria |
| Derecha, trazado con inventario de control ampliado | 68 | Victoria |
| Izquierda, separación manual de 4 cm con inventario ampliado | 48 | Victoria |
| Derecha, separación manual de 4 cm con inventario ampliado | 46 | Victoria |
| Cada rodeo con exactamente 42 fichas, seis distribuciones entre rectas y curvas | 42 | Los doce controles se detienen |
| Cada rodeo con tres separaciones uniformes que entran en el inventario | ≤42 | Los seis controles se detienen |

Los recorridos medidos son aproximadamente 1,0984 m (centro), 1,9751 m (izquierda) y 1,8886 m (derecha). El trazado automático conserva su separación habitual de 2,7 cm. No se modificaron la física, el empujón ni la herramienta de trazado.

Los controles positivos con inventario ampliado comprueban que los rodeos son transitables: su fallo con el presupuesto normal no depende de una curva imposible. Las pruebas de ahorro manual cubren distribuciones concretas; no demuestran que cualquier armado imaginable por un jugador experto vaya a fallar. Se conserva la libertad de encontrar soluciones más eficientes.

## Integración y comprobación

- `src/data/curva-laberinto.json`: escenario, apoyos, cámara e inventario.
- `qa/laberinto.ts`: tres recorridos independientes del juego, curvas redondeadas y muestreo para controles manuales.
- `qa/fixtures/laberinto*.json`: referencia trazada y colocación alternativa para la revisión 2.
- `qa/laberinto.test.ts`: presupuesto, rodeos transitables, intentos de ahorro, trazos separados, atajos directos y 24 perturbaciones de posición/giro distribuidas entre las curvas.
- `qa/normalizacion.test.ts`: estabilidad, reconstrucción exacta en el Taller, diez repeticiones idénticas, reproducción lenta, alternativa, fallo por retirada y otras 24 perturbaciones válidas.
- `qa/e2e/laberinto.spec.ts`: acceso opcional, progreso, copia sin solución, gesto real de trazado, deshacer y capturas de escritorio/móvil en ambos temas.

```powershell
npm run typecheck
npm run test:run
npm run build -- --base=/Tuki/
npx playwright test qa/e2e/laberinto.spec.ts
```

La revisión anterior (estuches, 100 fichas) y sus mediciones de rendimiento ya no describen este layout. La medición opcional de FPS continúa disponible con `TUKI_PERF=1`; debe ejecutarse con GPU, reloj real y sin otras suites simultáneas.

### Cierre de la revisión 2 — 15 de noviembre de 2026

Tipos y compilación de producción aprobados. La suite completa aprobó 369 pruebas en 17 archivos. Después de separar las dependencias de Node del helper de recorridos, se repitieron y aprobaron sus 26 pruebas. En navegador se aprobaron seis pruebas funcionales entre Chromium y Firefox, incluido el gesto de mouse que completa el nivel con tres fichas de sobra. Se revisaron las capturas de escritorio y móvil en ambos temas. Los dos ensayos opcionales de rendimiento quedaron omitidos; no se atribuyen a esta revisión los FPS de la anterior.
