# Editor, niveles y guardado

Durante el armado, cada pieza tiene una pose y un apoyo conocidos. El editor usa esos datos tanto para mostrar dónde quedará una pieza como para entregar a física la construcción confirmada. El historial conserva acciones del jugador y permite deshacer una fila completa después de probarla.

## Datos de un desafío

El catálogo común resuelve tipos de pieza, modelos, dimensiones y geometría. El JSON de nivel ensambla instancias de ese catálogo. Las posiciones son coordenadas de mundo `[x, y, z]` en metros, medidas en el pivote del activo. El giro editable es una rotación en grados sobre +Y. A 0° la flecha apunta a +Z y a 90° apunta a +X. Los identificadores son cadenas estables dentro del nivel. Un cambio de valores físicos o apoyos requiere registrar la revisión con la que se probaron los montajes.

```ts
type Vec3 = [number, number, number]
type TipoColocable = "domino" | "bolita" | "rampa" | "embudo"
type Saldo = Record<TipoColocable, number>
type IdNivel = "recta" | "curva" | "libro" | "taza" | "taza-llave"

interface Pose {
  posicion: Vec3
  giroY: number
}

interface ObjetoDeNivel extends Pose {
  id: string
  activo: string          // Clave del catálogo de activos
  rol: "escenario" | "inicio" | "meta" | "mecanismo"
  apoyo: string | null    // ID de superficie, o null para un objeto anclado al mundo
}

interface Nivel {
  version: 1
  revision: number
  id: IdNivel
  nombre: string
  objetivo: string
  perfilFisico: string
  requiere: IdNivel | null
  inventario: Saldo
  fijos: ObjetoDeNivel[]  // El editor bloquea su pose
  superficies: {
    id: string
    objeto: string
    zona: string          // Zona del catálogo en coordenadas locales del objeto
    admite: TipoColocable[]
  }[]
  camara: { objetivo: Vec3, azimut: number, elevacion: number, altoVisible: number }
  empujon: { pieza: string, impulsoLocal: Vec3, puntoLocal: Vec3 }
}

interface PiezaColocada extends Pose {
  id: string
  tipo: TipoColocable
  apoyo: string
}

interface Armado {
  nivel: IdNivel
  revision: number
  perfilFisico: string
  piezas: PiezaColocada[]
  saldo: Saldo
}
```

`fijos` significa que el jugador no puede mover esos objetos en el editor. Durante la simulación, el catálogo asigna cuerpos dinámicos a inicio y meta. `superficies` referencia zonas geométricas declaradas una sola vez en el catálogo. Una tapa aporta su polígono útil y su altura local. La cuna aporta una posición de asiento para el centro de la bolita. El empujón expresa N·s y metros locales al pivote de la pieza. La cámara ortográfica usa grados para los ángulos y metros para el alto visible de la mesa.

## Disposición de los desafíos

Los archivos del juego incluyen las poses iniciales, superficies, cámara y empujón de cada desafío. [La recta](../../src/data/recta.json) · [La curva](../../src/data/curva.json)

Al cargar, verificar versión, números finitos y saldos enteros no negativos. Resolver activos, zonas y apoyos por ID, detectar duplicados y exigir un inicio, una meta y un empujón dirigido al inicio. Si el nivel es inválido, identificar el campo y el nivel antes de entrar en edición.

| Desafío | Inventario al abrir | Disposición y acceso |
| --- | --- | --- |
| `recta` | 6 dominós | Extremos a 16,2 cm en una mesa libre. Disponible desde el inicio. |
| `curva` | 8 dominós | Extremos a 21,6 cm y un vasito que se puede bordear por ambos lados. Se abre al ganar la recta. |
| `libro` | 6 dominós, 1 bolita, 1 rampa | Inicio y cuna en el libro, meta abajo. Se abre al ganar la curva. |
| `taza` | 12 dominós, 1 bolita, 1 rampa, 1 embudo | Inicio elevado, cuna, escalones, taza, canaleta y meta en mesa. Se abre al ganar el libro. |
| `taza-llave` | El inventario de `taza` | Reusar la disposición de la taza y agregar paleta, hoja, desvío y bandeja. Se abre al ganar la taza. La geometría debe admitir los dos órdenes de llegada. |

## Gesto y validación

- **Colocar.** Desde la miniatura activa, proyectar el puntero sobre la mesa. Resolver la primera superficie visible compatible, respetando objetos que tapan superficies inferiores. Obtener la altura desde el apoyo. Mostrar silueta, huella y dirección. Para una bolita en cuna, usar su asiento. Fuera de la cuna, alinear el punto inferior de la esfera al plano. El clic válido confirma una pieza.
- **Comprobar el apoyo en los desafíos.** Transformar toda la huella con el giro elegido y exigir que entre en la zona útil. Para la rampa y el embudo usar las áreas reales de los pies. Comprobar penetración con volúmenes físicos, incluido el obstáculo. Admitir el contacto de apoyo y el espacio libre dentro del embudo. La distancia a la próxima ficha puede ser tan grande como decida el jugador.
- **Mover y girar.** Un clic selecciona una pieza por ID. Arrastrar su cuerpo cambia posición y apoyo. Arrastrar el aro cambia el giro a partir del ángulo en el plano de apoyo. Durante la validación excluir la propia pieza. El botón derecho y la rueda pertenecen a la cámara. «Retirar» devuelve al saldo una unidad del tipo seleccionado.
- **Cancelar o rechazar.** Usar trama, cruz y texto para distinguir superposición («Separá las piezas»), exterior («Volvé a la mesa») y apoyo parcial («Apoyá toda la base»). Al soltar en posición inválida, restaurar la pose anterior de una pieza existente o descartar la nueva. `Escape` o la pérdida de captura durante un gesto cancelan la previsualización.

