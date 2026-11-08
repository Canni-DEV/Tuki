# MVP de dominós en 3D

DISEÑO DE JUEGO / VERSIÓN 0.1

Cada nivel fija la primera ficha y la meta. El jugador inventa el recorrido con las piezas disponibles, empuja una sola vez y observa si su construcción consigue derribar la última ficha.

## La experiencia que queremos probar

Un rompecabezas web para quienes disfrutan armar máquinas caseras. La primera versión propone partidas cortas en computadora, con mouse, sobre una mesa de cocina en 3D. El desafío consiste en decidir por dónde transmitir el movimiento y cuándo pasarlo de una ficha a una bolita.

- **Recorrido A.** Ficha inicial sobre el libro → fila de dominós que baja por los escalones y rodea la taza → ficha final sobre la mesa.
- **Recorrido B.** Ficha inicial sobre el libro → dominós que liberan la bolita → rampa → embudo → tobogán → fila corta de dominós → ficha final sobre la mesa.

*Figura 1. Dos soluciones posibles al nivel de la taza, en intentos distintos. Esquema sin escala.*

## Reglas de la partida

**Al armar.** La posición y la orientación de inicio y meta están fijadas. El resto del inventario se coloca libremente en superficies habilitadas. Las piezas esperan en reposo hasta el empujón.

**Al empujar.** La ficha inicial recibe siempre el mismo impulso. Desde ese momento, solo las piezas pueden accionar otras piezas. El jugador puede observar, cambiar la velocidad o volver al editor.

**Al ganar.** La meta debe volcarse como consecuencia de esa cadena. Vale cualquier recorrido, incluso uno imprevisto o con piezas sobrantes. El jugador elige repetirlo, editarlo o pasar al siguiente desafío.

**Alcance del MVP.** Una mesa, cuatro desafíos, un editor de trazado libre, física 3D, sonido de impactos y repeticiones. El objetivo es comprobar si el jugador puede construir lo que imagina, entender un fallo y probar otra solución.

## El editor de la mesa

La acción más frecuente será dibujar una fila, probarla y ajustar la ficha donde se detuvo. Ese ciclo debe poder hacerse con el mouse y sin cambiar de pantalla.

### Lo que ve el jugador

La mesa abre en vista oblicua, encuadrada de modo que se vean ambos extremos. La primera ficha lleva una flecha con el sentido del empujón y la última, una bandera. La bandeja muestra el inventario restante de cada pieza. El botón principal dice «Empujar».

| Acción | Comportamiento esperado |
| --- | --- |
| Colocar una pieza | Elegirla en la bandeja y señalar una superficie. Una silueta muestra el apoyo, la orientación y el sentido de caída o salida. Un clic confirma. |
| Dibujar una fila | Elegir «Trazar fila» y arrastrar. Las fichas siguen la curva, con separación sugerida y orientación tangente al recorrido. La vista previa cuenta cuántas se usarán. |
| Ajustar o retirar | Seleccionar una ficha de la fila o un mecanismo. Arrastrar para mover, usar el aro para girar y «Retirar» para devolverlo al inventario. Una ficha se puede corregir por separado. |
| Deshacer | «Deshacer» revierte la última edición y devuelve el saldo anterior. Una fila se deshace como un solo gesto. Cancelar una vista previa conserva el armado. |
| Inspeccionar en 3D | Arrastrar con el botón derecho para orbitar, usar la rueda para acercar y «Vista superior» para alinear. «Ver mesa» recupera el encuadre inicial. Mover la cámara conserva la selección. |

### Qué pasa en los bordes del tablero

**Se agotaron las fichas.** La vista previa se detiene en la última ficha disponible y muestra «Límite de fichas». Al soltar, solo se confirma el tramo visible. El saldo nunca baja de cero.

**La posición es inválida.** Si una pieza se superpone, queda fuera de la mesa o carece de apoyo, la silueta indica el motivo. Al soltar, vuelve a su posición anterior o a la bandeja. El jugador puede dejar un hueco amplio entre dos fichas y descubrir su efecto al probar.

**Hay dos alturas.** La silueta y su sombra se apoyan sobre la superficie señalada. Al llegar al borde de un libro, el trazo se corta. El jugador inicia otro tramo sobre el escalón inferior y ajusta la unión en vista oblicua.

### Tolerancia al dibujar

El trazo suaviza los pequeños temblores del mouse y distribuye las fichas a una distancia de caída fiable. La orientación y la separación de cada ficha siguen siendo editables. Una curva suave funciona al primer intento si el jugador conecta bien sus extremos.

## Piezas y reacción en cadena

Los mecanismos tienen entradas y salidas visibles. Una persona debe poder anticipar qué se moverá al recibir un golpe y comprobar su hipótesis con un solo intento.

