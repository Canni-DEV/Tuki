# Controles del editor y catálogo del taller

Taller, campaña y desafíos importados usan las mismas acciones para teclado y botones. La disponibilidad depende de la fase, la validación pendiente, los permisos y el inventario; no de que el nivel sea una mesa libre. Solo lectura permite cámara y prueba, sin editar.

## Acceso a piezas

En el taller hay nueve lugares persistentes, independientes de cada mesa: dominó, bolita, taco, rampa, canaleta, embudo, libro, inicio y meta. `favoritosTaller` es una preferencia opcional de `tuki.progreso.v2`; las preferencias anteriores reciben esos valores iniciales. Los lugares vacíos, agotados y bloqueados conservan su número. Asignar una pieza a otro lugar la mueve, sin duplicarla. No se modifica ningún documento de mesa o desafío.

T o «Piezas» abre el catálogo del taller: búsqueda por nombre/categoría sin tildes ni distinción de mayúsculas, categorías del catálogo compartido, medidas, desbloqueos y personalización. Conserva filtros y desplazamiento hasta cambiar de mesa. Desde 960 × 600 px aparece lateral y puede fijarse para editar sin cerrarlo; por debajo usa un panel inferior. Los controles y el desplazamiento quedan dentro del viewport visual, incluso con teclado virtual. Un clic exterior en un catálogo modal solo lo cierra. El panel fijado permite interacción con la mesa.

Los desafíos conservan la numeración de su inventario. Hasta nueve tipos usan la rueda o la cuadrícula táctil existente; con más tipos usan el catálogo buscable. Solo se asignan atajos del 1 al 9.

## Edición

- Flechas: 2 mm según la cámara; Mayús: 0,5 mm. Se conserva la altura y se validan apoyos, colisiones y equilibrio, incluida la pila dependiente.
- Q/E: 15°; Mayús: 1°. El giro funciona también sobre la plantilla antes de colocar. «Ajustar» ofrece equivalentes táctiles.
- F: trazar; Supr: retirar; Ctrl/Cmd+Z: deshacer; Ctrl/Cmd+Mayús+Z o Ctrl+Y: rehacer.
- Ctrl/Cmd+D: copiar tipo, giro y configuración de una pieza editable a una colocación única. No copia IDs, contactos, cables, secuencias ni dependientes. El original sigue participando en colisiones y apoyos. No duplica inicio/meta ni excede existencias o el cupo global.
- «Colocar varias» es exclusivo del taller, inicialmente apagado. Cada colocación es una acción; conserva la plantilla mientras haya disponibilidad. Escape termina la herramienta y empezar una prueba desactiva el modo.
- Espacio: probar o volver a editar con cámara y armado restaurados. En una victoria de campaña mantiene el avance al siguiente desafío. No se repiten acciones por mantener pulsada una tecla.

El historial contiene armado y selección. Una confirmación válida añade una sola entrada y vacía el futuro; una validación rechazada o cancelada conserva ambas pilas. Rehacer restaura estados ya validados, incluidos cables, secuencias e inventario. Cargar un documento reinicia el historial; probar y volver a editar lo conservan. Las respuestas tardías del worker se descartan con la revisión del gesto.

## Verificación

`qa/historial.test.ts` cubre ambos caminos de confirmación, cancelación del worker, filas, pilas y circuitos. `qa/favoritos.test.ts` verifica compatibilidad y estabilidad de lugares. `qa/e2e/taller-controles.spec.ts` recorre el catálogo, persistencia, duplicación configurada, repetición, cámara y ajuste táctil. Las suites de controles de campaña continúan comprobando rueda, foco, gestos y atajos.

Ejecutar tipos, pruebas unitarias, compilación con `/Tuki/` y Playwright en Chromium y Firefox. Revisar ambos temas y 1366 × 768, 390 × 844, 320 × 640 y 844 × 390. El límite sigue siendo 200 objetos y los archivos conservan sus versiones y perfil físico.
