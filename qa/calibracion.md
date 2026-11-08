# Calibración física de los desafíos

Perfil `mvp-1`. La curva usa la revisión 2 con el vasito de gres. La recta, el libro, la taza y su variante usan la revisión 1. Un paso dura 1/120 s. La tabla registra mediciones de la simulación con Rapier. Los tiempos de presentación y el rendimiento se miden en la compilación de navegador.

| Ajuste de prototipo | Motivo observado | Comprobación |
| --- | --- | --- |
| Base de cuna a la altura del libro → taco de 18 mm. Tope frontal de 2 → 1 mm. | A ras del libro la ficha presionaba la bola contra el tope y la cadena quedaba detenida. La elevación expone la esfera a un golpe lateral. | En libro y taza, la esfera descansa hasta el contacto y alcanza la rampa. Girar la rampa del libro de 90° a 140° desvía la esfera fuera de la mesa. |
| Borde inferior del cuello de 14 → 30 mm sobre la mesa. Boca del embudo de 32 → 48 mm. | El primer diseño dejaba menos de 16 mm útiles para la salida lateral de una esfera de ese diámetro sobre el canal. | El cuello conserva 22 mm de paso libre. El montaje mixto registra contactos sucesivos con embudo, canal y receptor. |
| Desnivel inicial de 18 mm → gradas de 25,5 y 26,5 mm en la taza. | La rampa necesita recoger la bola desde el libro alto y entregarla sobre la boca elevada. | Las doce fichas de la ruta lateral llegan a la misma meta que la ruta mixta. Todas las bases pasan la validación del editor. |
| Canal de la taza de 90 mm → tramo útil de 72 mm en la variante. Hoja a 44° y bandeja lateral. | La bola temprana necesita abandonar la canaleta al tocar la hoja, sin quedar aprisionada entre los labios. | Una rama de siete fichas despeja la hoja. Con ocho fichas y un recorrido más largo, la bola encuentra la hoja cerrada y termina dentro de la bandeja. |

| Montaje interno | Contactos observados | Paso de victoria | Paso final en reposo |
| --- | --- | ---: | ---: |
| Recta trazada | Cinco fichas entre la salida y la meta. | 48 | 168 |
| S de ocho | Primer dominó en el paso 5. Activación de la meta en el 63. | 73 | 193 |
| Descenso por rampa | Bola 23, rampa 49, primer dominó inferior 79. | 146 | 399 |
| Taza con fichas | Cruce de la primera grada 44, última grada 92, meta 127. | 159 | 279 |
| Taza mixta | Bola 29, rampa 48, embudo 80, canal 101, receptor 155, meta 202. | 221 | 504 |
| Llave abierta a tiempo | Bifurcación simultánea en el 12. Paleta 79, hoja despejada en el 91, receptor 106. | 150 | 452 |
| Bola temprana | Bifurcación en el 12. Hoja cerrada 101, paleta 112, desvío 113, bandeja 140. | — | 584 |

Los montajes comparten las reglas de colocación del editor y el saldo del desafío. Los dos de la llave conservan exactamente la misma rama de liberación, rampa y receptor. En la tercera solución de la taza, la bola entra por el extremo expuesto del canal y sobran el embudo y ocho dominós.

Para repetir las pruebas de geometría, restauración de la S, giro de la rampa, entrada expuesta y sincronización de las dos ramas, ejecutar `npm run test:run -- qa/montajes.test.ts`. Los archivos de `qa/fixtures` conservan las poses y los grupos de contactos esperados. Repetir los casos de las piezas afectadas después de cada ajuste de geometría o perfil.

## Ampliación de la campaña y taller

Los montajes de referencia se pueden cargar desde el editor de revisión. Las dos bolitas de los mecanismos tienen la masa del perfil original (6 g). Cada cuerpo articulado tiene su propio eje y sus propias piezas móviles.

| Montaje | Contactos decisivos en pasos de 1/120 s |
| --- | --- |
| A la vuelta | Con la canaleta alineada desde el inicio, la bola baja por la rampa en el paso 49, entra en la curva en el 76 y activa el péndulo en el 104. El péndulo golpea la primera ficha receptora en el 108. |
| El subibaja | Con el subibaja alineado a 90°, la primera bola golpea la cazoleta en el paso 65. El brazo lanza la segunda bola en el 66 y esta golpea la primera ficha del libro de 18 mm en el 79. |
| El puente a tiempo | La segunda bola entra en la curva en el 123. El péndulo acciona el pestillo en el 148 y la bola alcanza la fila de llegada en el 239. |
| Puente tardío | El mismo nivel admite otra colocación. La segunda bola toca la bandeja en el 147 y el pestillo se activa en el 152. |
| Taller de cien objetos | La meta se activa en el 107. La cadena sigue hacia dos péndulos independientes en el 114 y el 118. |

`npm run test:run` comprueba la reconstrucción desde las piezas iniciales, las variantes, los apoyos editables y las dos instancias de cada cierre. Para medir la compilación en Chrome y Firefox a velocidad normal y lenta, ejecutar `node qa/windows/aceptacion.mjs --ampliacion`. El informe incluye FPS por intervalo de un segundo, tamaño del viewport y adaptador gráfico efectivo.

En «El subibaja» también se puede sacar la primera ficha receptora y girar el balancín a 84°. La bolita alcanza directamente la segunda ficha desplazada hacia el costado. En «El puente a tiempo» existe una solución de una sola rama. Tres dominós enlazan el último escalón con la isla por el costado y el golpe llega a la meta en el paso 206. Las dos rutas se verifican desde el editor en `qa/taller.test.ts`.
