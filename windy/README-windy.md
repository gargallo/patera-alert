# Patera Alert — plugin para Windy.com

Plugin del sistema de plugins de Windy (cliente v42+). Reutiliza `../motor.js`
**sin modificarlo**: el plugin solo implementa el fetcher `getMeteo` sobre la
API de Windy (`@windy/fetch`) y pinta las mismas capas que la demo con el `L`
(Leaflet GL) global.

Herramienta humanitaria de anticipación logística. No localiza embarcaciones
ni personas. Prototipo en validación.

## Archivos

```
windy/
├── pluginConfig.ts    # declaración ExternalPluginConfig (obligatorio)
├── plugin.svelte      # UI del panel + fetcher @windy/fetch + capas del mapa
├── package.json       # scripts start/build (adaptados del template oficial v5)
├── rollup.config.js   # pipeline oficial: svelte + swc + commonjs + transformCodeToESMPlugin
├── tsconfig.json      # paths de tipos @windy/* -> plugin-devtools
├── svelte.config.js   # solo para tooling de editor
└── README-windy.md    # este archivo
```

A diferencia del template oficial (que espera `src/plugin.svelte`), aquí las
fuentes están en la raíz de `windy/` y `plugin.svelte` importa `../motor.js`;
rollup resuelve esa ruta relativa al propio archivo, así que el motor se
empaqueta tal cual, sin copias ni modificaciones.

## Desarrollo local (verificado en este proyecto)

```bash
cd windy
npm install
npm start
```

Esto compila en watch mode y sirve el plugin en
`https://localhost:9999/plugin.js` (certificado autofirmado: hay que visitar
esa URL una vez en el navegador y aceptar el riesgo).

Después:

1. Abrir https://www.windy.com/developer-mode
2. Cargar el plugin desde `https://localhost:9999/plugin.js`
3. Depurar con la consola del navegador (los sourcemaps apuntan al fuente).

Compilación de producción:

```bash
cd windy
npm run build    # genera dist/plugin.js, dist/plugin.min.js y dist/plugin.json
```

Verificado en este entorno (18/09/2026, @windycom/plugin-devtools 3.0.4):
el build completa y `dist/plugin.json` refleja la configuración.

## Panel del plugin

El panel lateral (rhpane) se organiza en secciones plegables:

1. **Cabecera**: estado del cálculo, botón Recalcular y timestamp de generación (UTC).
2. **Semáforo por isla**: punto RAG, p24/p48/p72 y una mini-barra con los 6
   buckets de 12 h (opacidad proporcional a la probabilidad; el tooltip de cada
   celda muestra el valor). Al pulsar una isla se despliega la tabla de
   contribuciones (origen, clase, salida h+X, llegada h+Y, peso).
3. **Ventanas de salida**: puntos de salida ordenados por score descendente,
   con sus ventanas en formato `h+8 → h+22 (14 h)`.
4. **Alertas**: avisos en español generados por el motor.
5. **Capas**: checkboxes Salidas / Corredores / Destinos que añaden o quitan
   los layerGroup del mapa, más la leyenda. La selección persiste en
   `localStorage` (clave `patera-alert-capas-v1`).
6. **Configuración** (plegada por defecto): inputs numéricos para los umbrales
   del motor (`hsMaxOptimo`, `hsMaxPosible`, `hsPeligro`, `vientoOptimoKn`,
   `vientoCeroKn`, `ventanaMinimaHoras`, `kSaturacion`, `ragAmbar`, `ragRojo`,
   `leewayVientoPct`) y velocidades/cuotas de las clases patera y taxi. Cada
   input muestra el valor por defecto de `PateraEngine.PATERA_CONFIG` entre
   paréntesis. «Aplicar y recalcular» relanza la predicción con
   `{config: overrides}`; «Restablecer valores» vuelve a los defaults. La
   configuración persiste en `localStorage` (clave `patera-alert-config-v1`)
   y se aplica automáticamente al abrir el plugin.
