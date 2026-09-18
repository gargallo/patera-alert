# Patera Alert

Sistema de alerta temprana (24–72 h) de llegadas de pateras a Baleares, con
lógica de patrón: ventanas de buen tiempo en puntos de salida argelinos →
tránsito por clase de embarcación → probabilidad de llegada por isla →
semáforo RAG.

**Herramienta humanitaria de anticipación logística. No localiza embarcaciones
ni personas. Prototipo en validación.**

## Estructura

```
patera-alert/
├── motor.js            # núcleo puro (browser: global PateraEngine; node: module.exports)
├── test/motor.test.js  # tests node con datos sintéticos (sin dependencias)
├── demo/index.html     # demo standalone: Leaflet CDN + Open-Meteo en vivo + motor.js
├── windy/              # plugin Windy v42+ (ver windy/README-windy.md)
│   ├── pluginConfig.ts
│   ├── plugin.svelte
│   ├── package.json / rollup.config.js / tsconfig.json / svelte.config.js
│   └── README-windy.md
├── SPEC.md             # especificación del proyecto
└── README.md           # este archivo
```

## Cómo abrir la demo

No necesita build ni claves: solo servir estáticamente la carpeta del proyecto
(la demo carga `../motor.js`):

```bash
cd patera-alert
python3 -m http.server 8080
# abrir http://localhost:8080/demo/
```

La demo descarga meteo en vivo de Open-Meteo (gratis, sin key, CORS abierto):
oleaje y corrientes de `marine-api.open-meteo.com` y viento de
`api.open-meteo.com`, en **dos peticiones batch** (arrays de
latitudes/longitudes) con caché por celda de 0.25°. Los puntos costeros cuya
celda redondeada cae en tierra (p. ej. Tipaza) reintentan con celdas vecinas
mar adentro.

Los tests del motor se ejecutan con:

```bash
node test/motor.test.js
```

## Cómo funciona el motor

El motor (`motor.js`) es puro: no hace fetch ni tiene dependencias. El entorno
(demo o plugin Windy) inyecta un fetcher:

```
getMeteo(lat, lon, offsetHoras) -> Promise<{hs, periodo?, vientoKn, vientoDir, corrU, corrV} | null>
   hs en m · vientoKn en nudos · vientoDir en grados (de dónde sopla) · corrU/corrV en m/s (hacia)
```

Flujo ("pensar como patrón"):

```
meteo horaria 0-72 h en cada punto de salida
        |
        v
score de ventana por hora (Hs y viento, rampas 0-1, min de ambos)
        |
        v
ventanas persistentes >= 6 h  ---------->  alertas "Ventana favorable en X..."
        |
        v
por cada hora t0 de ventana x clase (patera/taxi) x destino de la matriz:
   distancia geodésica -> duracion base
   meteo en el punto medio del corredor a t0+dur/2 -> penaliza velocidad
   si Hs del corredor > hsPeligro -> riesgoDeriva + deriva (2% viento + corriente)
   peso = score(t0) x pesoOrigenDestino x cuotaClase x factorSalida
        |
        v
agregacion por destino en buckets de 12 h
        |
        v
probabilidad por saturacion: p = 1 - exp(-k x sumaPesos)  -> p24 / p48 / p72
        |
        v
semaforo RAG por isla (p24): verde < 0.15, ambar 0.15-0.40, rojo > 0.40
```

Salida: objeto JSON plano `{ generadoEn, salidas, llegadas, corredores,
alertas }` (contrato completo en SPEC §3).

## Supuestos y parámetros configurables

Todos los umbrales, pesos y velocidades salen de la investigación (SPEC §2) y
se pueden sobreescribir sin tocar el código:

```js
PateraEngine.predecir(getMeteo, { config: { hsMaxOptimo: 0.6, kSaturacion: 0.8 } });
```

Parámetros principales (valores por defecto en `PATERA_CONFIG`):

- `hsMaxOptimo` 0.5 m / `hsMaxPosible` 0.65 m: régimen de salida favorable
  documentado para el Mediterráneo occidental (Alonso & Malheiro 2021).
- `hsPeligro` 1.5 m: umbral de mortalidad elevada para neumáticas
  (Camarena & Ruiz-Euler 2020).
- `vientoMax` 10 kn en el punto de salida; score de viento pleno hasta
  `vientoOptimoKn` 8 kn y nulo a partir de `vientoCeroKn` 12 kn.
- `ventanaMinimaHoras` 6 h de calma persistente para considerar salida.
- Clases: `patera` 3.0 kn (cuota 0.8) y `taxi` 15 kn (cuota 0.2), según
  velocidades documentadas en la ruta argelina (Diario de Mallorca, 2026).
- Deriva (leeway): 2 % del viento + corriente superficial
  (`leewayVientoPct`), en la franja baja de los coeficientes USCG para
  embarcaciones pequeñas.
- Matriz origen→destino y `factorSalida` (Orán/Mostaganem 0.15: su peso
  histórico hacia Baleares es bajo).
- `kSaturacion`: pendiente de conversión de pesos a probabilidad; es el
  principal candidato a calibración retrospectiva.
- RAG: `ragAmbar` 0.15 / `ragRojo` 0.40 sobre p24.

## Ética

Este sistema existe para **anticipar logística humanitaria** (voluntarios,
recursos de acogida, aviso a servicios de rescate), no para localizar
embarcaciones ni personas. No usa AIS, imágenes ni ningún dato de detección:
solo previsión meteorológica pública y patrones estadísticos. El texto ético
es visible de forma permanente en la demo y en el plugin.

## Limitaciones

- **No existe ningún modelo publicado específico para la ruta
  Argelia→Baleares**: los umbrales proceden de Estrecho/Alborán y del
  Mediterráneo central. Las probabilidades son ordinales (comparar días/islas),
  no frecuencias calibradas.
- La meteo es predictor fuerte pero no único: las salidas responden también a
  factores políticos y de seguridad en origen.
- La duración de travesía es muy sensible a la velocidad efectiva, que tiene
  gran incertidumbre (sobrecarga, averías).
- Resolución de los modelos (~0,1–0,25° en Open-Meteo): las condiciones
  costeras puntuales pueden diferir de la celda del modelo.
- Sin validación, el sistema no debe usarse para decisiones operativas.

## Siguientes pasos

1. **Validación retrospectiva**: cruzar el motor (en modo hindcast con ERA5 /
   CMEMS MEDSEA_MULTIYEAR y archivo de Open-Meteo) con las series oficiales de
   llegadas por isla (Ministerio del Interior / Delegación de Gobierno), y
   calibrar `kSaturacion`, umbrales y pesos de la matriz.
2. Calibración de la clase leeway "patera" con OpenDrift (módulo Leeway) y
   datos CMEMS, siguiendo los estudios forenses del Tirreno.
3. Deriva con ensemble (muestrear velocidad y rumbo) en lugar de trayectoria
   determinista.
4. Avisos automáticos (email/Telegram) a partir de `alertas` con un cron sobre
   la demo o un worker ligero.
5. Publicación del plugin Windy (pasos en `windy/README-windy.md`).

> Nota: `demo/` es autocontenida (incluye su propia copia de `motor.js` y Leaflet vendoreado en `demo/vendor/`). Si actualizas el motor, sincroniza la copia: `cp motor.js demo/motor.js`.
