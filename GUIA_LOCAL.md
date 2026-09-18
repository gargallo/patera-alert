# Guía de prueba en local — Patera Alert

Hay DOS cosas que probar en local, y son independientes:

1. **Demo standalone** (`demo/`) — prueba rápida del motor con datos reales, sin Windy.
2. **Plugin de Windy** (`windy/`) — el objetivo final: se prueba en local con el *developer mode* de windy.com.

---

## 1. Demo standalone (2 minutos)

No necesita instalar nada, solo un servidor estático:

```bash
cd patera-alert/demo
python3 -m http.server 8080
```

Abre `http://localhost:8080` en el navegador. Verás:
- Mapa del Mediterráneo occidental con la costa argelina y Baleares.
- Puntos de salida (círculos; tamaño/color = fuerza de la ventana de buen tiempo).
- Corredores activos hacia las islas (discontinuos en rojo si hay riesgo de deriva).
- Panel derecho: semáforo por isla (p24/p48/p72), alertas de ventanas favorables y leyenda.
- Botón "Recalcular" para refrescar la predicción con la última meteo.

Los datos meteorológicos se descargan en vivo de Open-Meteo (gratuito, sin clave): oleaje y corrientes de su API marina + viento de su API de previsión.

> Nota: `demo/` es autocontenida (incluye `motor.js` y Leaflet en `vendor/`). Si no se ven los mapas base, revisa tu conexión (los tiles vienen de CartoDB/OSM).

---

## 2. Plugin de Windy en local (developer mode)

Así se prueba un plugin de Windy **sin publicarlo**: Windy carga el plugin desde tu `localhost` directamente dentro de windy.com.

### Paso 1 — Instalar dependencias (solo la primera vez)

Requiere Node.js 18+ instalado.

```bash
cd patera-alert/windy
npm install
```

### Paso 2 — Arrancar el servidor de desarrollo

```bash
npm start
```

Esto compila el plugin y lo sirve en `https://localhost:9999/plugin.js` (con recarga automática al editar). Deja esta terminal abierta.

> El certificado es autofirmado: la primera vez, abre `https://localhost:9999/plugin.js` en el navegador y acepta la advertencia de seguridad ("Avanzado → Continuar"). Si no haces esto, Windy no podrá cargar el plugin.

### Paso 3 — Cargar el plugin en Windy

1. Abre `https://www.windy.com/developer-mode` en el mismo navegador.
2. Activa el modo desarrollador e introduce la URL del plugin: `https://localhost:9999/plugin.js`
3. Pulsa cargar. El plugin aparecerá en el menú de plugins de Windy (icono "PA") y también bajo el nombre **Patera Alert**.

### Paso 4 — Qué verás

Sobre el mapa de Windy se pintan las mismas capas que la demo:
- Puntos de salida argelinos con su score de ventana.
- Corredores hacia Cabrera, Mallorca sur/este, Menorca, Ibiza y Formentera.
- Panel con el semáforo por isla a 24/48/72 h y las alertas.

El plugin lee la meteo de la propia API interna de Windy (oleaje ECMWF-WAM/GFS-Wave, viento, corrientes CMEMS) y recalcula cuando cambias el modelo o el instante del timeline.

### Paso 5 — Compilar para distribuir

```bash
npm run build
```

Genera `dist/plugin.min.js`, listo para publicar con tu cuenta de Windy (ver `README-windy.md`, sección Publicación: GitHub Action + `WINDY_API_KEY`). Los plugins nuevos son **privados por defecto** — solo los usa quien tenga el enlace, ideal para el piloto con Cruz Roja.

---

## Solución de problemas

| Síntoma | Causa probable | Solución |
|---|---|---|
| Windy no carga el plugin | Certificado autofirmado no aceptado | Abrir `https://localhost:9999/plugin.js` y aceptar el riesgo |
| `npm install` falla | Node antiguo | Usar Node 18+ (`node -v`) |
| Panel vacío en el plugin | Overlay sin datos en esa zona | Alejar el zoom al Mediterráneo occidental; probar con overlay "Olas" activo |
| En la demo no hay meteo | Open-Meteo caído o sin red | Reintentar con "Recalcular"; el panel mostrará el error |

## Parámetros que puedes tocar

Todos los umbrales están en `PATERA_CONFIG` al inicio de `motor.js`: umbrales de oleaje (`hsMaxOptimo`, `hsMaxPosible`), viento máximo, velocidades de las dos clases, cuotas, umbrales del semáforo RAG. Tras editar, en la demo basta recargar; en el plugin, `npm start` recompila solo.
