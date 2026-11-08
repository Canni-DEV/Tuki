# Calibración física de los desafíos

Perfil `mvp-1`. La curva usa la revisión 2 con el vasito de gres. La recta, el libro, la taza y su variante usan la revisión 1. Un paso dura 1/120 s. La tabla registra mediciones de la simulación con Rapier. Los tiempos de presentación y el rendimiento se miden en la compilación de navegador.

| Ajuste de prototipo | Motivo observado | Comprobación |
| --- | --- | --- |
| Base de cuna a la altura del libro → taco de 18 mm. Tope frontal de 2 → 1 mm. | A ras del libro la ficha presionaba la bola contra el tope y la cadena quedaba detenida. La elevación expone la esfera a un golpe lateral. | En libro y taza, la esfera descansa hasta el contacto y alcanza la rampa. Girar la rampa del libro de 90° a 140° desvía la esfera fuera de la mesa. |
| Borde inferior del cuello de 14 → 30 mm sobre la mesa. Boca del embudo de 32 → 48 mm. | El primer diseño dejaba menos de 16 mm útiles para la salida lateral de una esfera de ese diámetro sobre el canal. | El cuello conserva 22 mm de paso libre. El montaje mixto registra contactos sucesivos con embudo, canal y receptor. |
| Desnivel inicial de 18 mm → gradas de 25,5 y 26,5 mm en la taza. | La rampa necesita recoger la bola desde el libro alto y entregarla sobre la boca elevada. | Las doce fichas de la ruta lateral llegan a la misma meta que la ruta mixta. Todas las bases pasan la validación del editor. |
| Canal de la taza de 90 mm → tramo útil de 72 mm en la variante. Hoja a 44° y bandeja lateral. | La bola temprana necesita abandonar la canaleta al tocar la hoja, sin quedar aprisionada entre los labios. | Una rama de siete fichas despeja la hoja. Con ocho fichas y un recorrido más largo, la bola encuentra la hoja cerrada y termina dentro de la bandeja. |

| Montaje interno | Contactos observados | Desenlace y paso |
| --- | --- | --- |
| S de ocho | Primer dominó en el paso 5. Activación de la meta en el 50. | Victoria, 60 |
| Descenso por rampa | Bola 23, rampa 49, primer dominó inferior 79. | Victoria, 146 |
| Taza con fichas | Cruce de la primera grada 44, última grada 92, meta 127. | Victoria, 159 |
| Taza mixta | Bola 29, rampa 48, embudo 80, canal 101, receptor 155, meta 202. | Victoria, 221 |
| Llave abierta a tiempo | Bifurcación simultánea en el 12. Paleta 79, hoja despejada en el 91, receptor 106. | Victoria, 150 |
| Bola temprana | Bifurcación en el 12. Hoja cerrada 101, paleta 112, desvío 113, bandeja 140. | Cadena detenida, 584 |

Los montajes comparten las reglas de colocación del editor y el saldo del desafío. Los dos de la llave conservan exactamente la misma rama de liberación, rampa y receptor. En la tercera solución de la taza, la bola entra por el extremo expuesto del canal y sobran el embudo y ocho dominós.

Para repetir las pruebas de geometría, restauración de la S, giro de la rampa, entrada expuesta y sincronización de las dos ramas, ejecutar `npm run test:run -- qa/montajes.test.ts`. Los archivos de `qa/fixtures` conservan las poses y los grupos de contactos esperados. Repetir los casos de las piezas afectadas después de cada ajuste de geometría o perfil.
