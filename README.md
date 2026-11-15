# Tuki

Rompecabezas 3D para escritorio y pantallas táctiles. Armá un recorrido sobre la mesa, empujá la primera ficha y derribá la que lleva la bandera. [Jugar en GitHub Pages](https://canni-dev.github.io/Tuki/)

## Desarrollo

Con la versión de Node de `.node-version`, ejecutar `npm ci` y `npm run dev`. El editor y la simulación comparten el catálogo de apoyos y los modelos de Blender. Las pruebas físicas funcionan sin DOM ni renderizador.

```sh
npm run typecheck
npm run test:run
node art/verify_models.mjs
npm run build -- --base=/Tuki/
npx playwright install chromium firefox
npm run test:e2e
```

Para activar el hook de este repositorio en cada clon de Windows o Linux, ejecutá `git config --local core.hooksPath .githooks`. Instalá las dependencias con `npm ci` y los navegadores con `npx playwright install chromium firefox` (en Linux, `npx playwright install --with-deps chromium firefox` instala también las bibliotecas del sistema).

Cada `git push` compila el árbol de trabajo con la base `/Tuki/` y prueba ese `dist/` con la suite completa de Chromium y Firefox en un puerto local propio. Si falla la compilación o Playwright, Git detiene el envío. Podés ejecutar la misma verificación con `git hook run pre-push`.

Desde la portada, **Jugar** lleva al siguiente desafío. En **Desafíos**, elegí una ficha del atril para visitar su mesa. La campaña tiene **16 desafíos y una variante opcional**. Incorpora «La bandera arriba», «Por encima de la taza», «El disparo a tiempo», «Esperá al puente», «Dos saltos» y «El contrapeso». Los dispositivos instalados vienen configurados y preconectados; los automáticos de la bandeja se pueden colocar y ajustar. El péndulo se conserva en el taller y la cuna fue reemplazada por el retenedor. La victoria depende de la cadena causal, sin exigir piezas específicas. En el Taller, para cablear un mecanismo, elegí «Conectar / desconectar» y tocá el borne de un mando y el del receptor. Repetir el par retira el cable. Arrastrá con el botón izquierdo para trazar una fila, con el derecho para orbitar y con Ctrl + derecho para desplazar la vista. La rueda acerca hacia el cursor. «Desplazar vista» alterna la función del derecho o de dos dedos. En pantalla táctil, colocá y trazá con un dedo, orbitá moviendo dos dedos y hacé pinza para acercarte hacia su centro. El desplazamiento se limita a la mesa y 2 cm de margen por borde; el zoom permite ver hasta 12 cm en el lado corto. «Ver mesa» recupera el encuadre inicial y el modo órbita. Podés girar la selección con el aro, con Q/E en pasos de 15° o con Mayús + Q/E en pasos de 1°.

En **Preferencias → Apariencia**, elegí **Claro**, **Oscuro** o **Según el sistema**. El modo oscuro combina controles carbón y crema con una mesa iluminada por luz cálida, sin fuentes visibles. La elección se guarda en el navegador; «Según el sistema» responde también a sus cambios mientras jugás. Alternar conserva el armado, la selección y la cámara. Las partidas anteriores mantienen el aspecto claro hasta elegir otro.

Seleccioná un dispositivo y elegí **Configurar dispositivo**. El lanzador permite inclinaciones de 30°, 45° y 60°, tres potencias y demoras de 0,5, 1 y 2 segundos; su parábola estimada aparece durante la edición. El retenedor libera por gravedad, la placa transfiere la energía de su resorte y el elevador recorre 12 cm según el balance de masas. En el taller, lanzador, retenedor y elevador también admiten activación por cable. Una señal anticipada se pierde. Lanzador y retenedor permiten alojar una bolita propia en modo cableado. Cada mecanismo nuevo realiza un solo ciclo por intento.

## Taller libre

Ganá «La recta» para abrir el taller. En Libros y Cajas podés elegir el tamaño original o grande de cada modelo. Los objetos de mesa toman como referencia el dominó de 5 cm. El mate mide 9 cm de cuerpo y la pava llega a 18 cm con el asa. Las victorias habilitan las demás piezas de cada mapa. Una mesa mide 84 × 52 cm y admite hasta 200 piezas en total, incluidas las fichas de inicio y de meta. Los cables no ocupan cupo. Colocá un inicio y una meta para probar la cadena. Podés apoyar un atlas entre dos cajas o dejar que sobresalga del tablero. Los parches verdes muestran dónde toca la base. Al soltar, se comprueba el equilibrio con el peso de toda la pila. Si movés una base, viajan las piezas que dependen enteramente de ella. Podés retirar un apoyo compartido cuando el conjunto siga estable. Durante la cadena, el escenario queda fijo.

El progreso y las preferencias se guardan en el navegador. Los armados de campaña duran la sesión. El taller guarda automáticamente las mesas con nombre en IndexedDB. Desde la biblioteca podés abrirlas, duplicarlas, borrarlas e importar archivos `.tuki.json`. Al ganar «La mesa del mate», seleccioná un receptor que tenga al menos dos mandos y elegí **Configurar secuencia**. Un golpe fuera de orden o dos golpes simultáneos bloquean ese receptor durante el intento. Las mesas nuevas usan **v6** y el perfil físico `dispositivos-1`. La biblioteca y los archivos v5 se migran conservando los originales. Para compartir tu construcción, elegí **Opciones de mesa → Exportar mesa** en la biblioteca o **Más acciones → Exportar mesa** mientras editás. Si una mesa libre importada usa piezas o secuencias pendientes, podés empujarla y ver qué mapas habilitan su edición.

Los 17 escenarios están compuestos por piezas completas del catálogo y se pueden copiar al Taller después de completarlos, desde **Más acciones → Copiar al taller**. La copia incluye el escenario y sus mecanismos, sin la solución de referencia. Hay cinco formatos de mesa y seis objetos nuevos: estuche, caja de útiles, caja de té, paquete rectangular, cuaderno y portalibros.

Desde una mesa libre, **Más acciones → Crear desafío** permite elegir objetos y conexiones instalados, inventario adicional y motivo. **El jugador puede cablear** es una opción del autor, desactivada por defecto. Podés editar la solución, probar como jugador y certificar tres ejecuciones antes de compartir un archivo `.tuki-desafio.json`. Los desafíos certificados se vuelven a verificar al importar; tienen progreso separado y permiten usar su inventario sin desbloqueos de campaña. La interfaz revela la solución al completar esa revisión. Los archivos incluyen la referencia para poder verificarla.

La [guía de diseño](docs/tecnica/diseno-de-niveles.md) y el [informe de normalización](docs/tecnica/normalizacion-campana.md) describen las reglas y verificaciones actuales. [Dispositivos v5](docs/tecnica/dispositivos-v5.md) y su [validación](docs/qa/dispositivos-v5.md) conservan el diseño y los resultados de la implementación anterior.

## Producción y aceptación

En los PR y en `main`, GitHub Actions comprueba tipos, valida modelos, ejecuta las pruebas unitarias y compila con la subruta del repositorio. Cuando pasan las cuatro verificaciones en `main`, publica ese `dist/` en GitHub Pages. Para revisar la compilación local, ejecutá `npm run preview -- --base=/Tuki/`. Los montajes de control están en `qa/fixtures/`. Desde una compilación local, el protocolo completo de Windows se ejecuta con `node qa/windows/aceptacion.mjs`.

La [aceptación del MVP](docs/qa/aceptacion.md) conserva sus 120 pasadas. El [informe de la ampliación](docs/qa/ampliacion.md) incluye los tres mapas nuevos y la mesa de 100 objetos. Para repetir esta matriz en Windows usá `node qa/windows/aceptacion.mjs --ampliacion`. Playwright utiliza el canal oficial de Firefox si está instalado en Windows. Para cotejar los archivos publicados con la compilación local y recorrer el juego desde un perfil limpio, ejecutar `node qa/publicacion.mjs`.

Para la sesión con jugadores, abrir el juego en un perfil limpio y dejar que completen «La recta». En «La curva», pedir que tracen y prueben la S. Entregar después `?sesion=reparar` para la copia con una ficha corrida. Usar `?sesion=inventar` para abrir directamente la taza en su estado inicial. Mantener los montajes resueltos reservados para el equipo. [Protocolo y planilla de las cinco sesiones](docs/arte/validacion.md)

La prueba con dos personas en mesa real y las cinco sesiones en navegador están pendientes. [Material para las sesiones](docs/qa/sesiones.md) · [Calibración y soluciones de control](qa/calibracion.md) · [Especificación funcional](docs/mvp-dominos-3d.md) · [Arte](docs/arte/README.md) · [Documentación técnica](docs/tecnica/README.md)
