# Aceptación de escritorio de Tuki

Fecha de ejecución UTC 2026-11-08. Se probó la compilación estática con SHA-256 agregado `e72da76da4206a3eb71f56730509edc9f9bb89878c0ff3468dc467e23b541eaf`. El runner comprueba los nombres y bytes de todos los recursos servidos al comenzar y terminar.

Equipo con Intel(R) Core(TM) Ultra 7 265 y Microsoft Windows 11 Pro (compilación 26300). Los adaptadores instalados son NVIDIA GeForce RTX 5070 Ti y Intel(R) Graphics.

## Repetibilidad

Cada casillero indica las pasadas que coincidieron en el desenlace y el orden de los contactos decisivos. Se capturaron eventos desde Empujar y Repetir en ventanas visibles a velocidad real.

| Montaje | Chrome for Testing 152.0.7977.75 · 1× | 0,25× | Firefox 159.0.1 · 1× | 0,25× | Desenlace esperado |
|---|---:|---:|---:|---:|---|
| s | 1/1 | 1/1 | 1/1 | 1/1 | Victoria |
| rampa | 1/1 | 1/1 | 1/1 | 1/1 | Victoria |
| taza-fichas | 1/1 | 1/1 | 1/1 | 1/1 | Victoria |
| taza-mixta | 1/1 | 1/1 | 1/1 | 1/1 | Victoria |
| llave-abierta | 1/1 | 1/1 | 1/1 | 1/1 | Victoria |
| bola-temprana | 1/1 | 1/1 | 1/1 | 1/1 | Cadena detenida |
| vuelta | 1/1 | 1/1 | 1/1 | 1/1 | Victoria |
| subibaja | 1/1 | 1/1 | 1/1 | 1/1 | Victoria |
| puente | 1/1 | 1/1 | 1/1 | 1/1 | Victoria |
| puente-tarde | 1/1 | 1/1 | 1/1 | 1/1 | Cadena detenida |
| taller100 | 1/1 | 1/1 | 1/1 | 1/1 | Victoria |

## Taza mixta a velocidad normal

| Navegador | Adaptador efectivo | Viewport CSS | DPR | Mínimos por pasada, FPS |
|---|---|---|---:|---|
| Chrome for Testing 152.0.7977.75 | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11) | 1366 × 768 | 1 | 144 |
| Firefox 159.0.1 | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.16.1714) | 1366 × 768 | 1 | 143 |

## Taller de cien objetos a velocidad normal

| Navegador | Adaptador efectivo | Viewport CSS | DPR | Mínimos por pasada, FPS |
|---|---|---|---:|---|
| Chrome for Testing 152.0.7977.75 | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11) | 1366 × 768 | 1 | 144 |
| Firefox 159.0.1 | ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11-32.0.16.1714) | 1366 × 768 | 1 | 141 |

Se contaron fotogramas en cada intervalo de un segundo, incluida la ventana que termina en el resultado. La serie completa por pasada, los pasos físicos, los grupos de contactos y la primera divergencia si la hubo figuran en el [registro JSON](ampliacion-windows.json).

La matriz **quedó aprobada**. Coincidieron el desenlace y los grupos de contactos en 44 de 44 pasadas. Se observó un solo empujón en 44 de 44. La mesa, el inventario y Empujar quedaron visibles con zoom al 100 % en ambos navegadores.

## Repetir la medición

En Windows, abrir PowerShell en la raíz del repositorio. Con Node de la versión indicada en `.node-version`, ejecutar lo siguiente.

```powershell
npm ci
npm run build -- --base=/Tuki/
node qa/windows/aceptacion.mjs --ampliacion
```

El runner sirve `dist/` en loopback y abre perfiles temporales de escritorio. Se puede indicar el ejecutable con `TUKI_CHROME` o `TUKI_FIREFOX`. Para usar una vista previa ya abierta, asignar su URL con la subruta a `TUKI_QA_URL`. La ejecución completa actualiza este informe y el JSON.
