# Pruebas y publicación

La entrega del juego se evalúa con la misma compilación, los mismos armados y la misma PC en Chrome y Firefox. Esta guía define qué ejecutar y qué anotar. Guardar los resultados con la revisión del nivel y el perfil físico que los produjo. [Planilla de validación del MVP](../arte/validacion.md)

## Montajes de control

Preparar seis archivos de prueba internos. Cada uno contiene un `Armado` completo, una descripción del ajuste, el desenlace esperado y los grupos de eventos decisivos identificados por ID de pieza. Guardar las poses iniciales, incluso las de la ficha que bifurca. Estos archivos alimentan la prueba de física y el modo de revisión interno. El jugador abre el desafío con el inventario y la mesa iniciales.

| Montaje | Contactos o pasos que distinguen el recorrido | Resultado esperado |
| --- | --- | --- |
| S de ocho | Inicio → ocho dominós intermedios, en orden → meta | Victoria en la curva. |
| Descenso por rampa | Inicio → liberación de bola en cuna → apoyo en rampa → primer dominó inferior → meta | Victoria en el libro. |
| Taza con fichas | Inicio → caída entre escalones → fila por el lateral de la taza → meta | Victoria por el recorrido de dominós. |
| Taza mixta | Inicio → tres fichas superiores → bola → rampa → embudo → canaleta → fila final → meta | Victoria por transferencia a la bola. |
| Llave abierta a tiempo | Desde una bifurcación, una rama libera la bola y otra golpea la paleta. La hoja despeja el canal antes de la llegada → bola atraviesa el paso → fila final | Victoria, hoja abierta. |
| Bola temprana | La bola llega al cruce con la hoja cerrada → desvío → bandeja. La rama de la paleta llega después | Bola visible en bandeja, meta en pie y cadena detenida. |

Las flechas expresan el orden decisivo. Revisar también dirección, entrada y salida en los mecanismos que guían la bola. Para las ramas, comparar la precedencia en el cruce y respetar eventos simultáneos. Versionar cualquier cambio de expectativa junto con la geometría que lo motiva. [Montajes ilustrados de revisión](../arte/laminas/montajes-de-revision.png)

## Pruebas de física

Ejecutar pruebas de pasos fijos directamente contra Rapier, sin cámara ni audio. En navegador, ejercitar los mismos casos con el flujo de la aplicación. Los casos derivados que siguen se suman a los seis montajes de control.

### Inicio y victoria

Seleccionar primero inicio y luego meta e intentar mover, girar y retirar cada ficha. Confirmar que sus poses siguen fijas en edición. Hacer doble clic en «Empujar» y contar un único impulso en el paso cero. Probar el evaluador con la meta alcanzada a 60° exactos y luego apenas por encima. Solo la segunda pose gana. Inclinar además la meta sin contacto causal y comprobar que el evaluador mantiene la prueba en curso. Una vez ganada la prueba, avanzar la presentación y comprobar que resultado, progreso y firma se emiten una vez por intento.

### Reposo y descarte

Desplazar una sola ficha de la S hasta abrir un hueco. La colocación se acepta, el golpe se corta en ese punto y aparece «Cadena detenida» al asentarse la última pieza. Hacer que una bola abandone la mesa y verificar que deja de mantener vivo el intento al cruzar el plano inferior. Repetir con bola en el aire y durante la apertura de la hoja para descartar fallos prematuros. Verificar que los contactos de apoyo sobre la mesa o un libro por sí solos no activen la meta.

### Repetición y restauración

En **cada navegador** ejecutar cada uno de los seis montajes **8 veces a 1× y 2 a 0,25×** a partir del mismo armado. Incluir tanto «Empujar» como «Repetir». Son **120 pasadas** en total. Comparar orden de grupos decisivos y resultado en las diez pasadas, y contra la expectativa del montaje en ambos navegadores. Registrar también el paso de la primera divergencia si aparece.

En pasadas adicionales, cambiar de velocidad a mitad de una caída y cancelar durante la rodadura. Volver a editar durante el movimiento y después de ganar. Comparar por ID el armado antes y después, incluidas posición, giro, apoyo y saldo. Revisar compuerta cerrada, velocidades reiniciadas e historial disponible. Repetir con audio activo para detectar voces o remates pendientes del intento anterior.

| Montaje / revisión | Navegador / versión | Normal coincide / 8 | Lenta coincide / 2 | Desenlace y primer contacto distinto |
| --- | --- | --- | --- | --- |
| Completar una fila por montaje y navegador | | | | |

### Soluciones y llave

