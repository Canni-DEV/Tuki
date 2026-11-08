# Calibración física de la campaña

Los ocho desafíos y la variante usan el perfil `mvp-1` con un paso de 1/120 s. Los montajes de referencia están en `qa/fixtures`. La campaña carga los escenarios de `src/data` y empieza con todas las piezas jugables en la bandeja. En `qa/taller.test.ts` cada referencia se reconstruye en un editor vacío, se verifican los circuitos instalados, se compara el saldo y se comprueba la victoria con un empujón.

| Montaje | Revisión del mapa | Piezas colocadas | Cables instalados | Paso de victoria | Paso final en reposo |
| --- | ---: | ---: | ---: | ---: | ---: |
| recta | 2 | 5 | 0 | 48 | 168 |
| s | 3 | 8 | 0 | 73 | 193 |
| rampa | 2 | 9 | 0 | 145 | 399 |
| taza-fichas | 2 | 12 | 0 | 156 | 276 |
| llave-abierta | 3 | 16 | 1 | 162 | 282 |
| vuelta | 2 | 11 | 0 | 217 | 337 |
| subibaja | 2 | 9 | 0 | 140 | 331 |
| puerta | 3 | 8 | 1 | 96 | 296 |
| puente | 3 | 24 | 1 | 238 | 462 |
| taza-mixta | 2 | 10 | 0 | 222 | 504 |
| bola-temprana | 3 | 17 | 1 | — | 857 |
| puente-tarde | 3 | 24 | 1 | — | 288 |
| taller100 | 1 | 100 | 4 | 121 | 241 |

Los grupos de cada montaje registran la primera activación causal de las piezas y el primer contacto de una bolita activa con sus guías. Los tiempos corresponden al montaje con los identificadores de la prueba. Las rutas alternativas se comprueban por su resultado físico.

- La cuna se puede colocar sobre la mesa, una tapa o el taco de 18 mm. La bolita puede soltarse con un golpe lateral.
- En la taza se comprueban la cadena frontal de doce dominós y dos recorridos que usan la canaleta. En uno se retira el embudo y la bolita entra por el extremo expuesto.
- En la llave, la rama corta despeja la compuerta. Con la rama larga, la bolita llega primero y acaba en la bandeja del desvío.
- En el subibaja se puede retirar la primera ficha receptora y girar el balancín a 84°. En el puente se puede dejar la palanca sin accionar y enlazar seis dominós alrededor de la isla.

La mesa de rendimiento incluye 100 objetos y cuatro conexiones entre dos mandos y dos receptores. A 1366 × 768 en una GeForce RTX 5070 Ti, el mínimo por ventana de un segundo fue de 142 FPS en Chrome 152 y 143 FPS en Firefox 159, con el montaje a velocidad normal.

Ejecutá `npm run test:run` para repetir la calibración, los casos de obstrucción y las pruebas de apoyos, cableado y migración. Las pruebas de Playwright ejercitan el mouse y la órbita sobre la compilación de navegador. Para el protocolo de rendimiento en Windows, ejecutá `node qa/windows/aceptacion.mjs --ampliacion`.
