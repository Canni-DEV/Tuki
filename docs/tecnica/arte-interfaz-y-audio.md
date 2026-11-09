# Producción 3D, interfaz y audio

En el desafío de la taza, el jugador necesita ver dónde apoya una ficha, si el embudo descarga sobre el canal y si la bandera queda al alcance de la última pieza. Usar esas tres lecturas para revisar una exportación, elegir la cámara y ajustar el contraste. El concepto A fija el carácter de la madera pintada y de la luz. Las láminas de juego fijan composición, controles e inventarios. [Concepto A](../arte/referencias/concepto-a.png) · [Mesa y piezas](../arte/mesa-y-piezas.md)

## De Blender a la mesa

1. **Preparar el activo.** Conservar los originales editables en Blender y producir un GLB reutilizable por tipo de activo. Modelar en sistema métrico, una unidad por metro. Usar +Z vertical en Blender y −Y local hacia la salida o sentido de caída. Aplicar rotación y escala de modelado. Exportar glTF 2.0 binario con conversión a +Y vertical. El juego recibe +Z como dirección de avance. [Exportador glTF de Blender](https://github.com/KhronosGroup/glTF-Blender-IO)
2. **Fijar el pivote.** En dominós, obstáculos, libros y taza situarlo en el centro del pie. En la mesa, en el centro de la tapa. En la rampa y el embudo, en el plano de sus pies. En la bola, en el centro de la esfera. La paleta tiene el origen en la bisagra y la hoja en el inicio de su carrera. Hacer visibles la boca, el cuello y los dos extremos del canal desde la cámara de revisión.
3. **Acordar la geometría.** El catálogo de piezas es dueño de medidas, desplazamientos de los colisionadores, huellas, zonas de apoyo y anclajes de entrada y salida. Arte usa esas medidas al modelar. Diseño coloca las instancias en el JSON del nivel. La base plana, la pendiente y la abertura interior del embudo deben coincidir en los tres usos. La textura de puntos y los biseles pequeños son visuales.
4. **Exportar y revisar.** Empaquetar mallas, materiales y texturas en el GLB. Reservar nodos separados para paleta y hoja. Cargar con `GLTFLoader` y clonar las instancias conservando materiales y geometrías compartidos. Variar los puntos del dominó por instancia o por material de cara. Para revisar escala y pivote, superponer en desarrollo las aristas de los colisionadores, las huellas y los ejes. Soltar una bola por el cuello y girar la rampa 90° sobre su apoyo. [GLTFLoader de Three.js](https://threejs.org/docs/pages/GLTFLoader.html) · [Lámina de piezas y apoyos](../arte/laminas/piezas.png)

## Cámara, luz y materiales

| Revisión | Implementación y observación a tamaño de juego |
| --- | --- |
| Apertura de desafío | Usar cámara ortográfica. Medir azimut desde +Z hacia +X y elevación desde el plano de la mesa. Partir de 35° de elevación. Ajustar objetivo y alto visible por nivel. En la taza deben verse flecha inicial, lateral de la pila, canaleta y pie de la meta. [Encuadres iniciales](../arte/laminas/encuadres.png) |
| Inspección | Botón derecho para orbitar alrededor del objetivo y rueda para acercar. «Vista superior» mira perpendicularmente la mesa con −Z hacia arriba en pantalla. «Ver mesa» restituye el objetivo, los ángulos y el zoom de apertura. Ambos controles conservan la ficha seleccionada. [Vista superior](../arte/laminas/taza-superior.png) |
| Luz y apoyo | Luz cálida amplia desde arriba a la izquierda y relleno suave. La sombra de contacto toca cada pie y sube con él al moverlo de la mesa a un libro. Comparar el contorno de huella, el canto y las páginas en el recorte 1:1. [Vista oblicua](../arte/laminas/taza-oblicua.png) · [Detalle de apoyo](../arte/laminas/apoyo-1a1.png) |
| Materiales | Base de madera con veta de bajo contraste, caras petróleo y cantos cálidos. Libros con escalones contables. Taza mate con asa visible, esfera con reflejo pequeño y banda de color para leer la rodadura. Comparar ambas rutas desde la misma cámara. [Recorridos de la taza](../arte/laminas/recorridos-de-la-taza.png) |

## Interfaz de escritorio

A 1366 × 768 píxeles CSS, reservar 90 px para cabecera, 544 px para la mesa y 134 px para la bandeja. Al redimensionar, recalcular el aspecto de la cámara según el área efectiva del canvas y usar ese mismo rectángulo para proyectar el mouse. El DOM mantiene los botones, su foco visible, el objetivo y los mensajes de estado. La escena dibuja huella, silueta, flecha y aro. Las ayudas ancladas pueden cambiar de lado cerca del borde. [Guía de interfaz](../arte/interfaz.md)

| Momento | Controles y señales |
| --- | --- |
| Edición | Cabecera con símbolo, desafío, «Derribá la ficha con la bandera», «Vista superior» y «Ver mesa». Bandeja con miniaturas, nombre y saldo, «Trazar fila», «Deshacer» y «Empujar». «Retirar» aparece al seleccionar una pieza editable. Reservar el ancho de «× 12» y mantener la miniatura visible en «× 0». [Gestos del editor](../arte/laminas/editor.png) |
| Prueba | Mantener cámara y ubicación del jugador. La bandeja muestra «Prueba», velocidad activa, botón «Cámara lenta» o «Velocidad normal» y «Volver a editar». Un cambio de velocidad puede hacerse con piezas en movimiento. |
| Resultado | Confirmar «Meta alcanzada» en el mismo fotograma de la caída. En reposo mostrar el nivel completado o la mesa resuelta, los desbloqueos nuevos y «Ver mi cadena otra vez». Una cadena detenida ofrece «Repetir». [Guía de interfaz](../arte/interfaz.md) |

Usar los originales vectoriales de la marca, Bricolage Grotesque para títulos y DM Sans para controles, con fuentes servidas junto al juego. Aplicar crema `#F6EEDC` sobre petróleo `#205752` y tinta `#19332F` sobre crema o mandarina `#F58939`. Combinar trama, cruz y explicación breve para el apoyo inválido. Comprobar al 100 % que las cifras, tildes y signos se leen sin tapar la mesa. Las flechas numeradas de las láminas son anotaciones internas. [Identidad, tipografía y voz](../arte/identidad.md) · [Símbolo original](../arte/marca/simbolo.svg) · [Firma horizontal](../arte/marca/firma.svg)

## Síntesis y sincronización

Crear o reanudar un único `AudioContext` con el primer gesto del usuario. Enviar todas las voces a una ganancia maestra controlada por la preferencia de audio. Un intento tiene su propio grupo de voces y eventos pendientes. Al repetir, volver a editar o abandonar la prueba, vaciar ese grupo y detener la rodadura. [Activación de Web Audio](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)

| Suceso | Voz o señal | Cuándo debe oírse |
| --- | --- | --- |
| Armado y ambiente | Ruido filtrado tenue de cocina, toque corto al colocar | El ambiente queda detrás de la acción. Solo una confirmación de colocación dispara el toque. |
| Impacto entre piezas | Ráfaga corta de ruido con resonancia de madera y caída rápida de ganancia | Una voz por impacto audible. Modular intensidad con el impulso y variar levemente el timbre por ID de pieza. Agrupar los contactos duplicados de un mismo choque. |
| Bola en movimiento | Ruido continuo filtrado según velocidad y material, con más resonancia en la canaleta | Iniciar al rodar sobre apoyo, silenciar en el aire y retomar al aterrizar. Dar al golpe contra la bandeja un ataque grave. |
| Apertura de la llave | Pulso breve y seco con ataque marcado | Un clic en la transición a apertura, incluso si varias fichas tocan la paleta. Debe distinguirse del tac de madera. |
| Victoria | Muestra de guitarra de la pista activa en el canal Interfaz | Iniciar con el evento físico de victoria. La primera solución del desafío reproduce los ataques a 0, 220 y 480 ms. Repeticiones y taller comienzan en la última nota. [Guion de la guitarra](../arte/movimiento-y-sonido.md#la-respuesta-de-la-guitarra) |

Usar el paso de simulación y el ritmo de presentación para alinear cada contacto con la pose visible. En cámara lenta se espacian los impactos y se conserva su ataque corto. La firma usa milisegundos de interfaz desde la victoria. Con movimiento reducido el canto se ve cálido desde la caída hasta el reposo. Con audio apagado se mantienen el resultado escrito y la posición de la llave o de la bola. Escuchar una pasada en parlantes de PC y repetirla en silencio. [Movimiento y sonido](../arte/movimiento-y-sonido.md) · [Prueba audiovisual](pruebas-y-publicacion.md#presentación-y-audio)

[Índice técnico](README.md)
