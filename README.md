# Tuki

Rompecabezas 3D para escritorio y mouse. Armá un recorrido sobre la mesa, empujá la primera ficha y derribá la que lleva la bandera. [Jugar en GitHub Pages](https://canni-dev.github.io/Tuki/)

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

La campaña tiene ocho desafíos y una variante opcional. Cada mesa empieza con el escenario, el inicio y la meta. El jugador construye el recorrido desde la bandeja. Después de «Alrededor de la taza» se abren «A la vuelta» y la variante «La llave de paso». Luego vienen «El subibaja», «La puerta del estuche» y «El puente a tiempo». La llave, la puerta y el puente vienen conectados. La palanca se acciona de costado y el botón desde arriba. En el Taller, para cablear un mecanismo, elegí «Conectar / desconectar» y tocá el borne de un mando y el del receptor. Repetir el par retira el cable. Arrastrá con el botón izquierdo para trazar una fila, con el derecho para orbitar y usá la rueda para acercarte. Podés girar la selección con el aro, con Q/E en pasos de 15° o con Mayús + Q/E en pasos de 1°.

## Taller libre

Ganá «La recta» para abrir el taller. Cada victoria habilita las piezas de ese mapa. Una mesa mide 84 × 52 cm y admite 100 objetos. Colocá un inicio y una meta para probar la cadena. Si movés un libro, sus piezas se mueven con él. Para retirarlo, primero despejá su tapa.

El progreso y las preferencias se guardan en el navegador. Los armados de campaña duran la sesión. El taller guarda automáticamente las mesas con nombre en IndexedDB. Desde la biblioteca podés abrirlas, duplicarlas, borrarlas e importar archivos `.tuki.json`. Para compartir tu construcción, abrila y elegí **Exportar mesa**. Si una importada usa piezas pendientes, podés empujarla y ver qué mapas habilitan su edición.

## Producción y aceptación

GitHub Actions prueba la distribución en la subruta del repositorio y publica `dist/` desde `main`. Para revisarla localmente, ejecutar `npm run preview -- --base=/Tuki/`. Los montajes de control están en `qa/fixtures/`. Desde una compilación local, el protocolo completo de Windows se ejecuta con `node qa/windows/aceptacion.mjs`.

La [aceptación del MVP](docs/qa/aceptacion.md) conserva sus 120 pasadas. El [informe de la ampliación](docs/qa/ampliacion.md) incluye los tres mapas nuevos y la mesa de 100 objetos. Para repetir esta matriz en Windows usá `node qa/windows/aceptacion.mjs --ampliacion`. Playwright utiliza el canal oficial de Firefox si está instalado en Windows. Para cotejar los archivos publicados con la compilación local y recorrer el juego desde un perfil limpio, ejecutar `node qa/publicacion.mjs`.

Para la sesión con jugadores, abrir el juego en un perfil limpio y dejar que completen «La recta». En «La curva», pedir que tracen y prueben la S. Entregar después `?sesion=reparar` para la copia con una ficha corrida. Usar `?sesion=inventar` para abrir directamente la taza en su estado inicial. Mantener los montajes resueltos reservados para el equipo. [Protocolo y planilla de las cinco sesiones](docs/arte/validacion.md)

La prueba con dos personas en mesa real y las cinco sesiones en navegador están pendientes. [Material para las sesiones](docs/qa/sesiones.md) · [Calibración y soluciones de control](qa/calibracion.md) · [Especificación funcional](docs/mvp-dominos-3d.md) · [Arte](docs/arte/README.md) · [Documentación técnica](docs/tecnica/README.md)
