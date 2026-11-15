# Validación de dispositivos v5

Perfil `dispositivos-1`, formato de mesas v5. Este informe separa pruebas automatizadas, inspección visual y observación de jugadores. La referencia inicial de esta implementación tenía 238 pruebas unitarias aprobadas.

## Alcance implementado por etapa

| Etapa | Entrega | Evidencia principal |
|---|---|---|
| 0 | Registro común, señales y estados separados, reposo por cuerpo, almacenamiento limpio, retiro de compatibilidad antigua | Pruebas de mandos, secuencias, editor, taller y frenado independiente de articulaciones distantes. |
| 1 | Lanzador completo, panel, parábola y embudo continuo; tres desafíos | Nueve combinaciones de inclinación/potencia, salida calibrada, señal simultánea, señal anticipada, boca bloqueada y segunda bola. |
| 2 | Retenedor automático/cableado y reemplazo de la cuna | Liberación gravitatoria, señal cableada inmediata y demoras exactas que superan la ventana de reposo; «Esperá al puente». |
| 3 | Placa física, tres intensidades y tres inclinaciones | Alturas aproximadas de 4/8/12 cm, impactos de bola y dominó, un solo ciclo; «Dos saltos». |
| 4 | Elevador con polea unilateral, guías y lastres seleccionables | Equilibrio de masas, aceleración, carga adicional, cuerda floja, extremos y obstáculos; «El contrapeso». |

Los 37 montajes existentes y nuevos se reconstruyeron con el editor y/o se ejecutaron con la física actual. El [registro de montajes](dispositivos-v5-fisica.json) conserva resultado, paso de victoria, paso final y eventos de los dispositivos. Los datos de calibración del MVP se mantienen identificados como históricos.

## Pruebas automatizadas

- Tipos: `npm run typecheck`.
- Física y lógica: `npm run test:run`. La suite contiene 300 pruebas en 14 archivos, incluidas las dos mesas de carga de 100 y 200 objetos.
- Modelos: `node art/verify_models.mjs`, 57 GLB verificados contra el catálogo. Se comprobaron escala, pivotes, superficies y boca libre del embudo para una bola de 16 mm.
- Compilación: `npm run build -- --base=/Tuki/`.
- Dispositivos en navegador: 16 pruebas aprobadas en Chromium y Firefox. Para cada uno de los seis desafíos se ejecutaron ocho intentos a 1×, dos a 0,25×, una solución alternativa y un fallo reparable: **144 intentos**. Se comparó el orden y paso de todos los eventos, con un único empujón por intento. El panel se verificó en ambos temas, con audio apagado y movimiento reducido.

La matriz de repetición usa un reloj de presentación controlado por Playwright, avanzado en intervalos de 500 ms. El juego consume todos los pasos físicos de 1/120 s; no salta pasos ni cambia parámetros. Esta matriz verifica integración y determinismo en navegador, **no mide FPS**. Las pruebas unitarias comparan además las posiciones finales.

La regresión del editor, campaña, taller, cableado, secuencias, guardado, importación/exportación, audio y presentación suma **138 pruebas aprobadas y seis omisiones explícitas en Firefox de Windows**. La pasada inicial encontró diez expectativas antiguas (cinco casos en cada navegador); se actualizaron inventarios, progresión, formato y un montaje reparable que ahora admitía un atajo legítimo. El cierre dirigido aprobó los 23 casos ejecutables, incluidos los escenarios modificados. El consolidado final es **158 pruebas de navegador aprobadas**: 138 de regresión, 16 de dispositivos y cuatro de rendimiento.

Los controles táctiles se ejercitaron en Chromium. El transporte BiDi de Firefox de escritorio no implementa `tap`; esos casos conservan su omisión explícita en Windows. Su ejecución con Firefox empaquetado en CI no fue comprobada en esta sesión. El [registro de validación](dispositivos-v5-validacion.json) conserva versiones, resultados, mediciones y SHA-256 de la compilación medida.

## Rendimiento medido

Medición del 14 de noviembre de 2026, con ventana y sin otras suites simultáneas: Windows 11 Pro, Intel Core Ultra 7 265, 63 GiB de memoria utilizable, NVIDIA GeForce RTX 5070 Ti, viewport de 1366 × 768. Se activaron los cuatro dispositivos en cada mesa. Ambos navegadores superaron el objetivo de 30 FPS en todas las ventanas de medición.

| Navegador | Objetos | FPS por ventana | Mínimo |
|---|---:|---|---:|
| Chromium 158.0.8127.18 | 100 | 140, 144, 144, 144 | 140 |
| Chromium 158.0.8127.18 | 200 | 136, 144, 144, 144 | 136 |
| Firefox 160.0 | 100 | 141, 145, 142, 145 | 141 |
| Firefox 160.0 | 200 | 137, 142, 143, 141 | 137 |

Limitación observada: Chromium sin ventana eligió SwiftShader y obtuvo mínimos de 4 FPS con 100 objetos y 2 FPS con 200; esa configuración no cumple el objetivo. Se conserva el diagnóstico en el registro. La aceptación anterior corresponde al adaptador físico, verificado en ambos navegadores; no demuestra 30 FPS en equipos sin aceleración gráfica. La medición comprende un intento por tamaño y navegador, separado de las repeticiones de determinismo.

## Inspección visual

Se revisaron capturas de la maqueta del lanzador, del elevador y de la parábola seleccionada. El elevador muestra ambos ramales y las ruedas, la plataforma y el lastre; las partes móviles siguen sus poses físicas. La revisión detectó y corrigió un aviso de error que aparecía después de guardar correctamente una configuración. El panel nativo tiene nombres accesibles y una confirmación produce una sola operación de deshacer.

## Repetir las verificaciones

```powershell
npm run typecheck
npm run test:run
node art/verify_models.mjs
npm run build -- --base=/Tuki/
npx playwright test --trace=off
```

Para medir el rendimiento, cerrar las otras suites y ejecutar en el equipo de aceptación:

```powershell
$env:TUKI_PERF='1'
$env:TUKI_HEADED='1'
npx playwright test qa/e2e/rendimiento-dispositivos.spec.ts --workers=1 --trace=off
Remove-Item Env:TUKI_PERF
Remove-Item Env:TUKI_HEADED
```

El banco activa los cuatro dispositivos con 100 y 200 objetos. Registra CPU, sistema, navegador, adaptador efectivo, duración y fotogramas por ventanas de un segundo. La aceptación exige un mínimo de 30 FPS en cada ventana del equipo documentado. La prueba no se habilita por defecto en equipos de CI sin un presupuesto de rendimiento definido.

## Validación pendiente con jugadores

No se realizaron ni se simularon sesiones con personas durante esta implementación. Sigue pendiente observar a cinco jugadores y comprobar que al menos cuatro puedan orientar el lanzador, reconocer una señal anticipada y reparar el fallo sin ayuda.

Protocolo: comenzar con «La bandera arriba»; registrar el primer ajuste, intentos y resultado sin sugerir parámetros. Continuar con «El disparo a tiempo» y anotar si identifican el orden carga–señal. Pedir que reparen el montaje fallido cambiando una decisión. Finalmente ofrecer el taller y observar usos espontáneos de retenedor, placa y elevador. Registrar también soluciones no previstas, especialmente contactos con dominós, bloqueos de bocas y cargas adicionales. Esta observación es un criterio de aceptación de diseño pendiente, no un resultado de las pruebas automatizadas.
