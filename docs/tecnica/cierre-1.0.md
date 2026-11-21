# Cierre técnico de Tuki 1.0

La versión definitiva conserva la campaña, los controles, los modelos y el perfil físico `dispositivos-1` con Rapier 0.19.3. Las colisiones, masas, impulsos, paso fijo, orden de cuerpos y criterios de victoria permanecen sin cambios. La revisión física de un desafío es distinta de la revisión usada para resolver escrituras concurrentes.

## Documentos y guardado

Las mesas y desafíos llevan `esquema: "tuki"`, `tipo` y `version: 1`. El formato de mesa y el orden físico son explícitos. Se rechazan formatos anteriores; no existen migraciones ni lectura de sus claves. La base definitiva es `tuki.v1`. Las preferencias y victorias de campaña usan claves independientes bajo `tuki.v1.`. Los espacios antiguos no se consultan ni se borran automáticamente.

`almacen.ts` realiza transacciones de IndexedDB y confirma únicamente al completarse. Documento e índice se escriben juntos. Una escritura con revisión vencida crea una copia recuperada y deja intacto el original. Las escrituras siguientes de esa sesión continúan sobre la copia. Borrar exige la revisión mostrada al confirmar.

Los intentos se guardan en otra tabla: nunca reescriben el documento del autor. La firma excluye nombre y motivo, pero incluye identidad, revisión, geometría, inventario, permisos y circuitos. Un intento de otra revisión o modificado simultáneamente se recupera en una copia. Los progresos de campaña se acumulan por nivel; cambiar una preferencia no puede eliminar victorias ni otras preferencias.

`guardado-creaciones.ts` captura los cambios del editor y mantiene su identidad durante las escrituras. `guardado.ts` serializa y agrupa las escrituras pendientes, independientemente de la pantalla. Los errores dejan una indicación persistente con reintento y exportación; los borradores continúan disponibles en memoria. No se anuncia un guardado antes de su confirmación durable. Exportar desde el formulario del autor tampoco depende de que IndexedDB esté disponible.

## Autor, biblioteca y navegación

Instalados, inventario ofrecido y solución son categorías explícitas. Inicio y Meta nuevos se instalan; una edición incompatible con permisos de cableado o el límite de 200 objetos se rechaza antes de modificar el último documento legible. El historial aplica las mismas restricciones.

La biblioteca lista metadatos y valida solo la selección. Un fallo temporal del worker puede reintentarse. Los documentos ilegibles permanecen visibles, descargables y borrables por decisión del usuario. Los cambios de otras pestañas actualizan el índice; una respuesta tardía no puede reemplazar otra navegación. La copia de campaña bloquea activaciones repetidas mientras está pendiente.

`vista-biblioteca.ts` presenta el índice; `configuracion-editor.ts` presenta la configuración de dispositivos y secuencias. `main.ts` coordina navegación, entrada y partida. `presentacion.ts` contiene la interpolación reutilizable y la actualización visual por cuadro. Los datos de revisión y montajes se cargan mediante `revision.ts` solo en las rutas de QA.

## Carga, recursos y rendimiento

La física y el editor se importan al entrar en una mesa. Se cargan las familias de modelos presentes u ofrecidas; el Taller conserva todas las piezas que puede usar. Las respuestas musicales se precargan en segundo plano, con descarga acotada y reintento. Si todavía no están disponibles al ganar, no se reproduce un remate atrasado.

La trayectoria libera su geometría y material. La configuración del mecanismo forma parte de la identidad de su representación y recorrido de cable. La pérdida de WebGL detiene el avance; al restaurarlo se regeneran los recursos ambientales y se dibuja el mismo estado. La simulación no acumula el tiempo perdido por el contexto.

Los puntos aceptados del trazo mantienen su orden y su validación; solo se agrupa la presentación visual por cuadro. Las superficies invariantes se reutilizan mientras no cambia el armado. La interpolación reutiliza sus objetos sin alterar las poses físicas. No se reducen precisión ni frecuencia de simulación.

## Verificación local

Usar Node de `.node-version`, `npm ci` y `npx playwright install chromium firefox`. En el equipo Windows de aceptación deben estar instalados Chrome y Firefox de escritorio. `TUKI_CHROME`, `TUKI_FIREFOX` y `PLAYWRIGHT_BROWSERS_PATH` permiten indicar sus ubicaciones.

```powershell
npm run verify:local
npm run verify:local -- --force
```

El runner hace tipos, 62 modelos, toda la suite unitaria y física, compilación, E2E Chromium/Firefox, rendimiento de 100 y 200 objetos con GPU física y la matriz Windows. Comprueba los bytes de los recursos servidos y conserva informes en `.qa-local/resultados/`. Cualquier fallo, cambio de entradas durante la ejecución u omisión no justificada impide generar una constancia aprobada.

Las constantes de aceptación no se rebajan: se conservan todas las repeticiones y perturbaciones físicas. Las referencias de contactos se comprueban también en pruebas unitarias con la misma extracción usada en escritorio. Cuatro órdenes esperados estaban desactualizados; se corrigieron después de comparar los 12 montajes de campaña con el código anterior y obtener exactamente los mismos eventos, pasos, resultados y poses. La matriz unitaria se reparte entre cuatro archivos. La repetibilidad de dispositivos en E2E usa el mismo reloj controlado del bucle real y comprueba expresamente la velocidad normal y lenta. Las trazas de fallos conservan DOM, red y una captura del fallo; las capturas visuales explícitas de las pruebas se mantienen, sin grabar imágenes continuas de cada cuadro. En la aceptación de escritorio, la primera pasada de cada montaje mide cuadros con reloj real. Las nueve repeticiones usan el mismo bucle del juego y todos sus pasos físicos con marcas temporales controladas; no se presentan como mediciones de FPS. Las seis mediciones (laberinto y 100/200 objetos, en ambos navegadores) se ejecutan por separado con reloj real y GPU física. Solo las pruebas funcionales usan dos workers con contextos independientes; las mediciones de rendimiento y la aceptación se ejecutan en serie.

La constancia reutilizable incluye SHA-256 de fuentes, dependencias instaladas, ejecutables/DLL de navegadores, compilación, versión de Node, sistema, CPU, GPU/controlador, resolución, frecuencia y plan de energía. `--force` repite todo aunque coincidan. El hook local recibe de Git los commits efectivos del envío y verifica cada uno en una extracción aislada; nunca sustituye su contenido por cambios sin confirmar. Los resultados y extracciones son locales e ignorados por Git. El workflow de GitHub permanece intacto.

La advertencia de inicialización de Rapier procede de la dependencia fijada; no implica un lector de datos antiguo del juego. Actualizar esa dependencia exigiría una nueva calibración física y queda fuera de este cierre.

Los informes históricos mantienen sus fechas y resultados; no certifican esta compilación. Las sesiones pendientes con personas siguen identificadas como tales en la documentación de UX.