## Apoyos de escenario en el Taller

Los objetos de escenario admiten voladizo sobre el tablero y sobre tapas a la misma altura. En la vista previa se recorta cada huella contra cada tapa en coordenadas de mundo. Un atlas que atraviesa un hueco dibuja un parche por caja. Los asientos, los dominós y los pies de los mecanismos siguen sus reglas de colocación.

Al confirmar, el editor prepara un borrador y envía al worker de Rapier los cuerpos conectados por los apoyos que cambiaron. También recorre los vínculos anteriores para detectar la retirada de un contrapeso. El ensayo aplica gravedad durante 240 pasos a 120 Hz. Comprueba un desplazamiento máximo de 1 mm, un giro máximo de 1° y 60 pasos finales de reposo. Los prismas con toda su base sobre una sola tapa transmiten su masa y centro de masa al cuerpo inferior. Se aplica el mismo cálculo a un recipiente completamente apoyado que solo carga su propio peso. Esto evita que el error numérico de contacto se acumule al apilar libros alineados. Los voladizos y puentes participan como cuerpos dinámicos en el ensayo. Durante el recorrido, todo el escenario queda fijo.

La confirmación exige que el gesto y el armado sigan vigentes. Un rechazo conserva el autoguardado y el historial. Las mesas v3 guardan el apoyo principal en `apoyo` y los apoyos compartidos en `apoyos`. Al abrir una mesa v3 se comprueban los contactos y el equilibrio. Las mesas v1/v2 pasan a v3 en su primera edición aceptada.

## Trazar una fila

1. Al presionar el botón izquierdo sobre un apoyo válido, fijar su ID y convertir las muestras del mouse al plano local. Omitir desplazamientos menores a 2 mm y suavizar los puntos interiores con media ponderada de tres muestras (1, 2, 1). Conservar los extremos. Calibrar el filtro trazando la S con mouse.
2. Recorrer la polilínea por longitud de arco, empezando en el primer punto. Al alcanzar la separación de centros del perfil, generar la siguiente silueta. Su eje local +Z sigue la tangente de la curva. Actualizar el extremo de la vista previa mientras llega una nueva muestra.
3. Validar cada base, incluyendo choques con las siluetas anteriores. Detener el tramo en la última ficha válida al alcanzar el saldo, una obstrucción, el borde o un cambio de apoyo. Un movimiento rápido también debe comprobar los bordes entre muestras. Mostrar el contador y, si se agota el saldo, «Límite de fichas». Para bajar de un libro hace falta iniciar otro trazo.
4. Al soltar, confirmar exactamente las siluetas visibles como una acción. Cada dominó recibe su propio ID para ajustes posteriores. Un clic sin desplazamiento suficiente para determinar dirección cancela el trazo. La colocación individual sigue disponible en la bandeja.

## Inventario, deshacer y vuelta al editor

Para cada tipo se cumple `colocadas + saldo = inventario inicial`. Inicio, meta, canaleta, llave y escenario pertenecen al nivel. Las caras con distintos puntos consumen el mismo tipo `domino`. El saldo solo cambia al confirmar una operación. Comprobar a la vez la capacidad del inventario y la validez de todas las piezas afectadas antes de registrar el cambio.

Por el tamaño de los niveles, guardar una copia del armado anterior por cada alta, retiro, movimiento, giro o fila confirmados. «Deshacer» restaura esa copia con sus IDs y saldo. Orbitar, cancelar y repetir conservan el historial. Antes de empujar, guardar el armado y mantener el historial asociado. Volver a editar recupera la copia exacta, con la llave cerrada, en cualquier paso del intento.

## Progreso y preferencias

Usar `localStorage` con la clave `tuki.progreso.v1`. El siguiente ejemplo corresponde a alguien que ya terminó la curva. `movimiento` admite `sistema`, `reducido` o `completo`. Con `sistema` se consulta `prefers-reduced-motion`.

```json
{
  "version": 1,
  "completados": ["recta", "curva"],
  "audio": true,
  "movimiento": "sistema"
}
```

Derivar los desbloqueos de `requiere` y de los IDs completados. La primera victoria de cada desafío agrega su ID. Repetir una victoria conserva el conjunto. Si un guardado anterior ya contiene `curva`, acreditar también `recta` y conservar los ajustes y victorias. En almacenamiento vacío comenzar con `recta` disponible, audio habilitado y movimiento según sistema. Si el contenido es ilegible o de versión desconocida, arrancar con esos valores. Si falla una escritura, mantener el progreso de la sesión y avisar que durará hasta cerrar la pestaña. Los armados por nivel, el historial y el último intento se mantienen en memoria. Al recargar, el jugador recupera desafíos y preferencias y abre cada mesa con sus piezas iniciales.

[Índice técnico](README.md) · [Perfil y mecanismos](fisica.md#perfil-físico-inicial) · [Pruebas de edición](pruebas-y-publicacion.md#edición-y-progreso)
