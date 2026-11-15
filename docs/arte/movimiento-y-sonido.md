# Movimiento y sonido

El ritmo de una fila permite escuchar hasta dónde llegó el empujón. La caída de cada ficha lleva un golpe corto de madera. Cuando la cadena cambia de material, la rodadura o el clic de la compuerta permiten seguir el relevo incluso si la pieza queda momentáneamente detrás de la taza.

## Qué mueve y qué suena

| Evento | Imagen | Sonido y sincronía |
| --- | --- | --- |
| Armado | Piezas quietas y huella pegada al apoyo. Al confirmar, la ficha queda en la posición elegida. | Ambiente de cocina tenue y estable. Un toque suave confirma una colocación. El simple paso del puntero permanece silencioso. |
| Empujón y fila | La primera ficha inicia la caída. Cada vecina cambia de orientación al recibir el impacto. | Disparar cada «tac» con el contacto correspondiente. Usar pequeñas variaciones de timbre entre contactos equivalentes. En una fila rápida deben oírse la cadencia y su interrupción. |
| Bolita | La veta de color gira al rodar. El paso de rampa a canal y la salida del extremo son visibles. | La rodadura entra al empezar a rodar sobre un apoyo. Ajustar su intensidad a la velocidad, cortarla en el aire y retomarla al aterrizar. La madera suena seca y la canaleta produce una resonancia breve. |
| Paleta y llave | La paleta cede al golpe y la hoja se aparta del canal. La apertura persiste. Una bola temprana queda en el desvío. | Un clic único al abrir. Si la bola cae en la bandeja, un impacto corto y grave cierra su recorrido. |
| Cadena detenida | Las piezas conservan la pose en la que se detuvieron. El resultado aparece en la bandeja. | El último contacto cierra la secuencia. La guitarra recupera volumen cuando aparece el resultado y pasaron al menos 350 ms desde ese contacto. |
| Meta | El sello con la bandera a cuadros identifica la ficha durante la edición. Al empujar desaparecen ambos sellos. En cuanto la meta activada supera los 60°, un reflejo cálido recorre su canto y la bandeja dice «Meta alcanzada». | Los contactos siguen sonando durante la caída. La primera nota de guitarra acompaña la caída. |

En la mezcla, dar prioridad al transitorio de la madera y al clic. Mantener la rodadura audible por debajo de esos contactos y el ambiente un plano más atrás. Escuchar una pasada con los parlantes de una computadora al volumen habitual. Debe distinguirse cuándo la última ficha deja el movimiento en manos de la bolita.

## Las guitarras y la mezcla

«Pregunta y Respuesta» y «Una ficha más» alternan desde el primer gesto. Una misma canción puede acompañar el paso de Desafíos al taller. El empujón baja la guitarra 12 dB en 150 ms. La vuelta al volumen elegido dura 800 ms y comienza al asentarse las piezas, cuando terminó la respuesta de guitarra y pasaron 350 ms desde el último contacto. La cámara lenta conserva el tempo musical. Ocultar la pestaña pausa la reproducción.

En Preferencias, Música (40 %) regula el acompañamiento, Mesa (85 %) las herramientas y los contactos físicos, Ambiente (25 %) la cocina e Interfaz (65 %) la navegación, los avisos y las notas de victoria. El botón de la cabecera silencia la mezcla completa y permite recuperarla con esos mismos valores.

## La respuesta de la guitarra

| Tiempo desde la caída | Mesa y bandeja | Interfaz sonora |
| --- | --- | --- |
| 0 ms | «Prueba» cambia a «Meta alcanzada». El reflejo nace en el canto mandarina de la meta, con un acento cálido más marcado en la primera victoria. | La primera victoria de cada nivel, variante o revisión de desafío certificado inicia el remate completo en la menor, común a ambas canciones. Las victorias posteriores y el Taller libre conservan la nota breve de la muestra original de la pista activa. |
| 60–2000 ms | Solo en esa primera victoria, diez motitas crema y ámbar se desprenden del canto. Ascienden hasta una altura de ficha, se abren ligeramente y frenan mientras desaparecen. | El remate continúa sin añadir sonidos. |
| 500 ms | La madera recupera su aspecto habitual. | Los contactos de la mesa continúan. |
| Reposo | «Completaste [nivel]» y los desafíos, acceso al taller y piezas que se acaban de abrir. En una mesa propia o importada, «Resolviste [mesa]». Los controles se habilitan sin esperar al audio. | La música permanece atenuada 12 dB hasta que termina la frase y luego recupera su volumen. |

`remate-la-menor.wav` es la exportación original de Ardour, en mono, PCM de 16 bits y 48 kHz. Dura 6,9435 s, incluida su resonancia final. Se reproduce completo únicamente en la primera victoria de cada desafío o variante, con la misma ganancia y atenuación de fondo que las respuestas anteriores.

El suspiro de luz ocupa únicamente el entorno de la meta y dura dos segundos reales, también en cámara lenta. Las motas tienen bordes suaves y respetan la profundidad de los objetos. La animación termina aunque las piezas ya se hayan asentado; no retrasa los controles del resultado. La primera victoria queda registrada con el progreso existente, también para cada revisión certificada de los desafíos importados. Probar como autor no consume esa primera victoria.

Las dos muestras anteriores se conservan para las repeticiones. Provienen de una cuerda aguda del comienzo de las grabaciones del juego: «Pregunta y Respuesta» usa `victoria-pregunta.wav` y «Una ficha más», `victoria-ficha.wav`. En ambos archivos se reproduce desde los 480 ms, donde empieza la última nota, manteniendo la confirmación breve de 720 ms.

## Repetición y alternativas perceptivas

- **Repetición.** «Ver mi cadena otra vez» restaura el armado previo. El reflejo y el sonido pertenecen al intento y terminan al editar, repetir o salir.
- **Cámara lenta.** El fraseo y el reflejo duran lo mismo a 1× y a 0,25×. Los contactos siguen la velocidad de la simulación.
- **Movimiento reducido.** La primera victoria ilumina el canto sin desplazamiento ni partículas; el tono cálido se desvanece durante dos segundos. En repeticiones se conserva el tono fijo hasta el resultado.
- **Pestaña oculta.** La animación se pausa junto al audio y continúa al volver. Editar, repetir o salir elimina inmediatamente el efecto.
- **Audio apagado.** El anuncio inmediato y el resumen persistente se leen en la bandeja aunque un objeto oculte la meta. El silencio general y el control de Interfaz afectan a la frase de victoria.
