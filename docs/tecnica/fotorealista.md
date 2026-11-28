# Visuales fotorealistas opcionales

Implementación en `codex/modo-fotorealista`, iniciada desde `main` en `531a65b3e9c106991ec20414f089038633d43b35`. No sustituye el render Actual, no modifica los GLB ni la simulación y no implica una publicación. El acabado visual se debe revisar junto a las capturas: esta implementación no demuestra por sí sola una equivalencia con una producción AAA.

## Uso y compatibilidad

En Preferencias, **Apariencia** sigue controlando Claro/Oscuro/Según el sistema. **Visuales** ofrece **Default** (predeterminado) y **CALIDAD**, con **Perfil: Alta/Equilibrada**. Los identificadores persistidos siguen siendo `actual`/`fotorealista`, para conservar preferencias existentes. El tema y el progreso son independientes.

La primera activación realiza una sola operación de comprobación que mide **ambos perfiles, secuencialmente**, con una mesa de control independiente y física real. Por perfil y tema se separan dos segundos de calentamiento y cinco segundos medidos, al máximo de píxeles del perfil aunque la ventana sea pequeña. Se mantienen p95 ≤ 20 ms, p99 ≤ 33,3 ms y al menos 150 muestras válidas por tema. Si Alta no pasa y Equilibrada sí, se activa Equilibrada; no se habilitan perfiles no aprobados ni se cambia de perfil durante una jugada.

La prueba dibuja en un render target fuera de pantalla, con resolución y antialiasing del perfil, y espera la finalización de la cola GPU entre muestras. Nunca se muestra la escena de prueba ni se ensaya con la pestaña oculta. Ocultar la pestaña cancela un ensayo en curso; una pestaña que comienza oculta aplaza la activación. Un indicador discreto permite cancelar. No se adelanta la simulación del jugador ni se alteran cámaras o controles.

**Al recargar con CALIDAD seleccionada**, el canvas de Default permanece oculto desde antes de crear la escena. Se conserva el fondo del tema y un progreso cancelable. La portada no empieza su animación hasta que el primer fotograma WebGPU de la escena real está terminado. El reloj de presentación pausa portada y transiciones durante la preparación; las pausas de contexto gráfico y carga que se superponen se cuentan una sola vez. No basta con ocultar una animación que continúa avanzando. Default conserva su arranque normal.

La comprobación se guarda atómicamente en `localStorage`, bajo `tuki.render.comprobacion`: versión de formato, fecha y resultados por perfil. Los resultados negativos también se conservan: no habilitan CALIDAD ni generan repeticiones automáticas. El menú muestra **✓ CALIDAD comprobada** y los perfiles aprobados; si ninguno pasó, indica comprobación realizada sin perfiles habilitados. La tilde permanece al seleccionar Default. Repetir es una acción voluntaria dentro de **Opciones de comprobación**.

No hay caducidad, firma de GPU/navegador ni revisión del pipeline que invalide automáticamente un chequeo guardado. Las aprobaciones anteriores de `tuki.render.aprobacion.alta` y `tuki.render.aprobacion.equilibrada` se migran conservando solo los perfiles realmente aprobados y se retiran las claves viejas para evitar restaurarlas después de borrar datos. Una aprobación antigua de un solo perfil no inventa un resultado para el otro: completarlo requiere la acción voluntaria de repetir. Borrar los datos del sitio elimina la comprobación; si el navegador impide persistir, se informa que el resultado dura solo esa pestaña. Datos corruptos no habilitan perfiles.

Cada activación mantiene la comprobación técnica de contexto seguro, adaptador, límites e inicialización real de WebGPU, **sin repetir el benchmark guardado**. Un fallo de carga, compilación o dispositivo vuelve a Default para esa sesión, conservando la preferencia y la comprobación. La preparación tiene cancelación y un límite de 120 segundos. Una repetición voluntaria reemplaza los resultados solo cuando termina ambos perfiles; cancelar conserva el registro anterior.

Los talleres grandes pueden exceder la carga representativa. La comprobación guardada no garantiza rendimiento futuro tras cambiar de equipo o controlador; se conserva por la política de producto solicitada. No se ofrece un CALIDAD WebGL2 automático: la ruta mejorada WebGL2 permanece solo en el laboratorio.