7. **Métricas** (plegada por defecto): campos de `resultado.metricas`
   (duración del cálculo, celdas consultadas, consultas nulas, contribuciones,
   corredores activos, parámetros efectivos) y cobertura de modelos del
   fetcher (`Oleaje 12/13 · Viento 13/13 · Corrientes 0/13`).
8. **Exportar**: botón «Copiar JSON» que copia el resultado completo
   (`JSON.stringify(ultimoResultado, null, 2)`) al portapapeles, con
   confirmación de 2 s. Pensado para la validación retrospectiva.
9. **Texto ético**: siempre visible al final del panel.

## De dónde salen los datos

`getMeteo(lat, lon, offsetHoras)` se implementa así (con caché por celda de
0.25°):

| Dato | Función | Modelos (con fallback) | Claves del payload |
|---|---|---|---|
| Oleaje (Hs, periodo) | `getPointForecastData` | `ecmwfWaves` → `gfsWaves` | `waves`, `wavesPeriod` (m, s) |
| Viento | `getPointForecastData` | `ecmwf` → `gfs` | `wind` (m/s → kn), `windDir` (°) |
| Corrientes | `getMeteogramForecastData` | `cmems` | variantes `currentU/currentV`, `uo/vo` (m/s) |

Las claves de oleaje y viento están tipadas en `plugin-devtools`
(`node-forecast-v3.d.ts`: `WavesDataHash2`, `DataHash2`). Las de `cmems` **no
están tipadas**: el código busca variantes habituales y, si no encuentra
componentes de corriente, asume deriva por corriente nula (el leeway de viento
sigue aplicándose). Conviene verificar las claves reales en consola la primera
vez que se ejecute en developer-mode.

El plugin escucha `store.on('timestamp')` (recálculo como mucho cada 10 min) y
`broadcast.on('redrawFinished')` (repintado ligero debounced). Los listeners se
registran en `onMount` y se limpian en `onDestroy`, nunca en `onopen` (regla
oficial del ciclo de vida).

## Publicación

Los plugins deben servirse desde el dominio `windy-plugins.com`; no se puede
alojar el `.js` en otro sitio. Flujo oficial (template con GitHub Action
`publish-plugin`):

1. Crear una API key "Windy Plugins API" en https://api.windy.com/keys.
2. Subir el proyecto a GitHub (incluir `windy/` tal cual; la Action del
   template oficial espera `src/`, así que basta con copiar estos archivos a
   `src/` o adaptar el workflow a este `rollup.config.js`).
3. En el repo: Settings → Secrets and Variables → Actions → secreto
   `WINDY_API_KEY`.
4. Actions → `publish-plugin` → Run workflow.
5. En el log del job, etapa "Publish Plugin", copiar la URL de instalación.

A mano (equivalente al script oficial):

```bash
cd windy && npm run build
# generar plugin-info.json con repositoryName/commitSha/repositoryOwner,
# mergearlo con dist/plugin.json, empaquetar:
tar cf plugin.tar -C dist .
curl -XPOST 'https://node.windy.com/plugins/v1.0/upload' \
  -H "x-windy-api-key: $WINDY_API_KEY" \
  -F "plugin_archive=@./plugin.tar"
```

URL resultante:
`https://windy-plugins.com/<userId>/windy-plugin-patera-alert/0.1.0/plugin.min.js`

- El plugin es **privado por defecto** (`private: true` en `pluginConfig.ts`):
  compartible por URL, no aparece en la galería. Para la galería pública hay
  que quitar `private`, añadir `screenshot.jpg` y pedir revisión al equipo de
  Windy (foro community.windy.com, categoría Windy Plugins).
- Para actualizar: subir `version` en `pluginConfig.ts` y `package.json` y
  republicar. Los usuarios con el plugin instalado reciben aviso de update.
- Los plugins **no funcionan en las apps nativas** iOS/Android; sí en
  navegador (escritorio y móvil).

## Notas legales (condiciones de plugins de Windy)

- Permitido: traer datos externos y mostrarlos en el plugin.
- Prohibido: extraer datos meteorológicos de Windy a servidores propios o
  usarlos fuera del plugin. Este plugin solo lee series puntuales vía
  `@windy/fetch` y las usa en memoria dentro del propio plugin.
