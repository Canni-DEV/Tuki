# Hoja de ruta del MVP

Construir primero una cadena que el equipo pueda romper, explicar y reparar. La S de ocho fichas permite decidir escala, impulso y separación con un solo nivel. Conservar ese montaje mientras se incorporan el editor, los cambios de altura y la llave.

## Hitos y evidencia de salida

| Hito | Trabajo y dependencia | Evidencia para pasar al siguiente |
| --- | --- | --- |
| **1. Caída y reparación en La curva** | Partir del JSON de la curva y de un catálogo de cajas. Montar TypeScript, Vite, Three.js y Rapier. Implementar impulso único, paso fijo, activación por contactos, reposo y umbral de victoria. Crear la S interna con ocho fichas. | Una S y una curva suave ganan. La copia con una ficha desplazada se detiene a la vista. Restaurar su pose recupera la victoria. Guardar el armado, el perfil físico y la traza de contactos. [Ejemplo de nivel](editor-y-niveles.md#ejemplo-completo-de-la-curva) · [Perfil físico](fisica.md#perfil-físico-inicial) |
| **2. Editor y ciclo de intento** | Sobre la física del hito 1, incorporar silueta, giro, fila por arrastre, saldo, deshacer, cámaras y copia previa al impulso. Conectar bandeja, prueba, resultado, repetición y cámara lenta. | Trazar, separar una ficha y repararla desde los controles de juego. Deshacer una fila devuelve las ocho unidades. Volver en plena caída y después de ganar recupera la construcción exacta. [Edición y progreso](pruebas-y-publicacion.md#edición-y-progreso) · [Restauración](pruebas-y-publicacion.md#repetición-y-restauración) |
| **3. Alturas, taza y llave** | Probar la transferencia a la bola en el libro. Introducir los apoyos escalonados, embudo y canaleta. Usar la mesa real para revisar la disposición. Agregar la llave como variante y conectar progreso secuencial y guardado de ajustes. | Girar la rampa corrige el libro. La taza se resuelve por fichas y por bola, y admite un tercer trazado válido. La variante produce tanto paso a tiempo como desvío a bandeja. Quedan versionados los seis montajes internos y su expectativa. [Montajes de control](pruebas-y-publicacion.md#montajes-de-control) |
| **4. Presentación y aceptación técnica** | Sustituir las formas de revisión por GLB finales conservando medidas y apoyos. Integrar identidad, luz, sombras, audio sintetizado y remate. Medir una compilación de producción en la PC Windows de referencia. | Informes de Chrome y Firefox con las 120 pasadas, GPU efectiva y mínimo de FPS por intervalo en taza mixta. Los casos de audio apagado y movimiento reducido son reconocibles. Mesa, inventario y acción principal caben a 1366 × 768. [Rendimiento](pruebas-y-publicacion.md#rendimiento-en-windows) · [Presentación y audio](pruebas-y-publicacion.md#presentación-y-audio) |
| **5. Publicación y sesión con jugadores** | Publicar la revisión probada en GitHub Pages. Revisar la subruta desde un perfil limpio y preparar las tareas individuales sin mostrar soluciones. | Registrar URL y revisión, comprobar carga de recursos y recorrer el ciclo de juego. Anotar cuántas de las cinco personas trazaron y repararon solas, qué rutas descubrieron y qué hicieron tras ganar. El objetivo del editor es 4 de 5. [Publicación](pruebas-y-publicacion.md#publicación-en-github-pages) · [Sesión con jugadores](pruebas-y-publicacion.md#validación-con-jugadores) |

## Cómo cerrar un ajuste

Cuando cambie un número del perfil, registrar **valor anterior → valor nuevo**, montaje que motivó el cambio, comportamiento observado y revisión del nivel o catálogo. Repetir el montaje que motivó el ajuste y todos los que compartan la pieza o el parámetro. Por ejemplo, al ensanchar el cuello del embudo revisar el recorrido mixto y las dos llegadas a la llave. Al cambiar dimensiones del dominó, repetir los seis montajes y el trazado a mano.

Si la S cuesta dibujar, revisar el filtro del mouse y la separación sugerida. Si se puede dibujar pero cuesta repararla, observar la selección individual y el retorno al editor. Si solo aparece una familia de soluciones en la taza, revisar la disposición y accesibilidad de ambos recorridos con el inventario acordado. Registrar el resultado de la siguiente sesión en la misma hoja.

Los resultados de física, rendimiento y juego con personas se completan al ejecutar estos hitos. Las planillas vacías y los números iniciales del perfil documentan cómo producir esa evidencia.

[Índice técnico](README.md) · [Hoja de validación funcional](../arte/validacion.md)
