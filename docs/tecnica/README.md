# Documentación técnica de Tuki

Tuki es un rompecabezas de escritorio en el que el jugador construye una cadena de dominós y la pone en marcha con un solo empujón. Esta especificación define cómo implementar y validar el MVP web en Windows con Chrome y Firefox, desde el primer armado en memoria hasta la publicación estática en GitHub Pages.

## Por dónde empezar

| Para trabajar en… | Consultar |
| --- | --- |
| Módulos, responsables, estados y reloj | [Arquitectura y ejecución](arquitectura.md) |
| Caídas, contactos, bifurcaciones y repetición | [Física, mecanismos y repetición](fisica.md) |
| Gestos del mouse, niveles JSON, inventario e historial | [Editor, niveles y guardado](editor-y-niveles.md) |
| Modelos de Blender, controles, materiales y sonido | [Producción 3D, interfaz y audio](arte-interfaz-y-audio.md) |
| Verificación automatizada, sesiones de escritorio y entrega web | [Pruebas y publicación](pruebas-y-publicacion.md) |
| Orden de construcción, dependencias y evidencia por hito | [Hoja de ruta del MVP](hoja-de-ruta.md) |

## Del requisito a la prueba

| Requisito | Diseño que lo resuelve | Dónde verificarlo |
| --- | --- | --- |
| Inicio y meta fijos en edición, impulso único y victoria causal por encima de 60° | [Del empujón al resultado](fisica.md#del-empujón-al-resultado) | [Inicio y victoria](pruebas-y-publicacion.md#inicio-y-victoria) |
| Hueco válido, cadena detenida, bola que sale de la mesa y resultado visible | [Reposo y descarte de cuerpos](fisica.md#del-empujón-al-resultado) | [Reposo y descarte](pruebas-y-publicacion.md#reposo-y-descarte) |
| Colocar, seleccionar, girar, retirar y cancelar, con motivo de apoyo inválido | [Gesto y validación](editor-y-niveles.md#gesto-y-validación) | [Edición y progreso](pruebas-y-publicacion.md#edición-y-progreso) |
| Fila suave, tangente, con saldo limitado y corte al cambiar de altura | [Trazar una fila](editor-y-niveles.md#trazar-una-fila) | [Trazar y corregir](pruebas-y-publicacion.md#edición-y-progreso) |
| Saldo por tipo, deshacer por gesto y corrección individual | [Inventario y deshacer](editor-y-niveles.md#inventario-deshacer-y-vuelta-al-editor) | [Inventario y apoyos](pruebas-y-publicacion.md#edición-y-progreso) |
| Retorno exacto al armado, repetición desde el inicio y cámara lenta | [Estados](arquitectura.md#estados-de-la-partida) · [Repetición](fisica.md#repetición-y-diagnóstico) | [Repetición y restauración](pruebas-y-publicacion.md#repetición-y-restauración) |
| S de ocho, curva suave, descenso por rampa y corrección de un fallo | [Datos de nivel](editor-y-niveles.md#datos-de-un-desafío) · [Perfil de calibración](fisica.md#perfil-físico-inicial) | [Montajes](pruebas-y-publicacion.md#montajes-de-control) · [Casos derivados](pruebas-y-publicacion.md#soluciones-y-llave) |
| Dos soluciones distintas de la taza, rutas imprevistas y sobrantes | [Mundo y piezas](fisica.md#mundo-y-piezas) · [Condición de victoria](fisica.md#del-empujón-al-resultado) | [Soluciones y llave](pruebas-y-publicacion.md#soluciones-y-llave) |
| Bifurcación y sincronización con paleta, compuerta y bandeja | [Física de la llave](fisica.md#mundo-y-piezas) | [Bola temprana y llave abierta a tiempo](pruebas-y-publicacion.md#montajes-de-control) |
| Desafíos en orden, variante tras la taza y recuperación de progreso y ajustes | [Progreso y preferencias](editor-y-niveles.md#progreso-y-preferencias) | [Progresión local](pruebas-y-publicacion.md#edición-y-progreso) |
| Escala y encuadres, materiales, cámara, bandeja y lectura del apoyo | [Producción 3D y controles](arte-interfaz-y-audio.md) | [Presentación](pruebas-y-publicacion.md#presentación-y-audio) · [Viewport de referencia](pruebas-y-publicacion.md#rendimiento-en-windows) |
| Impactos y rodadura, remate único, audio apagado y movimiento reducido | [Síntesis y sincronización](arte-interfaz-y-audio.md#síntesis-y-sincronización) | [Prueba audiovisual](pruebas-y-publicacion.md#presentación-y-audio) |
| PC con mouse, dos navegadores, viewport de 1366 × 768 y 30 FPS | [Ejecución y reloj](arquitectura.md#de-un-gesto-a-un-fotograma) | [Rendimiento en Windows](pruebas-y-publicacion.md#rendimiento-en-windows) |
| Distribución estática y carga de modelos, fuentes y WASM desde la subruta publicada | [Arranque y recursos](arquitectura.md#arranque-y-recursos) | [Publicación en GitHub Pages](pruebas-y-publicacion.md#publicación-en-github-pages) |
| Validación en mesa real, tarea de la S, invención y elección tras ganar | [Hitos del prototipo](hoja-de-ruta.md#hitos-y-evidencia-de-salida) | [Sesión con jugadores](pruebas-y-publicacion.md#validación-con-jugadores) |

## Fuentes y uso de los valores iniciales

La especificación funcional 0.1 define reglas, inventarios y objetivos. El Word contiene el esquema de las dos soluciones de la taza, cada una en un intento distinto. La dirección de arte fija la lectura de los controles y objetos. La hoja de validación aporta las tareas y las condiciones de medición. [MVP en Markdown](../mvp-dominos-3d.md) · [MVP en Word con esquema](../MVP%20del%20juego%20de%20domin%C3%B3s%203D.docx) · [Dirección de arte](../arte/README.md) · [Hoja de validación](../arte/validacion.md)

Las medidas, masas, impulso, separación y umbrales del perfil `mvp-1` son valores de partida para construir el prototipo. Al actualizar uno, registrar el montaje, la revisión y el resultado observado. Las planillas de FPS, repetibilidad y sesiones con jugadores se completan con la futura compilación jugable. [Calibración física](fisica.md#perfil-físico-inicial) · [Cómo cerrar un ajuste](hoja-de-ruta.md#cómo-cerrar-un-ajuste)