## Arquitectura

El selector **Cámara** es independiente de Visuales: ortográfica o perspectiva con campo vertical fijo de 30°. El contrato identifica la proyección real; el módulo aislado utiliza el tipo de cámara correspondiente para transmisión y reconstrucción de profundidad. En WebGPU se conserva un pipeline de efectos por proyección, creado bajo demanda y liberado al cerrar la sesión, evitando recrear recursos internos de transmisión en cada alternancia. La distancia y el objetivo permanecen fijos durante la órbita. El plano cercano de la perspectiva escala con la distancia para preservar los detalles impresos de los modelos, sin alterar geometrías ni materiales.

| Parte | Responsabilidad |
|---|---|
| `src/espacio.ts` | Conserva el render r180, escena de juego, cámara, canvas de entrada y su invalidación. Un hook permite delegar únicamente el dibujo principal. |
| `src/render/contrato.ts` | Datos de presentación independientes de Three: geometría, grupos, mapas, matrices, tipo y parámetros de proyección (ortográfica/perspectiva) y materiales. |
| `src/render/presentacion.ts` | Extrae la representación sin entregar instancias de Three r180 al nuevo módulo. Copia buffers por revisión y matrices por cuadro. |
| `src/render/control.ts` | Compatibilidad, carga diferida, cancelación, activación, recuperación y caché de miniaturas. |
| `src/render/aprobacion.ts` | Comprobación única persistente, resultados de ambos perfiles y migración de aprobaciones anteriores. |
| `src/render/sondeo.ts` | Mesa de control independiente; utiliza la física existente sin cambiar sus parámetros. |
| `src/render/laboratorio.ts` | Comparación A/B/C, captura de poses y reproducción con reloj de juego suspendido. Solo se importa mediante la API de revisión. |
| `render/fotorealista/` | Paquete independiente con `three` y `@types/three` fijados en 0.187.0; WebGL2 de comparación y WebGPU/TSL. |
| `render/recursos.mjs` | Verifica los originales CC0 de nogal, arce e iluminación, prepara los entornos por perfil y genera mapas de microdetalle repetibles. |
| `render/assets/natural-walnut-veneer/` | Tres mapas originales de Poly Haven, procedencia, licencia y hashes. La compilación no descarga recursos externos. |
| `render/fotorealista/src/nogal.ts` | Mapeado métrico de la veta en la mesa, los ensambles y las piezas de madera. |
| `render/build.mjs` | Empaqueta el módulo aislado y verifica que no incorpore Three r180. Genera `public/fotorealista`, ignorado por Git. |

`npm ci` instala también el paquete aislado mediante `postinstall`. Vite genera el bundle y los recursos tanto desde su API como desde `npm run dev` y `npm run build`. Para editar el módulo aislado con el servidor ya abierto, ejecutar `npm run render:build` y recargar la página. `npm run render:typecheck` verifica sus tipos por separado.

No se comparte ningún `Object3D`, material, textura, cámara o renderer entre revisiones. El contrato admite arrays numéricos y fuentes de imagen del navegador. La ruta nueva reconstruye su escena con las mismas geometrías y transformaciones. El canvas WebGPU se superpone sin recibir eventos; el canvas original mantiene picking y controles. Solo una ruta dibuja la escena principal. Actual conserva sus recursos para poder recuperarse inmediatamente.

Los materiales y geometrías compartidos se serializan una vez por cuadro. Las partes GLB opacas repetidas se agrupan en `InstancedMesh`, con matrices independientes; la identidad, selección y colisiones continúan en la escena original. El vidrio, las ayudas de edición y los efectos personalizados mantienen objetos separados. Se agrupa por geometría, materiales, familia, sombras y orden de render, y se liberan los buffers de instancias al desaparecer un grupo. Esta optimización se utiliza tanto en B como en C para mantener comparable su carga.

Las miniaturas nuevas emplean escena, cámara y render target reutilizables de 120 × 120, iluminación neutra y caché por pieza. Se restauran las miniaturas originales al salir. Un fallo de lectura conserva la miniatura Actual y queda registrado en el diagnóstico, sin modificar exposición ni tamaño del render principal.

## Materiales e iluminación

