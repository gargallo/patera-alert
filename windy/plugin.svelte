<div class="plugin__mobile-header">{title}</div>
<section class="plugin__content">
    <div class="cabecera">
        <span class="estado">{estado}</span>
        <button class="boton" on:click={recalcular}>Recalcular</button>
    </div>
    {#if generado}
        <div class="generado">Generado: {generado} UTC</div>
    {/if}

    <h2>Semáforo por isla</h2>
    <div class="semaforo">
        {#each llegadas as l}
            <div class="isla">
                <span class="punto-rag rag-{l.rag}"></span>
                <span class="nombre">{l.nombre}</span>
                <span class="probs">24h {l.p24.toFixed(2)} · 48h {l.p48.toFixed(2)} · 72h {l.p72.toFixed(2)}</span>
            </div>
        {/each}
        {#if !llegadas.length}
            <p class="nota">Sin datos todavía.</p>
        {/if}
    </div>

    <h2>Alertas</h2>
    <ul class="alertas">
        {#each alertas as a}
            <li>{a}</li>
        {:else}
            <li>Sin avisos en el horizonte de 72 h.</li>
        {/each}
    </ul>

    <h2>Leyenda</h2>
    <div class="leyenda">
        <div><span class="muestra verde"></span> Verde: p24 &lt; 0.15</div>
        <div><span class="muestra ambar"></span> Ámbar: p24 0.15–0.40</div>
        <div><span class="muestra rojo"></span> Rojo: p24 &gt; 0.40</div>
        <div><span class="muestra oliva"></span> Punto de salida (tamaño/color = score de ventana)</div>
        <div><span class="linea"></span> Corredor activo</div>
        <div><span class="linea discontinua"></span> Corredor con riesgo de deriva</div>
    </div>

    <p class="etica">
        Herramienta humanitaria de anticipación logística. No localiza embarcaciones ni personas.
        Prototipo en validación.
    </p>
</section>

<script>
    /*
     * Patera Alert — plugin Windy (sistema v42+, cliente actual).
     * Reutiliza ../motor.js SIN modificarlo: todo el acceso a datos de Windy
     * vive aquí, en el fetcher getMeteo implementado sobre @windy/fetch.
     */
    import { onMount, onDestroy } from 'svelte';
    import { map } from '@windy/map';
    import store from '@windy/store';
    import bcast from '@windy/broadcast';
    import { getPointForecastData, getMeteogramForecastData } from '@windy/fetch';
    import config from './pluginConfig';
    import PateraEngine from '../motor.js';

    const { title } = config;
    const CFG = PateraEngine.PATERA_CONFIG;
    const COLORES_RAG = { verde: '#5b7f57', ambar: '#bf8a3c', rojo: '#a94438' };
    const MS_A_KN = 1 / 0.514444;

    // Estado reactivo del panel
    let estado = 'Calculando predicción…';
    let generado = '';
    let llegadas = [];
    let alertas = [];

    // Capas del mapa (L es el Leaflet GL global de Windy)
    let capaSalidas = null;
    let capaCorredores = null;
    let capaDestinos = null;
    let ultimoResultado = null;
    let ultimoCalculo = 0;
    let temporizador = null;

    /* ---------------------------------------------------------------- *
     * Fetcher getMeteo sobre @windy/fetch (SPEC §6)
     *
     * Modelos con fallback:
     *   oleaje:    ecmwfWaves -> gfsWaves   (getPointForecastData)
     *   viento:    ecmwf -> gfs             (getPointForecastData)
     *   corrientes: cmems                   (getMeteogramForecastData)
     * Caché por celda redondeada de 0.25° para no repetir llamadas.
     * ---------------------------------------------------------------- */
    const CELDA = 0.25;
    const cacheSeries = {};

    function claveCelda(lat, lon) {
        return (Math.round(lat / CELDA) * CELDA).toFixed(2) + ',' +
               (Math.round(lon / CELDA) * CELDA).toFixed(2);
    }

    // El payload es HttpPayload<WeatherDataPayload2<K>>: el hash de datos
    // cuelga de .data (con arrays paralelos ts + variables).
    function extraerHash(resp) {
        if (!resp) return null;
        const d = resp.data !== undefined ? resp.data : resp;
        return d && Array.isArray(d.ts) ? d : null;
    }

    async function conFallback(modelos, punto, incluir) {
        for (const modelo of modelos) {
            try {
                const resp = await getPointForecastData(modelo, punto, incluir);
                const hash = extraerHash(resp);
                if (hash) return hash;
            } catch (e) {
                console.warn('[patera-alert] fallo con modelo', modelo, e);
            }
        }
        return null;
    }

    function indiceCercano(ts, tMs) {
        if (!ts || !ts.length) return -1;
        let mejor = 0;
        let mejorDist = Infinity;
        for (let i = 0; i < ts.length; i++) {
            const d = Math.abs(ts[i] - tMs);
            if (d < mejorDist) { mejorDist = d; mejor = i; }
        }
        return mejor;
    }

    function valor(hash, campo, idx) {
        if (!hash || idx < 0 || !Array.isArray(hash[campo])) return null;
        const v = hash[campo][idx];
        return v === null || v === undefined ? null : v;
    }

    async function cargarSerie(lat, lon) {
        const punto = { lat, lon };
        const [waves, wind] = await Promise.all([
            conFallback(['ecmwfWaves', 'gfsWaves'], punto, 'patera-alert'),
            conFallback(['ecmwf', 'gfs'], punto, 'patera-alert'),
        ]);

        // Corrientes: producto cmems vía meteograma (única vía documentada).
        // Los nombres de clave no están tipados para cmems: se buscan las
        // variantes habituales y, si no hay corriente, se asume 0.
        let curr = null;
        try {
            curr = extraerHash(await getMeteogramForecastData('cmems', punto));
        } catch (e) {
            console.warn('[patera-alert] cmems no disponible', e);
        }
        let currU = null;
        let currV = null;
        if (curr) {
            const claves = Object.keys(curr);
            const buscar = patrones =>
                claves.find(k => patrones.some(p => k.toLowerCase().includes(p)));
            const kU = buscar(['currentu', 'current_u', 'uo']);
            const kV = buscar(['currentv', 'current_v', 'vo']);
            if (kU && kV) { currU = kU; currV = kV; }
        }

        return { waves, wind, curr, currU, currV };
    }

    // getMeteo(lat, lon, offsetHoras) -> Promise<{hs, periodo, vientoKn, vientoDir, corrU, corrV} | null>
    function getMeteo(lat, lon, offsetHoras) {
        const clave = claveCelda(lat, lon);
        if (!cacheSeries[clave]) {
            cacheSeries[clave] = cargarSerie(lat, lon).catch(() => null);
        }
        return cacheSeries[clave].then(serie => {
            if (!serie || (!serie.waves && !serie.wind)) return null;
            const tMs = Date.now() + offsetHoras * 3600e3;

            const iW = serie.waves ? indiceCercano(serie.waves.ts, tMs) : -1;
            const iV = serie.wind ? indiceCercano(serie.wind.ts, tMs) : -1;
            const iC = serie.curr ? indiceCercano(serie.curr.ts, tMs) : -1;

            // waves: altura total en m (clave `waves` del hash de oleaje)
            const hs = valor(serie.waves, 'waves', iW);
            const periodo = valor(serie.waves, 'wavesPeriod', iW);
            // wind: m/s -> nudos; windDir: grados (de donde sopla)
            const vMs = valor(serie.wind, 'wind', iV);
            const vientoKn = vMs === null ? null : vMs * MS_A_KN;
            const vientoDir = valor(serie.wind, 'windDir', iV);

            if (hs === null && vientoKn === null) return null;

            let corrU = 0;
            let corrV = 0;
            if (serie.currU && serie.currV) {
                corrU = valor(serie.curr, serie.currU, iC) || 0;
                corrV = valor(serie.curr, serie.currV, iC) || 0;
            }

            return {
                hs: hs === null ? Infinity : hs,
                periodo,
                vientoKn: vientoKn === null ? Infinity : vientoKn,
                vientoDir: vientoDir || 0,
                corrU,
                corrV,
            };
        });
    }

    /* ---------------------------------------------------------------- *
     * Pintado de capas (mismos elementos visuales que la demo, §4)
     * ---------------------------------------------------------------- */
    function colorScore(score) {
        if (score >= 0.66) return '#bf8a3c';
        if (score >= 0.33) return '#9a8a55';
        return '#6f7a4e';
    }

    function pintarCapas(resultado) {
        capaSalidas.clearLayers();
        capaCorredores.clearLayers();
        capaDestinos.clearLayers();

        resultado.salidas.forEach(s => {
            capaSalidas.addLayer(L.circleMarker([s.lat, s.lon], {
                radius: 6 + s.scoreVentana * 14,
                color: '#4a4438',
                weight: 1,
                fillColor: colorScore(s.scoreVentana),
                fillOpacity: 0.65,
            }).bindTooltip(s.nombre + ' — score ' + s.scoreVentana));
        });

        resultado.corredores.forEach(c => {
            if (!c.activo) return;
            capaCorredores.addLayer(L.polyline(c.path, {
                color: c.riesgoDeriva ? '#a94438' : '#57603c',
                weight: 2,
                opacity: 0.8,
                dashArray: c.riesgoDeriva ? '6 8' : null,
            }));
        });

        resultado.llegadas.forEach(l => {
            capaDestinos.addLayer(L.circleMarker([l.lat, l.lon], {
                radius: 9,
                color: '#3b382e',
                weight: 1.5,
                fillColor: COLORES_RAG[l.rag],
                fillOpacity: 0.9,
            }).bindTooltip(l.nombre + ' — ' + l.rag.toUpperCase() + ' (p24 ' + l.p24.toFixed(2) + ')'));
        });
    }

    function recalcular() {
        estado = 'Consultando modelos de Windy (oleaje/viento/corrientes)…';
        ultimoCalculo = Date.now();
        PateraEngine.predecir(getMeteo).then(resultado => {
            ultimoResultado = resultado;
            pintarCapas(resultado);
            llegadas = resultado.llegadas;
            alertas = resultado.alertas;
            generado = new Date(resultado.generadoEn).toLocaleString('es-ES', { timeZone: 'UTC' });
            estado = 'Predicción actualizada.';
        }).catch(e => {
            console.error('[patera-alert]', e);
            estado = 'Error al calcular: ' + e.message;
        });
    }

    // Refresco ante cambios de timeline: como mucho un recálculo cada 10 min
    function alCambiarTimestamp() {
        if (Date.now() - ultimoCalculo > 10 * 60 * 1000) recalcular();
    }

    // Repintado ligero cuando el mapa termina de redibujarse (debounced)
    function alRedibujar() {
        if (temporizador) clearTimeout(temporizador);
        temporizador = setTimeout(() => {
            if (ultimoResultado) pintarCapas(ultimoResultado);
        }, 500);
    }

    onMount(() => {
        capaSalidas = L.layerGroup().addTo(map);
        capaCorredores = L.layerGroup().addTo(map);
        capaDestinos = L.layerGroup().addTo(map);
        store.on('timestamp', alCambiarTimestamp);
        bcast.on('redrawFinished', alRedibujar);
        recalcular();
    });

    onDestroy(() => {
        store.off('timestamp', alCambiarTimestamp);
        bcast.off('redrawFinished', alRedibujar);
        if (temporizador) clearTimeout(temporizador);
        [capaSalidas, capaCorredores, capaDestinos].forEach(c => {
            if (c) map.removeLayer(c);
        });
    });

    // Se puede llamar varias veces: no registrar listeners aquí (doc oficial)
    export const onopen = () => {
        map.setView({ lat: 38.1, lng: 2.2 }, 7);
    };
</script>

<style>
    /* Paleta sobria tierra/arena/oliva (misma que la demo) */
    .plugin__content {
        padding: 10px 14px;
        font-size: 14px;
        color: #3b382e;
    }
    .cabecera {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
    }
    .estado { font-style: italic; color: #6d675a; font-size: 13px; }
    .generado { font-size: 12px; color: #6d675a; margin-top: 4px; }
    .boton {
        background: #6f7a4e;
        color: #fff;
        border: none;
        border-radius: 4px;
        padding: 5px 12px;
        cursor: pointer;
        font-size: 13px;
    }
    .boton:hover { background: #57603c; }
    h2 {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #57603c;
        border-bottom: 1px solid #d7cfba;
        padding-bottom: 3px;
        margin: 16px 0 8px;
    }
    .isla {
        display: grid;
        grid-template-columns: 14px 1fr;
        grid-template-rows: auto auto;
        column-gap: 8px;
        padding: 5px 0;
        border-bottom: 1px solid #eee7d4;
    }
    .punto-rag {
        width: 12px; height: 12px; border-radius: 50%;
        border: 1px solid rgba(0, 0, 0, 0.25);
        grid-row: 1 / 3;
        align-self: center;
    }
    .rag-verde { background: #5b7f57; }
    .rag-ambar { background: #bf8a3c; }
    .rag-rojo { background: #a94438; }
    .nombre { font-weight: bold; font-size: 13px; }
    .probs { font-size: 12px; color: #6d675a; }
    .alertas { margin: 0; padding-left: 18px; }
    .alertas li { margin-bottom: 6px; line-height: 1.35; }
    .leyenda div { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 13px; }
    .muestra { width: 22px; height: 12px; border-radius: 2px; border: 1px solid rgba(0, 0, 0, 0.2); }
    .muestra.verde { background: #5b7f57; }
    .muestra.ambar { background: #bf8a3c; }
    .muestra.rojo { background: #a94438; }
    .muestra.oliva { background: #6f7a4e; }
    .linea { width: 22px; border-top: 3px solid #57603c; }
    .linea.discontinua { border-top-style: dashed; }
    .etica {
        margin-top: 18px;
        font-size: 12px;
        color: #6d675a;
        border-top: 1px solid #d7cfba;
        padding-top: 8px;
    }
    .nota { font-size: 13px; color: #6d675a; }
</style>