Verificar la curva suave además de la S. En el libro, desalinear la rampa, observar la bola pasar de largo y recuperar la victoria girando solo la rampa. Ejecutar los dos armados de la taza en intentos separados. Construir un tercer trazado válido con sobrantes y comprobar que también gana. En la variante, conservar el inventario y variar la longitud de una rama para invertir cuál llega primero. En ambos casos, registrar el único impulso de inicio y comprobar que después solo hubo controles de observación.

## Edición y progreso

Cubrir la lógica del armado con pruebas unitarias en TypeScript (Vitest). Automatizar con Playwright los recorridos a través del mouse y los botones. Usar las ejecuciones en Chrome y Firefox instalados en Windows para la aceptación final.

| Recorrido | Comprobación |
| --- | --- |
| Colocar, mover, girar y cancelar | La silueta coincide con la pose final. Rechazar penetración, base parcialmente apoyada y exterior. Una pieza existente conserva su pose anterior y una nueva deja intacto el saldo. Comprobar bola en plano y en cuna. |
| Trazar y corregir | Con ocho dominós, prolongar el trazo más allá del saldo. Se confirman los ocho visibles con orientación tangente. «Deshacer» retira la fila en un gesto. Volver a trazar, mover una ficha de la S y comprobar que solo cambia ese ID. |
| Inventario y apoyos | Retirar una ficha, recolocarla y deshacer paso a paso. En cada paso, colocadas más disponibles da el saldo inicial por tipo. Trazar hasta el borde del libro, comprobar el corte en la última base completa y empezar un trazo en el escalón inferior. |
| Cámara y bandeja | Con una pieza seleccionada, orbitar con botón derecho, acercar con rueda, alternar planta y «Ver mesa». Conservar la selección y el inventario. Al iniciar la prueba desde un encuadre propio se conserva ese punto de vista. |
| Progresión local | En un perfil limpio solo abre la recta. Ganar recta, curva, libro y taza, y comprobar cada desbloqueo. Ganar dos veces conserva un único registro. Cambiar audio y movimiento y recargar durante una prueba. Verificar que se recuperan progreso y ajustes y que la mesa abre en su estado inicial. Verificar arranque con dato ilegible y continuidad de sesión con almacenamiento bloqueado. |

## Presentación y audio

Abrir taza en oblicua y en planta a escala 1:1. Comparar apoyo en mesa y libro, flecha de inicio, bandera, entrada al canal, huella, inventario y botón principal con sus láminas. Comprobar la taza con ambas rutas y el interior del embudo con la superposición de colisionadores. En la S debe verse el hueco al fallar. [Láminas de mesa y piezas](../arte/mesa-y-piezas.md)

Escuchar el relevo de la madera a la bola en parlantes de PC. Verificar que el ambiente permite distinguir cada golpe, que la rodadura se corta al perder apoyo y que la llave hace un solo clic. En lenta, cotejar cada ataque con su contacto visible. En la taza mixta a 1× y a 0,25×, comprobar que «Meta alcanzada», el reflejo y el ataque de guitarra coinciden con la caída. Verificar ambas pistas, las respuestas a 220 y 480 ms, la nota única al repetir y el resumen con los desbloqueos al asentarse la mesa. Repetir victoria y fallo con audio apagado, incluida la identificación visual de las llegadas temprana y tardía a la llave. Con movimiento reducido el canto cálido se mantiene fijo hasta el resultado. [Guion de movimiento y sonido](../arte/movimiento-y-sonido.md)

## Rendimiento en Windows

1. En la PC de referencia (Intel Core Ultra 7 265, gráficos Intel y NVIDIA GeForce RTX 5070 Ti), anotar fecha, revisión del juego, versión de Windows, navegador, GPU efectiva y herramienta de medición. Consultar `chrome://gpu` o la sección gráfica de `about:support`. Registrar qué adaptador utilizó cada navegador en esa pasada.
2. Abrir la compilación de producción en una ventana visible, zoom del navegador al 100 % y **área de juego de 1366 × 768 píxeles CSS**. Confirmar con las dimensiones del viewport. Registrar DPR y comprobar que mesa, saldo y «Empujar» caben. Preparar el montaje mixto de la taza con los recursos ya cargados.
3. Contar un fotograma por render de la mesa en `requestAnimationFrame`, independientemente de cuántos pasos de física se hayan ejecutado. Desde «Empujar» hasta victoria o reposo, contar cuadros en intervalos de un segundo de reloj real. Anotar el conteo de cada intervalo y el mínimo. Para incluir el tramo final, medir también la ventana de un segundo que termina en el resultado. Si el recorrido dura menos de un segundo, registrar duración y cuadros y señalar que esa pasada no alcanza para acreditar el umbral.
4. Exigir **al menos 30 FPS en cada intervalo** a 1× en los dos navegadores. Anotar también el instante y la pieza visibles ante un tirón. Volver a ejecutar el mismo montaje después de ajustes de sombras, materiales o resolución interna. Conservar el tamaño CSS y el paso físico.