La base de ambos perfiles incluye iluminación directa, sombras, entorno prefiltrado, materiales físicos, transmisión y oclusión de contacto. Se mantiene ACES y salida sRGB. La exposición es fija por tema.

- En Claro, la ventana da un reflejo amplio y el relleno cálido permite leer la veta en las sombras.
- En Oscuro, el foco ilumina la tapa de nogal y el entorno de la lámpara aporta reflejos ámbar. La pantalla de desafíos de la versión publicada sirve de referencia para el tono miel y la luminosidad.
- La mesa usa Natural Walnut Veneer de Poly Haven (Jenelle van Heerden, CC0). Ambos perfiles comparten el color a 2K en sRGB y las normales OpenGL y la rugosidad a 1K como datos lineales. El tinte cálido es `#c8a582`, con normalScale .4, metalness 0, roughness 1, clearcoat .06 y clearcoatRoughness .55.
- Mapeado de la mesa: un metro por unidad UV, compensando la escala de cada objeto. Todos los formatos admitidos caben en un recorte del escaneo, sin teselarlo sobre la tapa. La veta sigue el largo de la tapa y travesaños y la vertical de las patas; los cantos representan una terminación chapada. Se copian únicamente las UV de la representación fotorealista, conservando posiciones, índices, GLB y geometrías originales. Las UV se cachean por geometría y escala y no se deslizan con cámara o transformación rígida.
- Las piezas de arce emplean la chapa White Maple Veneer, con color a 1K o 2K según el perfil y normales OpenGL y rugosidad compartidas a 1K. En los cantos del dominó, los tres mapas usan un recorte de veta longitudinal con tinte miel. El contraste del color y la escala del recorte permiten distinguir las fibras en los 8 mm de espesor desde la cámara de juego. Las demás piezas conservan el mapeado de un metro por unidad UV.
- En WebGPU, cada grupo visible de puntos del dominó conserva sus centros y radios. Su superficie marfil calcula la intersección del rayo de vista con un casquete esférico en ambas caras. El filtrado por tamaño en pantalla conserva los puntos en vistas lejanas. La línea central se identifica por separado.
- Los acabados de papel, cartón, tejido, gres, metal, laca y corcho usan mapas lineales en los que RG codifica la pendiente y B la rugosidad. El patrón cubre 16 mm y sus mipmaps suavizan las fibras y poros en movimiento. Los cantos de las hojas y el desgaste de la laca están anclados a la pieza.
- El vidrio ahumado utiliza transmisión, IOR 1,5, absorción verde y espesor de 12 mm. Las bandas ámbar y opalina marcan el giro de la bola.
- El contacto se calcula con profundidad y normales geométricas de sólidos y suelo. El GTAO filtrado alimenta la oclusión de la iluminación indirecta de los materiales físicos opacos. El vidrio, la emisión y la iluminación directa conservan su propia respuesta.

Los reflejos diurnos proceden de *Poly Haven Studio* y los nocturnos de *Studio Small 07*. La compilación filtra las fuentes más intensas en luz lineal antes del prefiltrado de entorno. El render orienta el entorno respecto de la luz principal del tema y mantiene la exposición fija. Los originales, licencias y huellas SHA-256 se encuentran en `render/assets/taller`.

En la pava, la bombilla y la lata, las marcas de pulido siguen una proyección continua en el espacio de la pieza. El gradiente de altura perturba la normal suavemente al pasar del cuerpo redondo a la tapa.

El brillo de la meta que usaba `onBeforeCompile` tiene equivalente TSL. Las motas de victoria que usaban `ShaderMaterial` se representan con pequeños planos orientados a la cámara, evitando el límite de tamaño de puntos de WebGPU. Sus nodos de color/opacidad conservan las salidas MRT requeridas por el contacto.

Los aros de selección `LineLoop`, no admitidos por WebGPURenderer, se convierten a segmentos cerrados en la representación nueva. Se conservan el rango visible, los índices y los grupos de material; la geometría original y el picking no cambian.

La iluminación amplia y sus sombras son una aproximación en tiempo real, no una simulación de área ni un cálculo completo de luz indirecta. La transmisión depende de la información disponible en pantalla; no resuelve todas las capas de vidrio entre sí ni objetos fuera del encuadre. Los entornos aportan reflejos estables pero no reflejan cada pieza dinámica.

