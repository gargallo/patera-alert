# SPEC.md — "Patera Alert": plugin Windy + demo standalone

## 1. Propósito
Sistema de alerta temprana de llegadas de pateras a Baleares (24–72 h), con lógica de patrón: ventanas de buen tiempo en puntos de salida argelinos → tránsito por clase de embarcación → probabilidad de llegada por isla → semáforo RAG. Tres entregables que comparten el mismo motor:

```
/mnt/agents/output/patera-alert/
├── motor.js            # núcleo puro (browser global `PateraEngine` + module.exports para node)
├── test/motor.test.js  # tests node con datos sintéticos
├── demo/index.html     # standalone: Leaflet CDN + Open-Meteo en vivo + motor.js
├── windy/              # plugin Windy v42+ (ver §6)
│   ├── pluginConfig.ts
│   ├── plugin.svelte   # opcional; si complica, plugin.js plano según template
│   └── README-windy.md
└── README.md
```

## 2. Datos base (de la investigación — NO inventar otros)
Puntos de salida (id, nombre, lat, lon):
- `oran` Orán 35.70, -0.64 (salidas hacia Levante peninsular: peso Baleares bajo)
- `mostaganem` Mostaganem 35.93, 0.09 (idem)
- `argel` Argel 36.79, 3.06
- `tipaza` Tipaza 36.59, 2.45
- `boumerdes` Boumerdès 36.77, 3.48
- `dellys` Dellys 36.92, 3.91
- `bejaia` Béjaïa 36.75, 5.07 (vira hacia Pitiusas)

Destinos (id, nombre, lat, lon): `cabrera` 39.14, 2.93 · `mallorca_sur` Colònia de Sant Jordi 39.31, 2.99 · `mallorca_este` Cala Rajada 39.71, 3.46 · `menorca` 39.95, 4.05 · `ibiza` 38.91, 1.43 · `formentera` 38.70, 1.48

Matriz origen→destinos plausibles (pesos iniciales configurables):
- argel/tipaza/boumerdes/dellys → cabrera .35, mallorca_sur .35, mallorca_este .15, menorca .10, formentera .05
- bejaia → formentera .45, ibiza .35, mallorca_este .20
- oran/mostaganem → mallorca_sur .5, cabrera .3, formentera .2 (peso global de salida bajo: factor 0.15)

Clases de embarcación:
- `patera`: velocidad efectiva 3.0 kn (rango 2.5–4), deriva si falla motor; cuota de salidas 0.8
- `taxi`: 15 kn (12–17), cuota 0.2
(leeway en deriva: 2% del viento + corriente superficial)

Umbrales por defecto (configurables en `PATERA_CONFIG`):
- `hsMaxOptimo: 0.5`, `hsMaxPosible: 0.65` (m), `hsPeligro: 1.5`
- `vientoMax: 10` kn en el punto de salida
- Ventana mínima de calma para salir: 6 h persistentes
- Horizonte: 72 h; buckets de llegada de 12 h
- RAG: verde <0.15, ámbar 0.15–0.40, rojo >0.40 (probabilidad agregada de llegada por isla en próximas 24 h)

## 3. Contrato del motor (`motor.js`)
```js
// Entrada abstracta: el entorno (demo o Windy) inyecta un fetcher de meteo
// getMeteo(lat, lon, offsetHoras) -> Promise<{hs, periodo?, vientoKn, vientoDir, corrU, corrV}>
//   hs en m, viento en nudos, vientoDir en grados (de dónde sopla), corrU/corrV en m/s (hacia)
// Puede devolver null si no hay dato.

PateraEngine.predecir(getMeteo, opciones?) -> Promise<Resultado>
```
`Resultado` (todo en estructuras planas JSON-serializables):
```js
{
  generadoEn: ISO string,
  salidas: [ { puntoId, nombre, lat, lon, scoreVentana /*0-1*/, ventanas: [{inicioH, finH, score}], comentario } ],
  llegadas: [ { destinoId, nombre, lat, lon, p24, p48, p72, rag, buckets12h: [p...x6], contribuciones: [{puntoId, clase, horaSalidaH, horaLlegadaH, peso}] } ],
  corredores: [ { puntoId, destinoId, path: [[lat,lon]...], activo: bool, riesgoDeriva: bool } ],
  alertas: [string]  // p.ej. "Ventana favorable en Argel–Boumerdès desde h+8 durante 14 h"
}
```
Lógica ("pensar como patrón"):
1. Para cada punto de salida, muestrear meteo horaria 0–72 h → score de ventana continuo (1 si Hs≤0.5 y viento≤8; 0 si Hs≥0.65 o viento≥12; interpolar). Detectar ventanas persistentes ≥6 h.
2. Para cada ventana: para cada clase y destino de la matriz: distancia geodésica → duración base; muestrear meteo en el punto medio del corredor a t0+duración/2 → penalizar velocidad si Hs>0.8 (patera) o Hs>1.5 (taxi); si la meteo del corredor supera `hsPeligro`, marcar `riesgoDeriva` y añadir deriva (2% viento + corriente) a la trayectoria.
3. peso de contribución = scoreVentana(t0) × pesoOrigenDestino × cuotaClase × factor salida.
4. Agregar por destino en buckets de 12 h; normalizar a probabilidades 0–1 (función de saturación, p.ej. 1-exp(-k·Σpesos), k configurable).
5. RAG por isla a partir de p24. Alertas en español, redactadas como partes de un parte náutico.
6. `corredores[].path`: línea geodésica muestreada (16 puntos) + desplazamiento por deriva si aplica.

