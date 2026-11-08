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

El selector empieza con «La recta». Hay seis dominós para unir dos fichas separadas por 16,2 cm. Al ganar se abre «La curva», donde se puede rodear un vasito por cualquiera de sus lados. En la mesa se puede trazar con arrastre izquierdo, orbitar con el derecho y acercar con la rueda. El aro gira la pieza seleccionada. Escape cancela el gesto. El progreso y las preferencias se guardan en el navegador y los armados duran la sesión.

## Producción y aceptación

GitHub Actions prueba la distribución en la subruta del repositorio y publica `dist/` desde `main`. Para revisarla localmente, ejecutar `npm run preview -- --base=/Tuki/`. Los montajes de control están en `qa/fixtures/`. Desde una compilación local, el protocolo completo de Windows se ejecuta con `node qa/windows/aceptacion.mjs`.

La [aceptación en Windows](docs/qa/aceptacion.md) registra las 120 pasadas y el rendimiento en la misma PC. Playwright utiliza el canal oficial de Firefox si está instalado en Windows. Para cotejar los archivos publicados con la compilación local y recorrer el juego desde un perfil limpio, ejecutar `node qa/publicacion.mjs`.

Para la sesión con jugadores, abrir el juego en un perfil limpio y dejar que completen «La recta». En «La curva», pedir que tracen y prueben la S. Entregar después `?sesion=reparar` para la copia con una ficha corrida. Usar `?sesion=inventar` para abrir directamente la taza en su estado inicial. Mantener los montajes resueltos reservados para el equipo. [Protocolo y planilla de las cinco sesiones](docs/arte/validacion.md)

La prueba con dos personas en mesa real y las cinco sesiones en navegador están pendientes. [Material para las sesiones](docs/qa/sesiones.md) · [Calibración y soluciones de control](qa/calibracion.md) · [Especificación funcional](docs/mvp-dominos-3d.md) · [Arte](docs/arte/README.md) · [Documentación técnica](docs/tecnica/README.md)