SSGI y SSR se pueden seleccionar individualmente en el laboratorio. **No están habilitados en los perfiles del producto**: SSGI requiere validar sus supuestos de cámara perspectiva y los reflejos en pantalla pierden información al salir del encuadre. La base prioriza estabilidad y lectura de la bolita. No incluye path tracing, cáusticas, profundidad de campo, motion blur ni efectos de lente.

## Presupuestos

| Perfil | Píxeles efectivos máximos | Sombras | Mapas principales | Contacto |
|---|---:|---:|---:|---:|
| Equilibrada | 1920 × 1080 equivalentes | 2048 | 1024 | Media resolución, 12 muestras |
| Alta | 2560 × 1440 equivalentes | 4096 | 2048 | Resolución completa, 24 muestras |

Se conserva la proporción del viewport; el límite es de cantidad total de píxeles, no de tamaño CSS. La transmisión utiliza el framebuffer del perfil, de menor resolución efectiva en Equilibrada.

El generador registra los bytes de cada recurso gráfico en `recursos/manifest.json` y aplica topes de 12 MiB para Equilibrada y 24 MiB acumulados. Los mapas compartidos se cuentan una sola vez. JavaScript, GLB del juego y memoria GPU se miden por separado.

La incorporación del nogal usaba anteriormente la firma `r187-contacto-nogal-3`. Esas aprobaciones se migran al registro único actual sin repetir el chequeo; las revisiones de materiales o del pipeline ya no invalidan automáticamente los datos guardados.

El bundle aislado incluye ambos candidatos de comparación y se descarga al optar por Fotorealista. No está enlazado como un módulo estático del render Actual. Los contadores `renderer.info.memory` de r187 permiten registrar recursos y una estimación de bytes; no equivalen a una medición del proceso completo ni de toda la VRAM física. Actual sigue residente durante Fotorealista.

## Laboratorio y reproducción

Usar una página de desarrollo o preview con `?revision`. Primero cargar `vuelta` y seleccionar una ruta. La API de laboratorio no es una preferencia persistente.

```js
await tukiQA.cargar('vuelta')
await tukiQA.render.seleccionar('actual')                 // A: r180
await tukiQA.render.seleccionar('webgl2', 'alta', 'base')  // B: r187
await tukiQA.render.seleccionar('webgpu', 'alta', 'base')  // C: r187
// Variantes C: 'contacto', 'ssgi', 'ssr', evaluadas por separado.
```

`qa/render/comparar.mjs` toma pares en reposo; `qa/render/reproducir.mjs` graba seis segundos de física una sola vez, conserva poses/cámara/recursos, y reproduce la misma secuencia en bucle. La reproducción suspende el reloj del juego y restaura matrices y visibilidad al finalizar. No ejecuta las tres rutas simultáneamente. B/C comparten mapas, geometría y tratamiento de color; el filtro de sombras de C es propio y estable, por lo que no se afirma identidad píxel a píxel con B.

Para comparar el acabado del taller, servir la revisión inicial y la candidata y definir sus URL en `TUKI_BEFORE_URL` y `TUKI_BASE_URL`. Ejecutar con Node de `.node-version`:

- `node qa/render/detalle-domino.mjs` captura ambas caras de las tres variantes en Alta y Equilibrada, de frente y a ras. La galería incluye el gres junto al acero y un detalle de la encuadernación y el papel. También comprueba muestras del fondo.
- `node qa/render/mesas-calidad.mjs` compara las cámaras y poses de las tres mesas, incluida la caída de La recta. Comprueba la identidad de píxeles de Default y las solicitudes de recursos.
- `node qa/render/paridad-partida.mjs` inicia un servidor local y compara las poses, contactos y eventos por paso al jugar una victoria y un fallo en los dos modos.

```powershell
$env:TUKI_BASE_URL='http://127.0.0.1:4176/?revision'
$env:TUKI_CHROME='C:/ruta/al/chrome.exe'
node qa/render/activar.mjs
node qa/render/aprobacion.mjs
node qa/render/barrido.mjs
node qa/render/nogal.mjs
node qa/render/estabilidad.mjs
node qa/render/recorridos.mjs
node qa/render/carga.mjs
node qa/render/comparar.mjs
# Predeterminado: WebGPU + contacto, Alta, 5 × 60 s por tema.
node qa/render/reproducir.mjs
```