El motor NO hace fetch: recibe `getMeteo`. Debe correr en node (tests) y browser.

## 4. Demo standalone (`demo/index.html`)
- Leaflet 1.9 CDN, tiles CartoDB Voyager (paleta sobria). Vista inicial: W Mediterráneo (Argelia→Baleares).
- Fetchers Open-Meteo (gratis, sin key, CORS abierto):
  - Marine: `https://marine-api.open-meteo.com/v1/marine?latitude=..&longitude=..&hourly=wave_height,wave_period,wave_direction,ocean_current_velocity,ocean_current_direction&forecast_days=4&timezone=UTC`
  - Viento: `https://api.open-meteo.com/v1/forecast?latitude=..&longitude=..&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kn&forecast_days=4&timezone=UTC`
  - Cachear por celda redondeada (0.25°) para no repetir llamadas; batch por punto de salida + puntos medios de corredor + destinos.
- UI español, sobria (paleta tierra/arena, sin gradientes azul-púrpura):
  - Panel lateral: semáforo por isla (verde/ámbar/rojo) con p24/p48/p72, lista de alertas, leyenda, timestamp de generación, toggle de capas.
  - Mapa: círculos de calor en puntos de salida (color por scoreVentana, radio por intensidad), polilíneas de corredores activos (discontinuas si riesgoDeriva), marcadores de destino con etiqueta RAG.
  - Footer ético: "Herramienta humanitaria de anticipación logística. No localiza embarcaciones ni personas. Prototipo en validación."
- Debe funcionar abriendo el HTML servido estáticamente; todo CDN; sin build.

## 5. Tests (`test/motor.test.js`, node sin deps)
Fetcher sintético inyectado. Casos mínimos:
1. Calma total 72 h → ventanas largas, al menos un destino en rojo/ámbar.
2. Temporal (Hs 3 m, viento 30 kn) → scores 0, todo verde.
3. Ventana parcial (calma h+6..h+18) → contribuciones solo con t0 en ese rango.
4. Unidades: geodésica Argel→Cabrera ≈ 290–310 km; duración patera ≈ 48 h ± 30%.
Ejecutar con `node test/motor.test.js` y que pase.

## 6. Plugin Windy (`windy/`)
Seguir el sistema actual v42+ documentado en `/mnt/agents/output/research/windy_plugin_api.md` (leerlo): `pluginConfig.ts` con `ExternalPluginConfig` (name `windy-plugin-patera-alert`), compilable con `@windycom/plugin-devtools` (`npm i -D @windycom/plugin-devtools`, `npx windy-plugin-devtools` sirviendo en https://localhost:9999, probar en windy.com/developer-mode).
- Leer meteo con `@windy/fetch`: `getPointForecastData` para `ecmwfWaves`/`gfsWaves` (oleaje), `gfs`/`ecmwf` (viento) y `cmems` (corrientes) — con fallback entre modelos.
- Implementar el fetcher `getMeteo` sobre esa API y reutilizar `../motor.js` SIN modificarlo.
- Pintar capas con el `L` global de Windy (Leaflet): mismos elementos visuales que la demo. Escuchar `store.on('timestamp')` y `broadcast.on('redrawFinished')` para refrescar.
- `README-windy.md`: pasos de instalación/build/developer-mode y cómo publicar (GitHub Action `publish-plugin` + WINDY_API_KEY; privado por defecto).
- Si el tooling de build no está disponible en el entorno, entregar el código fuente completo y correcto según la doc + README detallado de build, y dejar la demo como referencia funcional del motor.

## 7. Calidad
- Español en UI, comentarios de cabecera y README. Sin emojis en archivos. Tono profesional, cercano y sobrio.
- README.md raíz: qué es, cómo abrir la demo, cómo funciona el motor (diagrama de flujo en texto), supuestos y parámetros configurables, ética, limitaciones, siguientes pasos (validación retrospectiva con datos reales).
- Código comentado en los puntos de lógica de patrón.
