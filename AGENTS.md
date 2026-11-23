# Trabajo en Tuki

Usar Node de `.node-version`. Leer [la política de pruebas](docs/tecnica/politica-pruebas.md) antes de validar cambios. Se conservan todos los tests y umbrales existentes.

## Pruebas durante el desarrollo

- Antes de ejecutar, inspeccionar el diff y mostrar el alcance con `npm run verify:changes -- --plan --base HEAD` para cambios sin commit, o `--base main` para revisar toda la rama. El selector es un mínimo: sumar regresiones de la funcionalidad modificada cuando el archivo mezcle responsabilidades.
- Ejecutar `npm run verify:changes -- --base HEAD` después de una modificación, antes de confirmarla. Si ya está confirmada, usar el commit/base anterior real. No usar un diff vacío para afirmar que el cambio está probado.
- Para motor, contactos, geometría física, dispositivos, tipos/perfil físico o construcción, ejecutar toda la suite unitaria y física. Nunca sustituirla por un solo mapa. El selector lo exige automáticamente.
- Para un nivel, conservar solución principal, alternativas, fallos y repetibilidad. Para UI/editor/guardado/audio, usar los grupos afectados; sumar con `--e2e qa/e2e/archivo.spec.ts` los recorridos que requiera el cambio. Las opciones adicionales solo amplían la selección.
- No ejecutar toda la matriz de navegador/Windows en cada edición o push de una rama de trabajo. No repetir pruebas que ya pasaron sin cambios, fallos o riesgos nuevos que lo justifiquen. No borrar tests, bajar repeticiones/tolerancias, cambiar expectativas de fallo ni usar `--no-verify` para ahorrar tiempo.
- En GitHub Actions conservar los controles anteriores: tipos, tipos del render, modelos, unitarias/física y compilación. No instalar navegadores ni ejecutar Playwright o `verify:changes` en CI. La selección de navegador se ejecuta localmente; el usuario indica cuándo correr la verificación completa Windows/GPU. Editar o actualizar un PR no autoriza esa corrida completa.
- Informar qué se ejecutó, duración, resultado y cobertura pendiente. Una verificación selectiva nunca acredita publicación.

## Responsable de QA: Luna 6

Delegar la selección razonada, ejecución y lectura de resultados a **un** subagente `tuki_qa`, definido en `.codex/agents/tuki_qa.toml`, con modelo `gpt-6-luna` y esfuerzo `high`. El agente principal conserva implementación y revisión de riesgos. Esto autoriza esa delegación para las tareas de este repositorio.

Si la herramienta permite elegir modelo pero no agentes personalizados, crear el subagente con `model="gpt-6-luna"`, `reasoning_effort="high"`, `fork_turns="none"` y transmitirle alcance, base, comandos e instrucciones de QA. No heredar un modelo más caro por omitir esos parámetros. El subagente no debe delegar de nuevo ni modificar producto/expectativas para que las pruebas pasen. No ejecutar suites pesadas simultáneas en este equipo.

Si Luna 6 o los subagentes no están disponibles, informar esa limitación y ejecutar la misma política con el agente disponible; nunca omitir validación ni afirmar haber usado Luna. Las instrucciones y permisos de mayor prioridad prevalecen.

## Antes de publicar

- El hook verifica el SHA enviado, aislado del árbol de trabajo. Las ramas de trabajo usan selección; destinos `main`, `master`, `release`/`release/*` y tags usan `verify:local` completo.
- Integrar en `main` no publica. Solo ante una solicitud de publicación, ejecutar `npm run publish:verified` desde el commit que coincide con `main` remoto. El comando verifica completamente en Windows/GPU y solicita el workflow; este exige la misma revisión y huella del artefacto. No disparar manualmente el workflow con una constancia inventada o de otra revisión.
- Una solicitud de editar, testear o hacer commit no autoriza push, integración ni publicación.

## Revisión

Al agregar módulos o tests, actualizar `qa/politica-pruebas.mjs` y sus pruebas si corresponde. Investigar rutas desconocidas: por defecto amplían la cobertura. Revisar renombres, borrados, cambios de dependencias y archivos transversales. No reducir un grupo solo para acortar la ejecución del cambio actual.