Variables del ensayo: `TUKI_RENDER_BACKEND` (lista A/B/C en reproducción), `TUKI_RENDER_EFFECT`, `TUKI_RENDER_QUALITY`, `TUKI_RENDER_FIXTURE`, `TUKI_RENDER_SECONDS`, `TUKI_RENDER_RUNS`. `TUKI_RENDER_VIDEO=1` captura una sesión separada; sus tiempos no se usan como benchmark. Los resultados y capturas se guardan en `.qa-local/fotorealista/`. La medición cuenta intervalos de `requestAnimationFrame` y tiempo CPU de envío, **no tiempo de ejecución GPU obtenido con timestamps**.

`qa/render/activar.mjs` comprueba la habilitación, estado conservado, miniaturas, victoria con movimiento completo y retorno a Actual. `aprobacion.mjs` verifica una comprobación de ambos perfiles, recarga sin fotogramas Default, portada completa, tilde en Claro/Oscuro, migración, cancelación, HTTP 503 y conservación del chequeo tras pérdida GPU. `estabilidad.mjs` prueba cancelación, veinte alternancias de modo/tema y destrucción real del dispositivo de prueba. `recorridos.mjs` cubre portada, campaña y talleres, incluidas mesas de 100/200 objetos y dispositivos; `carga.mjs` separa primera imagen del jugador y disponibilidad jugable, con red de 25 Mbps/40 ms y caché fría/caliente. Desde la corrección de calibración oculta, esa primera imagen excluye el ensayo: no comparar su tiempo directamente con el informe inicial de la feature.

`qa/render/jugadas.mjs` mide también la ruta completa de producción con física y sincronización de escena, repitiendo jugadas durante un minuto por mesa y tema. `integrada.mjs` solicita el adaptador de bajo consumo en una página de prueba, sin modificar Windows: si el navegador sigue ofreciendo NVIDIA, no informa esa ejecución como una medición de equipo modesto.

`cancelacion.mjs` cubre descarga lenta, bloqueo del atajo de empuje, cancelación, ocultación de pestaña, error de red y reintento. `angulos.mjs` captura A/B/C con las mismas cámaras acercada, orbital y superior, usando los controles existentes.

`orbita-jugada.mjs` graba cuatro jugadas reales, una por tema y perfil, mientras gira la cámara 360° con los controles existentes; comprueba el giro y la victoria y guarda acercamientos y capturas durante el movimiento. Primero obtiene aprobaciones reales sin grabación y después las reutiliza en el contexto de vídeo. Es una revisión visual separada: sus tiempos con vídeo no se usan como medición de rendimiento. `TUKI_ORBIT_OUTPUT` permite separar la evidencia de cada revisión.

`camara.mjs` valida el selector en Default y Calidad, ambos temas y proyecciones, con 288 posiciones orbitales (12 azimuts × 3 elevaciones por combinación), capturas, recarga, portada, selección y jugada real. Comprueba 12 alternancias y que los recursos gráficos dejen de crecer tras el calentamiento; también revisa Equilibrada. `TUKI_APPROVAL_INPUT` puede señalar un informe previo de `aprobacion.mjs` para reutilizar una comprobación real, sin repetirla. La salida queda en `.qa-local/fotorealista/camara` o `TUKI_CAMERA_OUTPUT`. Es una regresión funcional y visual, no un benchmark de FPS.

## Fondo continuo por tema

Default y Calidad comparten la paleta de `src/fondo.ts`: verde oscuro `#070f0e` → `#1b271d`, marfil claro `#f4eee2` → `#e9dfcb`. El gradiente vertical usa smoothstep en RGB lineal y se fija a la pantalla; girar, desplazar o cambiar de proyección no mueve un horizonte. El CSS de carga se genera de esa misma paleta.

Cada renderizador dibuja su propio fondo dentro de la escena, también disponible para la transmisión del vidrio. El suelo conserva su geometría, profundidad y recepción de sombras, pero su color reproduce el gradiente y solo se atenúa con el shadow map (máximo 35% en oscuro y 45% en claro). No recibe el tinte cálido de las luces. No se modifican luces, exposición, entornos de reflexión, nogal ni materiales de piezas.

