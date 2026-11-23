# CALIDAD: comprobación única y arranque

22 de noviembre de 2026. Cambios locales posteriores a `e8d598a`, en `codex/modo-fotorealista`. Sin push ni cambios en `main`. No se modificaron materiales, mapas, iluminación, escenas, física ni parámetros de cámara.

## Comportamiento

- El menú usa Default/CALIDAD y Perfil Alta/Equilibrada, conservando las claves de preferencias existentes.
- Una operación mide Alta y Equilibrada, con ambos temas, sin cambiar umbrales. Guarda los resultados juntos; solo habilita perfiles aprobados.
- La tilde se lee desde los datos guardados, también en Default. Cambiar de tema, perfil, sesión, navegador actualizado o revisión del juego no dispara otra prueba. Repetir es voluntario.
- Una recarga en CALIDAD oculta Default antes de preparar la escena y comienza la portada después del primer fotograma WebGPU terminado. El reloj de presentación se pausa durante las cargas, sin adelantar ni recortar la animación.
- Fallos de carga, compilación o GPU conservan comprobación y preferencia; se usa Default en esa sesión. Cancelar una repetición conserva el chequeo anterior. Borrar datos elimina la tilde.
- Las aprobaciones previas se migran sin repetirlas. Un perfil antiguo sin resultado permanece deshabilitado hasta una repetición voluntaria; no se inventan mediciones.

## WebGPU real

`qa/render/aprobacion.mjs`, Edge 158, RTX 5070 Ti, Windows 11, compilación de producción con base `/Tuki/`. La comprobación se ejecutó sola, sin otra batería consumiendo CPU/GPU. Sin errores inesperados de consola o página.

La primera operación midió los cuatro pares perfil/tema y aprobó ambos perfiles. Cambiar a Equilibrada reutilizó el mismo registro y no añadió mensajes de sondeo. Se comprobó persistencia en un contexto nuevo y con otra cadena de identificación de navegador, migración del formato anterior, cancelación, HTTP 503, pérdida real del dispositivo de prueba y borrado de datos.

| Tema | Caché | Dibujos Default visibles al recargar | Primer tiempo de entrada | Duración visible observada |
|---|---|---:|---:|---:|
| Claro | Fría | 0 | 0 ms | 1.501,2 ms |
| Claro | Caliente | 0 | 0 ms | 1.501,2 ms |
| Oscuro | Fría | 0 | 0 ms | 1.501,1 ms |
| Oscuro | Caliente | 0 | 0 ms | 1.498,0 ms |

La duración del clip es 1.490 ms; la observación agrega la cuantización del fotograma. La pose del primer fotograma visible se comparó con la pose inicial del clip original. Para caché fría se limpió la caché del navegador y se demoró además 1,8 s el módulo WebGPU: la portada permaneció sin iniciar durante esa espera. No hubo escena de benchmark visible ni repetición del sondeo en ninguna recarga. Se inspeccionaron las capturas del menú con la tilde en ambos temas.

Evidencia local, ignorada por Git: [informe](../../.qa-local/fotorealista/calidad-inicio/informe.json), [menú Claro](../../.qa-local/fotorealista/calidad-inicio/claro-caliente-tilde.png), [menú Oscuro](../../.qa-local/fotorealista/calidad-inicio/oscuro-caliente-tilde.png). Estos tiempos verifican la entrada; no son benchmarks de partidas.

## Reproducción

```powershell
npm run build -- --base=/Tuki/
npm run preview -- --base=/Tuki/ --host 127.0.0.1 --port 4188 --strictPort
# En otra consola, sin pruebas de rendimiento paralelas:
$env:TUKI_BASE_URL='http://127.0.0.1:4188/Tuki/?revision'
$env:TUKI_APPROVAL_OUTPUT='.qa-local/fotorealista/calidad-inicio'
node qa/render/aprobacion.mjs
```

Las pruebas unitarias específicas cubren persistencia, migración, rechazo de datos inválidos, resultados negativos, almacenamiento bloqueado y el reloj de entrada con pausas superpuestas. El contrato de habilitación conserva los límites de estabilidad originales.

Pasaron los tipos de la aplicación y del render aislado, la compilación de producción y las **509 pruebas unitarias y físicas** de 33 archivos. La compilación conserva la advertencia previa sobre chunks grandes.

Pasaron **26 casos E2E** de apariencia, visuales y cámara en Chromium y Firefox. Permanecen las dos omisiones táctiles documentadas de Firefox por la ausencia del transporte CDP multipuntero; no se añadieron omisiones ni se rebajaron umbrales. Se verificó que Default no descarga el módulo fotorealista y que la ausencia de adaptador restaura la escena sin perder la preferencia ni bloquear el arranque. [Informe E2E local](../../.qa-local/fotorealista/calidad-inicio/e2e.json).
