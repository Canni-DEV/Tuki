# Física, mecanismos y repetición

Una ficha puede empujar dos vecinas, una bola puede salirse de la mesa y una ruta inventada puede ganar. Para decidir el resultado, Rapier integra cuerpos y contactos desde el empujón inicial. La lista de recorridos de prueba pertenece a QA.

## Mundo y piezas

Trabajar en metros, kilogramos y segundos, con +Y vertical y la tapa de la mesa en `y = 0`. La pose de catálogo sitúa el pivote del modelo. Convertir esa pose al centro de masa mediante el desplazamiento local del colisionador y aplicar la conversión inversa al dibujar. Para un dominó de altura `h` con pivote en el pie, el centro de la caja queda en `[0, h/2, 0]`.

| Elemento | Cuerpo y geometría de contacto | Comportamiento verificable |
| --- | --- | --- |
| Inicio, meta y dominós de inventario | Cuerpos dinámicos con caja de base plana. Inicio y meta tienen posición bloqueada **en edición**. La flecha y la bandera son elementos gráficos. | Inicio recibe el impulso. Meta puede volcarse. Cada contacto entre piezas transmite movimiento según su geometría, incluso en una bifurcación. |
| Bolita y cuna | Esfera dinámica con detección continua de colisiones. Cuna fija con dos apoyos y un tope bajo, abierta hacia la salida. Su alojamiento define la posición de reposo de la esfera. | La bolita puede descansar en mesa, libro o cuna. Solo una bolita colocada descuenta inventario. En la cuna, un dominó debe poder tocarla y sacarla. |
| Rampa | Cuerpo fijo durante la prueba, editable en posición y giro durante el armado. Cuña con superficie inclinada continua y pie estable. | La bola entra desde arriba y rueda hacia el extremo bajo. Una salida mal orientada puede errar la fila inferior. |
| Embudo | Cuerpo fijo durante la prueba. Construir la pared con sectores convexos alrededor de un cuello hueco. Las patas apoyan a ambos lados de la descarga. | La esfera entra por la boca, atraviesa el cuello y cae sobre el canal. Revisar la abertura interior con una esfera de diámetro real. |
| Canaleta y bandeja | Cuerpos fijos con fondo y labios laterales por separado. Ambos extremos de la canaleta quedan abiertos. La bandeja tiene un fondo que retiene la esfera. | Se puede entrar desde el embudo o por el extremo expuesto y salir hacia un dominó. La bola desviada termina a la vista. |
| Paleta y hoja de la llave | La paleta tiene un cuerpo dinámico con bisagra y tope. La hoja es cinemática y su colisionador acompaña el recorrido de apertura. El desvío y la bandeja son fijos. | Un impacto de la cadena en la paleta arranca una sola apertura. La hoja se retira del paso y queda enclavada. Una bola que encuentra la hoja cerrada sigue físicamente el desvío. |
| Mesa, libros, obstáculo y taza | Cuerpos fijos. Cajas para mesa, tapas y escalones. Formas compuestas para la taza y el asa. Las superficies habilitadas para editar se identifican en el nivel. | La bola puede chocar con un objeto fijo y conservar su lugar en la cadena. Cada escalón ofrece una altura de apoyo propia. |

## Del empujón al resultado

1. Validar el armado, crear un mundo nuevo, registrar cuerpos y colisionadores por ID estable y arrancar con velocidades cero, paleta en reposo y hoja cerrada. Usar el mismo orden en cada reconstrucción, incluso para los sectores de un mecanismo. Despertar inicio y aplicar **una vez**, en el paso cero, el impulso especificado en coordenadas locales, convertido al mundo en el punto de aplicación.
2. En cada paso reunir los contactos y sus fuerzas. Inicio es la primera pieza activada. Un choque con movimiento de aproximación que transmite impulso desde una pieza activa activa a la pieza móvil alcanzada. Considerar también pares ya en contacto cuando empiezan a transmitirse movimiento. Para contactos simultáneos, resolver todos los alcances del mismo paso, incluidas las dos ramas. Un apoyo estático transmite reacción de soporte y nunca enlaza causalmente piezas que descansan en él. Para disparar la llave, la paleta debe recibir un golpe lateral de una pieza activa.
3. Etiquetar los eventos con intento, paso, tipo y los ID participantes. El detector de jugabilidad consume contactos físicos. El audio puede filtrar repeticiones débiles por material. Una diferencia de mezcla o el audio apagado deja idéntico el resultado. [Eventos de contacto de Rapier](https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection_js/)
4. Después de resolver los contactos, transformar el eje vertical local de la meta usando su rotación física. Si la meta fue alcanzada por la cadena y el producto escalar de ese eje con la vertical del mundo es **menor que 0,5**, ganó. Registrar la victoria y el progreso una sola vez en ese paso. Continuar la física al menos un segundo simulado (120 pasos) y hasta que se cumpla la ventana de reposo. Entonces dormir los cuerpos dinámicos y presentar la victoria con sus poses finales.
5. Para el reposo, contar pasos consecutivos con todos los cuerpos móviles en juego dormidos o apoyados y por debajo de ambos umbrales de velocidad. Una bola en el aire, una paleta que cede o una hoja en apertura mantienen vivo el intento. Un cuerpo que atraviesa el plano de descarte inferior se retira del cómputo y de las colisiones. La bandeja está por encima de ese plano. Si se cumple la ventana completa sin victoria, congelar las poses y emitir «Cadena detenida».