| Elemento | Cómo entra en juego | Qué decisión permite |
| --- | --- | --- |
| Dominó | Al recibir un golpe suficiente, se vuelca y alcanza lo que tenga delante. Una ficha puede tocar dos vecinas si la geometría lo permite. | Elegir dirección, espaciado y punto de bifurcación. |
| Bolita | Parte estable en una superficie plana o retenida en una cuna. Una ficha la empuja fuera de esa posición. Rueda por gravedad y puede derribar otra ficha. | Transportar el movimiento entre dos filas alejadas. |
| Rampa | Pieza rígida de pendiente fija. Se coloca y gira sobre un apoyo. La bolita entra por el extremo alto y sale por el bajo. | Apuntar la salida y aprovechar un desnivel. |
| Embudo | La boca recoge una bolita que entre desde arriba. El cuello la entrega a un canal situado debajo. | Recibir la bola desde varios ángulos y fijar su destino. |
| Tobogán o canaleta | Un tramo fijo del escenario guía la bolita desde el embudo o desde una entrada expuesta. La salida está a la altura de una ficha. | Elegir dónde retomar la cadena de dominós. |
| Llave de paso | Una paleta lateral abre una compuerta al recibir un golpe. Permanece abierta hasta reiniciar. En el módulo de prueba, si la bola llega antes, el desvío la lleva a una bandeja. | Coordinar dos ramas para que el paso se abra antes de que llegue la bola. |

### Comportamiento durante una prueba

Las piezas colocadas deben quedar estables al iniciar. La bola elevada necesita un tope o una cuna hasta que la toque la cadena. En una repetición se recuperan las posiciones, las orientaciones, el reposo de cada pieza y la compuerta cerrada.

«Repetir» reproduce el último intento desde el empujón. La cámara lenta conserva el orden y el resultado de los contactos. «Volver a editar» recupera la construcción previa, aun con piezas en movimiento. Un intento termina al caer la meta o al quedar en reposo todas las piezas que siguen sobre la mesa.

El ritmo de los impactos permite seguir una fila. La bolita tiene sonido de rodadura y la compuerta hace clic al abrir. La caída de la meta activa una señal visual de victoria, también con el sonido desactivado.

## Cuatro desafíos en una mesa

Cada desafío introduce una decisión. Las cantidades son inventarios de partida para el prototipo. El tamaño de la taza, la longitud de los caminos y los desniveles se calibran con montajes jugables.

### 1 La recta

La ficha de salida y la meta están a 16,2 cm sobre la mesa. Hay seis dominós para conectarlas. Se pueden colocar de a uno o con «Trazar fila». Cualquier cadena que derribe la meta gana, incluso si sobran fichas.

### 2 La curva

Inicio y meta están en el mismo plano, con un vasito de gres entre ambos. El inventario contiene ocho dominós intermedios. Se aprende a trazar, girar una ficha y reparar una discontinuidad. La disposición deja espacio para una S de ocho fichas y también para una curva más suave.

**Prueba del nivel.** Ambos recorridos llegan a la meta. Separar una ficha corta la cadena en un punto visible. Corregir solo esa ficha basta para recuperar el recorrido.

### 3 Del libro a la mesa

El inicio está sobre un libro y la meta en la mesa. Hay seis dominós, una bolita y una rampa. Una cuna fija sostiene la bolita en la parte alta. El jugador alinea la rampa con la cuna y decide dónde poner la primera ficha que recibirá a la bola en la mesa.

**Prueba del nivel.** El empujón libera la bola y esta derriba la fila inferior. Si la salida apunta a un costado, la bola pasa de largo a la vista del jugador. Girar la rampa permite corregir el intento.

### 4 Alrededor de la taza

La ficha inicial está sobre un libro grueso y la meta queda en la mesa detrás de una taza fija. Una pila escalonada de libros da apoyo al recorrido lateral. Hay doce dominós, una bolita, una rampa y un embudo. Un tobogán fijo desemboca cerca de la meta.

**Recorrido con fichas.** Bajar por los libros, rodear la taza por el costado y orientar las últimas fichas hacia la meta. Ajustar la altura de cada escalón para que una ficha alcance la siguiente.

**Recorrido mixto.** Usar tres fichas arriba para liberar la bolita. La rampa apunta al embudo, el embudo descarga en el tobogán y la bola golpea una fila corta orientada hacia la meta.

**Variante de sincronización.** Al resolver la taza se puede volver a los desafíos o probar una llave adicional en el desvío de la canaleta. Una rama de fichas golpea la paleta y otra libera la bolita. Cambiar la longitud de una rama cambia cuál llega primero.

**Prueba del nivel.** Guardar dos montajes ganadores, uno por recorrido. En la variante, demostrar un intento con paso abierto a tiempo y otro donde la bola llegue temprano y termine en la bandeja.

