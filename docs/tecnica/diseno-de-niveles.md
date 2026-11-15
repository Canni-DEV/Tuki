# Guía de diseño de niveles

Esta guía se aplica a la campaña y a los desafíos creados por autores. Una mesa libre puede ser un boceto sin motivo ni solución certificada, pero siempre debe respetar las reglas de colocación, colisión y equilibrio.

## Objetos y escena

1. Cada objeto es una pieza completa del catálogo del Taller, con sus dimensiones y colisiones reales. No se admiten escalas particulares de un nivel ni pilas simuladas estirando una malla. Una pila contiene objetos individuales y apoyos explícitos.
2. Toda construcción debe poder reconstruirse en el Taller con la misma mesa, empujón, configuración, conexiones y orden físico. Los apoyos se derivan del catálogo; no se dibujan superficies invisibles a medida.
3. Cada nivel tiene un motivo breve: estudiar, ordenar libros, recibir paquetes o compartir mate, por ejemplo. Es una pauta para componer la escena, no una explicación obligatoria para el jugador.
4. La decoración puede guiar el recorrido o cerrar un atajo. Sus volúmenes deben coincidir con lo que se ve, permitir leer la situación y dejar espacio para editar. Se conservan las alternativas que usan la mecánica principal.
5. La dificultad avanza por decisiones de recorrido y sincronización. Se evitan uniones que sólo funcionan en una coordenada exacta, objetos que se atraviesan y piezas que tapan la interacción desde todos los encuadres.

La campaña conserva sus identificadores, orden y desbloqueos. Completar un nivel permite copiar su escenario al Taller, sin incluir la solución de referencia.

## Catálogo añadido

Las medidas son ancho × fondo × alto, en centímetros. Estas piezas se habilitan con La recta.

| Pieza | Medidas | Uso |
| --- | --- | --- |
| Estuche cerrado | 20 × 6 × 3 | Útiles y barreras bajas |
| Caja de útiles | 24 × 8 × 4 | Almacenamiento y apoyos |
| Caja de té | 12 × 9 × 8 | Escenas de pausa y obstáculos |
| Paquete rectangular | 24 × 16 × 10 | Entregas y pilas estables |
| Cuaderno | 21 × 14,8 × 0,6 | Apoyo fino y escenas de estudio |
| Portalibros metálico | 12 × 10 × 14 | Contención; chapa de 2 mm |

Las mesas disponibles son compacta (42 × 26), mediana (60 × 40), amplia (80 × 50), cuadrada (90 × 90) y clásica (84 × 52). Las patas y el espesor del tablero conservan sus proporciones.

## Autoría de desafíos

El autor elige qué objetos están instalados y cuáles debe aportar el jugador. Instalar una ficha, bolita o mecanismo bloquea su edición, pero no inmoviliza su comportamiento físico. Inicio y meta quedan instalados.

El cableado del jugador es una opción del autor, desactivada por defecto. Cuando se habilita, el jugador puede conectar dispositivos instalados o colocados por él. Los cables instalados y las secuencias del autor permanecen protegidos. También se admiten desafíos cuya única tarea sea conectar cables.

El inventario contiene las cantidades usadas por la solución y las piezas adicionales elegidas por el autor. No puede ofrecer menos piezas que las necesarias para esa solución. Escenario e inventario suman como máximo 200 objetos, sin contar la mesa.

Un desafío se guarda como borrador hasta certificarlo. La exportación `.tuki-desafio.json` incluye la solución para verificarla al importar. La interfaz sólo ofrece revelarla después de completar esa revisión; el archivo no pretende ocultarla criptográficamente. Los desafíos importados permiten usar su inventario aunque esas piezas todavía no estén desbloqueadas en la campaña. Su progreso es independiente y no concede premios de campaña.

## Validación

La certificación de autor comprueba:

- Esquema, catálogo, perfil físico, identificadores, inventario, apoyos, ausencia de ciclos y circuito.
- Reconstrucción del escenario por sí solo y de la solución completa, sin interpenetraciones ni desequilibrios.
- Inicio, meta y motivo presentes; alguna pieza o conexión pendiente para el jugador.
- Que el escenario instalado no gane solo.
- Tres ejecuciones ganadoras de la referencia, con los mismos pasos, eventos y poses finales.

La simulación se ejecuta en un worker cancelable, con un máximo de 36.000 pasos por prueba. La importación limita el archivo a 4 MiB y vuelve a certificar los desafíos publicados. Una huella SHA-256 vincula la certificación a la revisión, geometría, reglas e inventario. Cambiar sólo el nombre o el motivo no altera la física; cualquier cambio físico exige otra certificación.

Para aceptar una revisión oficial de campaña también se deben revisar una solución principal, una alternativa y un fallo, la mecánica imprescindible y los atajos conocidos. La revisión incluye diez repeticiones, reproducción lenta, 24 perturbaciones válidas de hasta 2 mm o 2° con al menos 22 victorias, y vistas de escritorio y móvil en ambos temas. El resultado de esas comprobaciones se registra con la revisión; una certificación de autor no sustituye esta revisión editorial.

## Persistencia

Las mesas libres usan documentos v6 y una biblioteca separada de la v5. La migración lee los originales sin sobrescribirlos; conserva el empujón y el orden físico anterior. Los desafíos usan documentos v1 con identidad y revisión propias. El progreso se asocia a identidad, revisión y huella de la certificación.