## Perfil físico inicial

Estos son números de arranque del perfil `mvp-1`. Deben quedar asociados a una versión del catálogo y a la evidencia del montaje indicado cuando se calibren. Las dimensiones de las maquetas en pantalla se expresan en píxeles y no fijan la escala de las piezas.

| Parámetro | Valor inicial | Montaje para decidir el ajuste |
| --- | --- | --- |
| Gravedad, paso y velocidad lenta | 9,81 m/s² hacia −Y, paso de 1/120 s, lenta a 0,25× | Comparar la S y las dos llegadas a la llave en normal y lenta. Si hay diferencias, revisar el reloj antes de cambiar geometrías. |
| Dominó y separación de centros | 50 mm alto × 25 mm ancho × 8 mm espesor, masa 12 g, separación sugerida 27 mm | Una S de ocho fichas debe llegar. Desplazar una para cortar la cadena y comprobar que basta con devolverla a su sitio. |
| Empujón de inicio | 0,003 N·s hacia +Z local, aplicado a 40 mm del pie | La primera ficha vuelca desde reposo y alcanza a la siguiente en la S. Verificar el mismo impulso en toda la campaña. |
| Contacto y reposo | Fricción inicial 0,5 y restitución 0,05. Para reposo, velocidad lineal menor que 0,005 m/s y angular menor que 0,10 rad/s durante 60 pasos | Probar un hueco, una bola en el aire y una bola en bandeja. El resultado debe esperar al último movimiento visible. |
| Bola, cuna y rampa | Radio 8 mm, masa 6 g, tope de cuna de 2 mm, rampa de 95 mm de largo a 15° | Nivel del libro. La bola parte estable, sale al golpe, erra al desalinear y derriba la fila después de girar la rampa. |
| Libros, taza y embudo | Desnivel inicial de 18 mm por escalón, taza de 75 mm de diámetro exterior y cuello de embudo de 22 mm de diámetro libre | En la taza, verificar el descenso entre escalones y luego el paso de la bola al canal. Conservar ambos montajes tras cada ajuste. |
| Llave y descarte | Apertura cinemática inicial de 12 pasos hasta despejar todo el canal. Descarte 100 mm por debajo de la tapa | Probar una llegada antes y otra después de la apertura. Lanzar además una bola fuera de la mesa y verificar que el intento termina. |

## Repetición y diagnóstico

Guardar antes del impulso las poses de edición, el saldo, el ID y revisión del nivel y el perfil físico. Las velocidades iniciales, el estado de la llave y el origen del reloj son conocidos. En «Repetir», reconstruir y ejecutar de nuevo. La cámara lenta modifica el ritmo de presentación y conserva el tamaño y orden de los pasos. Fijar la versión de Rapier en el archivo de dependencias bloqueadas. [Condiciones de determinismo de Rapier](https://rapier.rs/docs/user_guides/javascript/determinism/)

En QA, registrar por paso los contactos decisivos con IDs de pieza. Dos contactos simultáneos forman un mismo grupo. Ordenar sus IDs para comparar registros y conservar su simultaneidad. Ante una diferencia, guardar el primer paso distinto, la pose previa y la versión del perfil. Repetir con el mismo armado antes de modificar una tolerancia. [Matriz de los seis montajes](pruebas-y-publicacion.md#montajes-de-control)

[Índice técnico](README.md) · [Edición y datos del nivel](editor-y-niveles.md)