| Revisión / navegador | GPU efectiva / DPR | Serie de FPS por segundo | Mínimo | ¿Cabían mesa y controles? | Observación |
| --- | --- | --- | --- | --- | --- |
| Completar al medir en Chrome | | | | | |
| Completar al medir en Firefox | | | | | |

## Publicación en GitHub Pages

El repositorio de implementación debe incluir `package-lock.json`, la versión de Node elegida y scripts para tipos, pruebas y compilación. Una vez disponibles, se podrá comprobar la versión de producción con esta secuencia.

```sh
npm ci
npm run typecheck
npm run test:run
npm run build -- --base=/Tuki/
npm run preview -- --base=/Tuki/
```

`/Tuki/` ejemplifica el caso de un repositorio llamado exactamente `Tuki`. Abrir esa subruta también al probar localmente. Importar GLB, fuentes y marca como recursos de Vite o resolver los archivos públicos con `import.meta.env.BASE_URL`. El módulo de Rapier se empaqueta localmente e inicializa el WASM embebido. [Compilación y rutas base de Vite](https://vite.dev/guide/static-deploy.html#github-pages) · [Distribución de Rapier](https://rapier.rs/docs/user_guides/javascript/getting_started_js/)

1. En el repositorio de GitHub elegir **Settings → Pages → Source → GitHub Actions**. Para el trabajo de compilación, obtener el nombre real del repositorio desde `github.event.repository.name` y formar `/<nombre>/` conservando mayúsculas y minúsculas.
2. En pull requests, instalar con `npm ci` y ejecutar tipos, pruebas de lógica/física y compilación con esa base. En un runner Linux limpio, instalar los navegadores con `npx playwright install --with-deps chromium firefox`. Iniciar la vista previa de `dist/` y ejecutar `npm run test:e2e` contra su subruta, incluidos los proyectos de Chromium y Firefox de Playwright. [Ejecución de Playwright en CI](https://playwright.dev/docs/ci-intro)
3. En la rama de publicación, repetir las verificaciones sobre la revisión a desplegar. Tras el éxito, usar `actions/configure-pages` y `actions/upload-pages-artifact` con `path: dist`. Un segundo trabajo, dependiente del anterior y con entorno `github-pages`, usa `actions/deploy-pages`. Dar al trabajo de despliegue `pages: write` e `id-token: write` y al trabajo que lee el código y consulta la configuración de Pages `contents: read` y `pages: read`. Registrar la URL devuelta por el despliegue y la revisión publicada. [Flujo de GitHub Pages con Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
4. Desde una sesión limpia, abrir esa **URL publicada con su subruta real**. Comprobar respuesta satisfactoria y tipo correcto de HTML, JavaScript, GLB y fuentes en Red. Para el WASM, verificar la carga del módulo desde la subruta y ejecutar el primer paso real de Rapier al empujar. Recargar la URL, completar la recta y la curva, repetir, volver a editar y abrir el libro desbloqueado. Conservar versión y resultado del recorrido junto a la entrega.

## Validación con jugadores

Antes de fijar la geometría de la taza, reproducir en mesa real taza, libros, doce fichas, bolita y rampa de cartón. Pedir a dos personas, por separado, que conecten los mismos extremos y dibujar las rutas. Si el espacio induce un único camino, mover la taza o ajustar los apoyos y repetir con el inventario acordado.

Para la sesión en navegador, convocar a cinco personas nuevas. Cada una debe trazar y probar una S de ocho fichas, y después reparar una copia con una sola ficha desplazada. Registrar ambas tareas por persona y contar cuántas completan las dos sin ayuda. El objetivo es **al menos 4 de 5**. Para la taza, preparar un perfil de prueba con acceso al nivel y mostrar únicamente objetivo e inventario. Registrar primera ruta, ajuste tras el fallo, si aparecen las dos familias de solución, reconocimiento de fallo y victoria en silencio y primera elección tras ganar. Usar la planilla original para registrar resultados y observaciones. [Hoja de sesión](../arte/validacion.md#sesión-con-cinco-jugadores-nuevos)

[Índice técnico](README.md) · [Hitos de implementación](hoja-de-ruta.md)
