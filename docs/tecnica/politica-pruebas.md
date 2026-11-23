# Pruebas por tipo de cambio

La selección reduce la frecuencia de las suites largas, sin eliminar pruebas ni alterar precisión, repeticiones o expectativas. El control completo se conserva para publicación. Esta política reemplaza la obligación histórica de ejecutar la aceptación completa en cada push.

## Comandos

```powershell
# Durante una edición, sobre los cambios sin commit (incluye nuevos archivos)
npm run verify:changes -- --plan --base HEAD
npm run verify:changes -- --base HEAD

# Todo el cambio de la rama respecto de main
npm run verify:changes -- --plan --base main
npm run verify:changes -- --base main

# Agregar cobertura semántica al mínimo automático
npm run verify:changes -- --base HEAD --e2e qa/e2e/audio.spec.ts

# Revisión exacta, aislada, como hace el pre-push
npm run verify:changes -- --ref HEAD --base main

# Control completo, sin publicar
npm run verify:local

# Solo cuando se quiere publicar el commit actual de main remoto
npm run publish:verified
```

Sin `--base`, se usa el ancestro común con `origin/main` (o `main` local). Sin historia suficiente, se consideran todos los archivos. Un `--base` explícito inválido falla. `--plan` solo describe; no acredita pruebas. Los informes selectivos y tiempos quedan en `.qa-local/cambios/` y no son constancias de publicación.

## Matriz mínima

| Tipo | Durante el desarrollo |
| --- | --- |
| Documentación/instrucciones | Revisión del contenido; sin física ni navegador |
| Motor, contactos, perfil/tipos, formas, construcción, dispositivos | **Toda** la suite unitaria/física y regresiones de navegador; Chromium y Firefox |
| Un nivel o sus fixtures | Normalización de ese nivel, alternativas, vacío/pieza esencial, diez repeticiones, lenta, 24 perturbaciones, fallos y navegador correspondiente |
| Editor/trazado/colocación | Unitarias de edición e invariantes; controles y vuelta de prueba a edición; navegador de trazado/cableado cuando corresponde |
| Persistencia/importación/progreso | Guardado, recuperación, compatibilidad, desafíos y desbloqueo en ambos navegadores |
| Audio/victoria | Audio, efecto de victoria y causalidad en ambos navegadores |
| Cámara/interfaz/render | Unitarias asociadas y controles/vistas funcionales en Chromium; agregar Firefox ante diferencias o código específico |
| Integración (`main.ts`, QA runtime) | Suite unitaria/física y recorridos representativos en ambos navegadores; el agente agrega los flujos afectados por el diff |
| Herramientas de QA | Pruebas del selector, hook y publicación |
| Locks, configuración o rutas no clasificadas | Unitarias/física y navegador funcional completos en ambos motores |

Los grupos se unen. Los casos con recorridos de varios niveles dentro del mismo test se ejecutan completos; no se adivina cobertura por el nombre. Un borrado amplía a cobertura funcional completa. Nuevos módulos requieren revisar el mapa. `package.json` cubre comandos, tipos, suite unitaria/física y navegador representativo; los locks y configuración del entorno amplían a toda la matriz funcional. Nunca se ejecuta la aceptación de GPU/Windows como consecuencia de un cambio desconocido en una rama de trabajo.

El selector automatiza un mínimo por archivos, no interpreta cada línea de `main.ts`. El agente debe sumar la regresión del comportamiento cambiado. El reloj controlado existente puede usarse en resultados/guardado; audio temporal, animaciones y FPS conservan reloj real cuando sea necesario. Los benchmarks GPU siguen en serie. No se introdujo caché selectiva: la constancia completa mantiene su caché estricta por fuentes, herramientas, navegadores y entorno.

## Hook y CI

Activar en cada clon: `git config --local core.hooksPath .githooks`.

El pre-push usa las tuplas reales de Git, el **destino remoto** y el SHA local que se envía. Para actualizar una rama toma el ancestro común con su SHA remoto anterior; en el primer envío busca la base de main. Un tag anotado se resuelve a commit. El contenido se extrae en `.qa-local/revisiones/`, con dependencias del lock correspondiente; los cambios sin commit no pueden aprobar otro commit. Los borrados de refs no tienen código nuevo para verificar. Si el mismo SHA se envía también a main/tag, prevalece la verificación completa.

Ramas de trabajo: selección. `main`, `master`, `release`, `release/*` y tags: `verify:local` completo. No hay bypass de validación nuevo.

En PR, GitHub instala los navegadores y ejecuta la misma selección contra la base del PR. En main corre tipos, modelos, unitarias/física y build para detectar problemas de integración, **sin publicar**.

## Publicación explícita

Requiere Windows de aceptación, Node fijado, dependencias, Chrome/Firefox de escritorio, Chromium/Firefox de Playwright y GitHub CLI (`gh`) autenticado con acceso al repositorio y sus workflows. `TUKI_CHROME`, `TUKI_FIREFOX` y `PLAYWRIGHT_BROWSERS_PATH` conservan su función.

`npm run publish:verified` comprueba que HEAD sea main remoto, ejecuta `verify:local --ref SHA` y solo después solicita `pages.yml`. Reutiliza una constancia completa únicamente si coincide la huella estricta vigente. Las pruebas incluyen tipos, modelos, toda la suite unitaria/física, recursos servidos, todos los E2E Chromium/Firefox, rendimiento y calidad GPU, y aceptación Windows. No admite informes selectivos. Si main avanza durante las pruebas, se detiene.

El workflow de publicación recibe una constancia resumida sin datos del equipo, exige el SHA exacto de main, recompila y coteja SHA-256 de todos los archivos de `dist` contra la compilación aceptada. Solo después sube el artefacto y despliega. Una diferencia entre compilaciones Windows/Linux bloquea la publicación y debe investigarse; no se puede ignorar el cotejo. La constancia proviene del operador autorizado que ejecuta el comando; no es una firma criptográfica ni reemplaza los permisos de GitHub. No editar sus campos para forzar un despliegue.

## Codex y Luna 6

`AGENTS.md` aplica la política al repositorio; `.codex/agents/tuki_qa.toml` define el responsable de QA con `gpt-6-luna`. El agente principal delega las pruebas a ese modelo y mantiene la revisión técnica. Las sesiones deben cargar las instrucciones actualizadas; las herramientas que no permiten agentes personalizados pueden delegar con modelo explícito. Si no hay Luna/subagentes, se informa y se conserva la validación.

Esta configuración es del proyecto, no cambia el modelo global. Las instrucciones orientan al agente; el hook y el workflow ejecutan los controles. [Guía oficial de AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) y [agentes personalizados](https://learn.chatgpt.com/docs/agent-configuration/subagents).
