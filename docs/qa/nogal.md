# Mesa fotorealista de nogal

22 de noviembre de 2026, rama `codex/modo-fotorealista`. Referencia anterior: `a12ab4b`. No se modifican `main`, los fondos, las luces, la exposición, los entornos HDR, los GLB, la física, los controles ni la cámara de juego. Las piezas conservan su madera clara.

## Material y mapeado

La mesa y sus ensambles usan [Natural Walnut Veneer de Poly Haven](https://polyhaven.com/a/natural_walnut_veneer), de Jenelle van Heerden, CC0. Los tres JPEG originales, sus URL y SHA-256 quedan en `render/assets/natural-walnut-veneer/`. La compilación verifica los hashes y funciona sin red. No se incorporaron imágenes generadas a los recursos del juego.

Color 2K en sRGB, normales OpenGL y rugosidad 1K lineales, con un acabado cálido `#c8a582`. Los perfiles comparten estos mapas; Alta conserva mayor resolución de pantalla, sombras, contacto y filtrado anisotrópico. Se mantiene el acabado físico estable: normalScale .4, roughness 1, metalness 0, clearcoat .06 y clearcoatRoughness .55.

El mapeado compensa las escalas de cada formato y representa el escaneo de un metro sin repetirlo sobre la tapa. Las patas tienen fibra vertical, los travesaños longitudinal y los extremos una terminación chapada. Solo cambia el atributo UV de la representación fotorealista; posiciones, índices y recursos originales permanecen intactos. El mapeado se cachea y no varía con la órbita o una transformación rígida.

Peso adicional de nogal: **3.333 MiB**. Recursos gráficos totales: **7.443 MiB** para Equilibrada y **22.251 MiB** acumulados, dentro de 12/24 MiB. No son cifras de VRAM ni incluyen JavaScript.

## Escala y conservación de Actual

`qa/nogal.test.ts` comprueba la escala métrica de los cinco formatos, la orientación de patas/travesaños, la ausencia de modificación de las UV originales y la estabilidad ante 24 rotaciones. Pasaron los tres casos, además de las nueve pruebas del contrato de renderizado y las aprobaciones.

`qa/render/nogal.mjs` creó los cinco formatos desde la interfaz, capturó Claro/Oscuro en vista orbital y superior y volvió a Actual. En los cinco, **el PNG del canvas Actual fue idéntico byte por byte antes y después**. El armado y la cámara se conservaron. Actual no solicitó mapas de nogal; Fotorealista solicitó únicamente los tres mapas compartidos. Sin errores de consola o página.

Evidencia local: [informe de formatos](../../.qa-local/fotorealista/nogal-formatos/informe.json), [mesa compacta nocturna](../../.qa-local/fotorealista/nogal-formatos/compacta-oscuro.png).

## Barrido angular

Edge 158 con WebGPU real sobre RTX 5070 Ti, Windows 11. Laboratorio WebGPU con el mismo módulo y efecto de contacto del producto, ambos perfiles, mesas `bajada` y `vuelta`, Claro y Oscuro. **1.224 posiciones orbitales y ocho vistas superiores**, sin errores de consola o página.

Azimuts: 0, 30, 55, 60, 90, 120, 150, 180, 210, 215, 220, 225, 230, 240, 270, 300 y 330°. Elevaciones: 12, 18, 20, 22, 26, 35, 55, 75 y 85°. Los gestos de cámara verifican cada posición alcanzada. Es una cobertura discreta del rango completo, no una prueba de infinitos ángulos continuos.

El detector del borde de madera registró **0 % de muestras con los tres canales ≥ 250**, en ambos temas. La proporción máxima de muestras claras y poco saturadas fue 3,49 % en Claro y 0 % en Oscuro. Son métricas sobre capturas sRGB; no miden radiancia HDR y pueden incluir oclusiones del escenario. Se inspeccionaron las vistas de mayor puntuación, las superiores y los ángulos rasantes: conservan la veta y no presentan el blanqueo completo reportado anteriormente. No se cambió la iluminación para obtenerlo.

[Informe del barrido](../../.qa-local/fotorealista/nogal-barrido/informe.json). Reproducción:

```powershell
$env:TUKI_BASE_URL='http://127.0.0.1:4187/?revision'
$env:TUKI_SWEEP_BACKENDS='webgpu'
$env:TUKI_SWEEP_AZIMUTHS='0,30,55,60,90,120,150,180,210,215,220,225,230,240,270,300,330'
$env:TUKI_SWEEP_ELEVATIONS='12,18,20,22,26,35,55,75,85'
$env:TUKI_SWEEP_OUTPUT='.qa-local/fotorealista/nogal-barrido'
node qa/render/barrido.mjs
node qa/render/nogal.mjs
```

## Jugadas y órbita continua

`qa/render/orbita-jugada.mjs` pasó **cuatro jugadas ganadoras**, una por tema y perfil, con un giro real de 360° durante cada partida y acercamientos a la bolita. La ruta de producción permaneció activa, reutilizó las aprobaciones guardadas y no registró errores de página ni consola. [Informe y capturas](../../.qa-local/fotorealista/nogal-orbita-jugada/informe.json).

La calibración se ejecuta sin grabación y guarda aprobaciones reales antes de abrir el contexto de vídeo. Se observaron rechazos por picos de frame time mientras otra batería de navegadores se ejecutaba en paralelo; al separar las ejecuciones pasaron los cuatro ensayos de admisión, con p95/p99 ≤ 14 ms. Estas cifras corresponden al sondeo de admisión, no a un benchmark de partidas. Los tiempos de las jugadas grabadas no se utilizan como medición de rendimiento.

## Regresiones

Pasaron tipos de la aplicación y del render aislado, las **504 pruebas unitarias y físicas**, y la compilación de producción con base `/Tuki/`. Se mantiene la advertencia existente de chunks grandes.

En la compilación de producción pasaron también **12 pruebas E2E de apariencia y visuales en Chromium y Firefox**, incluida la conservación del modo Actual sin WebGPU. `qa/render/aprobacion.mjs` verificó aprobación persistente, escena de comprobación oculta, recarga, contexto nuevo, cambio de perfil, cancelación, fallo transitorio de carga y pérdida de dispositivo, sin errores inesperados.

La compilación del módulo se repitió en una copia con dependencias enlazadas, como las revisiones de QA. `preserveSymlinks` conserva rutas lógicas en el manifiesto: los recursos resultaron idénticos byte por byte y el JavaScript ejecutable no cambió por este ajuste. [Informe de reproducibilidad](../../.qa-local/fotorealista/nogal-compilacion.json).

La revisión de aprobación pasa a `r187-contacto-nogal-3` porque ahora hay tres mapas residentes adicionales. La actualización requiere una comprobación inicial por perfil; sigue siendo discreta, fuera de pantalla y persistente. No se repite al alternar tema o modo.

Los artefactos de QA son locales e ignorados por Git; los scripts, procedencia y documentación quedan en la rama. Este cambio no sustituye la validación pendiente de la feature en un equipo modesto real.