En Calidad, el alfa del color distingue los objetos HDR del fondo y del suelo antes de aplicar ACES. En los experimentos de SSR y SSGI esa máscara viaja en el buffer de normales. El suelo aporta profundidad al contacto de los objetos y recibe sus sombras del shadow map. El puente transmite la paleta y el identificador `floor`.

`node qa/render/fondo.mjs` recorre recta/vuelta, Default/Alta/Equilibrada, ambos temas y cámaras: 984 poses con ocho azimuts, elevaciones 12/15/18/35/85° y vista superior. Comprueba continuidad/color en el horizonte, estado y encuadre conservados, veinte alternancias, recarga con entrada y jugada real. Reutiliza una aprobación real mediante `TUKI_APPROVAL_INPUT`; no vuelve a calificar el equipo. `TUKI_FONDO_FAST=1` limita el recorrido y `TUKI_FONDO_OUTPUT` cambia la carpeta de evidencia. Las capturas y tiempos de este barrido no son un benchmark de rendimiento.

`barrido.mjs` recorre las dos mesas `bajada`/`vuelta`, 360° de azimut y elevaciones 12–85°, más vista superior, en ambos temas y perfiles. Usa gestos reales de cámara y verifica que se alcance cada ángulo. `TUKI_SWEEP_BACKENDS=actual,fotorealista` utiliza la activación del producto; el valor predeterminado `actual,webgpu` usa el laboratorio con contacto. Se pueden especificar listas de `TUKI_SWEEP_AZIMUTHS`, `TUKI_SWEEP_ELEVATIONS`, `TUKI_SWEEP_LEVELS`, `TUKI_SWEEP_QUALITIES` y `TUKI_SWEEP_OUTPUT`. Para la regresión del reflejo conviene incluir azimut 210,215,220,225,230 y elevación 18,20,22,24,26, además del barrido general. Los percentiles de luminancia y saturación se toman en muestras del borde libre de madera; son un detector de desaturación extensa, no una medida HDR ni una certificación de calidad artística. Las capturas requieren inspección visual.

La suite E2E ordinaria añade casos sin WebGPU y preferencia guardada con adaptador ausente, verificando que no se descarguen recursos fotorealistas. Se conservan las pruebas existentes de física, cámaras, controles y rendimiento 100/200. `verify:local` incorpora la verificación de tipos y la huella de las dependencias del paquete aislado.

## Criterios de publicación

Los resultados medidos se registran en `docs/qa/fotorealista.md`. Para publicar se requieren regresiones aprobadas, revisión visual de ambos temas y medición en un equipo modesto real. Una RTX limitada artificialmente no sustituye esa prueba. La comprobación automática por dispositivo reduce el riesgo, pero no certifica todas las mesas ni todos los controladores.

Si falla un efecto opcional, queda desactivado. Si falla la base en un equipo, se conserva Actual; no se cambia silenciosamente al candidato WebGL2. Para revertir la feature completa, se revierte su commit en esta rama: los recursos originales permanecen intactos y los archivos nuevos se generan desde su paquete y generador.

## Referencias técnicas

- [Migración y límites de WebGPURenderer](https://threejs.org/manual/pages/webgpurenderer.html): WebGPU no mejora por sí mismo materiales ni rendimiento; shaders GLSL personalizados necesitan adaptación.
- [Three.js r187](https://github.com/mrdoob/three.js/releases/tag/r187): revisión fijada para ambos candidatos.
- [MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html): transmisión, espesor, absorción y coste de materiales físicos.
- [RectAreaLight](https://threejs.org/docs/pages/RectAreaLight.html): una fuente rectangular no proporciona shadow maps por sí sola.
- [SSGINode](https://threejs.org/docs/pages/SSGINode.html): restricciones y artefactos que impiden adoptarlo sin validación adicional.
- Código instalado r187: `WebGPUBackend.js` ignora pérdidas con motivo `destroyed`; se observa también la promesa `device.lost` para comprobar recuperación real. `NodeMaterial.js` omite la integración MRT automática al reemplazar `fragmentNode`; las motas usan `colorNode`/`opacityNode`.