## Criterios de aceptación

Estas pruebas definen cuándo se puede entregar la primera versión para jugar. Los recorridos de referencia sirven para detectar fallos de funcionamiento sin imponer una solución al jugador.

| Prueba | Resultado que debe observarse |
| --- | --- |
| Inicio y victoria | Intentar mover inicio y meta durante el armado. Ambos conservan su posición y orientación. Al empujar se aplica un solo impulso. La victoria se registra una vez cuando la meta, alcanzada por la cadena, supera 60° desde la vertical. |
| Cadena interrumpida | Dejar un hueco imposible. La fila se detiene y la meta sigue en pie. Al alcanzar el reposo aparece «Cadena detenida» con las opciones «Repetir» y «Volver a editar». Una bola que salga de la mesa deja de contar como pieza en movimiento. |
| Inventario y edición | Trazar con ocho fichas disponibles hasta agotar el saldo. Retirar una, colocarla en otro sitio y deshacer. Cantidad colocada más cantidad disponible equivale al inventario del nivel en cada paso. |
| Restauración exacta | Volver al editor a mitad de la caída y después de ganar. Cada pieza recupera su posición y orientación. El inventario y la llave vuelven al estado inicial. Mover solo una ficha conserva el resto. |
| Repetición y cámara lenta | Ejecutar cada montaje de referencia diez veces en el mismo equipo, incluidas dos a cámara lenta. Se mantienen el resultado y el orden de los contactos que deciden la victoria. |
| Soluciones diferentes | Resolver el nivel de la taza con los dos montajes de referencia. Una solución adicional que cumpla la regla también gana, incluso si quedan piezas en la bandeja. |
| Compuerta y bifurcación | Activar dos ramas con el primer empujón. Con la llave abierta a tiempo, la bola continúa. Si llega antes, cae en el desvío. En ambos casos el jugador solo toca controles de observación. |
| Uso en navegador | Probar en dos navegadores de escritorio identificados en el informe. A 1366 × 768 deben verse la mesa, el inventario y el botón principal. Como objetivo inicial, la simulación de «Alrededor de la taza» mantiene al menos 30 imágenes por segundo en el equipo de prueba. |

### Montajes de control

Conservar el trazado en S, el descenso por rampa y las dos soluciones de la taza. Para la llave, guardar una variante temprana y otra tardía. Registrar navegador, equipo y resultado en cada pasada. El ángulo de victoria y el rendimiento son valores de partida para calibrar durante el prototipo.

## Validación con jugadores

Para decidir cómo ampliar el juego, observamos si una persona consigue construir lo que imagina y qué elige hacer después de completar su máquina.

### Primero en una mesa real

Preparar la taza, libros, doce fichas, una bolita y una rampa de cartón. Dar los mismos materiales y los mismos extremos a dos personas por separado. Dibujar sus recorridos. Si ambas repiten el único camino viable, mover la taza o cambiar el presupuesto de fichas y volver a probar.

### Después en el navegador

**Tarea del editor.** Invitar a cinco personas que no hayan visto el prototipo. Pedirles que tracen una S de ocho fichas y la prueben. Entregar luego una copia con una ficha desplazada para que encuentren el corte, vuelvan al editor y reparen la curva.

**Tarea de invención.** En el nivel de la taza, mostrar únicamente el objetivo y el inventario. Registrar el primer recorrido, dónde se traban, qué creen que falló y qué pieza cambian. Evitar demostrar el embudo o dibujarles una solución.

**Después de la victoria.** Dejar a la vista «Siguiente», cuando corresponda, «Repetir» y «Volver a editar». Observar su primera elección y preguntar qué querían conseguir. Distinguir repetir para disfrutar la caída de editar para ahorrar piezas o inventar otra ruta.

### Cómo usar lo observado

| Señal buscada | Decisión de producto |
| --- | --- |
| Al menos 4 de 5 trazan la S y reparan el corte sin ayuda. | Si cuesta trazar, revisar el gesto y el espaciado. Si cuesta reparar, revisar selección, cámara y retorno al editor antes de sumar piezas. |
| Aparecen dos familias de solución en la taza. | Ajustar distancias e inventario si solo aparece una. Conservar los atajos que respeten la regla del empujón único. |
| Los jugadores avanzan o vuelven a construir por iniciativa propia. | Si predomina avanzar, priorizar una campaña breve. Si vuelven a inventar o mostrar sus máquinas, probar un modo libre y opciones para compartir montajes. |

Si el celular pasa a ser una plataforma prioritaria, la próxima prueba debe distinguir con el dedo los gestos de colocar, girar y mover la cámara.

Referencias de diseño [Domino Sky](https://store.steampowered.com/app/457480/) · [Contraption Maker](https://spotkin.itch.io/contraption-maker)
