# Dispositivos, física y mesas v5

La campaña contiene 16 desafíos principales y la variante «La llave de paso». La cuna deja el catálogo; el péndulo se desbloquea después de «A la vuelta» exclusivamente para el taller. La construcción libre y la victoria por cadena causal se conservan: no hay comprobaciones de piezas obligatorias para ganar.

## Definiciones y geometría

`src/dispositivos.ts` centraliza configuración tipada, valores de calibración, bornes, apoyos, masas de edición y comportamiento de mandos/receptores. Palanca, botón, puerta, compuerta y puente usan ese registro. `src/formas-dispositivos.ts` declara las partes y articulaciones de los cuatro dispositivos nuevos. El catálogo de `shapes.ts` alimenta colisionadores, modelos, selección, colocación, equilibrio y recorridos de cable. Las variantes geométricas tienen identificadores distintos, incluidos ángulo y lastre, por lo que las cachés no reutilizan una geometría incompatible.

Las unidades físicas son metros, kilogramos y segundos. La bola tiene radio de 8 mm y masa de 6 g. Las velocidades, alturas de referencia e intensidades se ajustan en el catálogo, no en los niveles. El embudo conserva su costo de redirigir el movimiento, con una superficie de colisión continua y aristas internas corregidas.

| Dispositivo | Configuración | Ciclo |
|---|---|---|
| Lanzador | 30/45/60°; baja/media/alta = 1,2/1,6/2 m/s; 0,5/1/2 s; automático/cable | Captura una bola existente, la estabiliza en el alojamiento que alcanzó, abre el pestillo y aplica la velocidad de salida. Un disparo. |
| Retenedor | 0,5/1/2 s; automático/cable | Retiene mediante el piso y el pestillo. En automático espera la demora; por cable abre al recibir la señal. Libera por gravedad una vez. |
| Placa | 0/15/30° desde la vertical; baja/media/alta | Un contacto causal libera el resorte físico. Su recorrido de 12 mm transfiere energía a través de los contactos, sin capturar la carga. |
| Elevador | Automático/cable; lastre de 6/12/24 g | Libera plataforma y contrapeso; recorre hasta 12 cm. Un tope superior abre la compuerta. Las masas y los obstáculos deciden el recorrido. |

La placa se calibra con una bola activa centrada a 24,5 mm del tablero, sin velocidad inicial ni obstáculos. Se mide la subida máxima de su centro respecto de esa posición: aproximadamente 4/8/12 cm, con tolerancia de 5 mm. El banco está en `qa/dispositivos.test.ts`.

## Pasos, señales y causalidad

`DispositivosSimulacion` mantiene carga, fase, vencimiento, movimiento y bloqueo separados de `PiezaColocada`. Cada intento crea estados nuevos. Repetir y volver al editor descartan cuerpos, temporizadores y restricciones de la simulación anterior.

Cada paso dura 1/120 s: se resuelve la física, se recogen contactos, se propaga la cadena causal, se completa la carga, se entregan señales y secuencias, se realizan transiciones y se evalúa el reposo. La carga completada en el mismo paso que una señal está disponible para esa señal. El empujón inicial se aplica una sola vez.

Una señal anticipada se pierde y emite `senal-ignorada`. Señales adicionales durante la demora, expulsión o después del ciclo no rearman el mecanismo. Los eventos `captura`, `liberacion`, `disparo` y `bloqueo` alimentan diagnóstico, indicadores y audio. Una carga precargada conserva cuerpo e identificador; una segunda bola sigue chocando con ella y con el dispositivo.

Los contactos de soporte no propagan causalidad. Para transmitirla, la pieza activa debe aportar movimiento hacia el contacto: la caída de un objeto inactivo contra una carga inmovilizada no convierte esa caída en parte de la cadena. Los contactos no filtran por tipo de carga. Se conservan dominó–balancín y dominó–placa.

La amortiguación se decide por cuerpo y contacto con el tablero. Una articulación distante no cambia el frenado de una bola. Las demoras ejecutables y las expulsiones mantienen vivo el intento; esperar una señal o quedar bloqueado no lo hace. Una bola sin apoyo continúa en vuelo hasta chocar o salir de la mesa.

## Polea específica

`src/polea.ts` acopla dos cuerpos dinámicos guiados verticalmente. No usa un motor de subida ni traslada los cuerpos para corregir su posición. La suma inicial de alturas define la longitud; una restricción unilateral calcula tensión común, nunca compresión. Con holgura, los cuerpos pueden caer independientemente hasta tensar la cuerda.

El cálculo incorpora las masas de cuerpos realmente apoyados mediante contactos verticales, incluida la compuerta unida a la plataforma. La fuerza de tensión se aplica a los extremos de la cuerda; los contactos del motor físico transmiten esa fuerza a las cargas. Las taras de plataforma más compuerta y soporte de contrapeso son de 8 g. El lastre se suma al segundo extremo.

El banco aislado `qa/polea.test.ts` comprueba equilibrio, aceleración según masas, holgura, inversión por carga adicional, extremos y obstáculos. La restricción es numérica: la tolerancia de longitud del banco obstruido es 1 mm. Las colisiones y guías se resuelven con la misma escala e iteraciones que la partida. La API no ofrece una unión nativa de polea; una cuerda recta entre cuerpos no representa este recorrido. [Articulaciones de Rapier](https://rapier.rs/docs/user_guides/templates/joints/)

## Edición y persistencia

El panel usa controles nativos rotulados para mouse, teclado y táctil. Confirmar varios parámetros crea una sola operación de deshacer. La campaña solo ofrece configuración de automáticos colocados por el jugador; su instalación y sus cables permanecen inmutables. En el taller se elige el modo y se conectan mandos. La importación también rechaza cables hacia dispositivos configurados como automáticos.

Lanzador y retenedor cableados ofrecen un asiento para una bola del inventario. La relación de apoyo hace que se mueva y gire con el dispositivo, y evita retirar el soporte mientras siga cargado. Cambiar a automático exige quitar esa precarga. La parábola del lanzador aparece solo al seleccionarlo en edición; barre una esfera de 8 mm hasta el primer contacto con la escena actual y no predice el movimiento de otros cuerpos.

Todas las mesas usan `version: 5` y `perfilFisico: "dispositivos-1"`; no hay lectores ni migradores antiguos. Se usan `tuki.progreso.v2` y la base IndexedDB `tuki.taller.dispositivos.v5`. La versión inicia limpia y después conserva sus propios datos. Los espacios anteriores permanecen intactos. Los identificadores de campaña y el orden de niveles están separados del catálogo, cuyos desbloqueos son explícitos.

## Montajes y cierre

Cada uno de los seis desafíos nuevos tiene los archivos `nombre.json`, `nombre-alternativo.json` y `nombre-fallo.json` en `qa/fixtures/`. El fallo cambia una decisión de configuración o de llegada de la señal. Las posiciones se calibraron con la física implementada y se validan reconstruyéndolas en el editor. Las mesas `dispositivos100` y `dispositivos200` activan lanzador, retenedor, placa y elevador en una misma prueba de rendimiento.

Las verificaciones ejecutadas y las observaciones pendientes de jugadores se distinguen en [el informe de validación](../qa/dispositivos-v5.md). Los documentos del MVP se conservan como referencia histórica.
