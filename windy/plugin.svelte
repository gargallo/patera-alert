<div class="plugin__mobile-header">{title}</div>
<section class="plugin__content">
    <!-- 1. Cabecera: estado + recalcular + timestamp -->
    <div class="cabecera">
        <span class="estado">{estado}</span>
        <button class="boton" on:click={recalcular}>Recalcular</button>
    </div>
    {#if generado}
        <div class="generado">Generado: {generado} UTC</div>
    {/if}

    <!-- 2. Semáforo por isla: buckets de 12 h + detalle de contribuciones -->
    <details class="seccion" open>
        <summary>Semáforo por isla</summary>
        <div class="semaforo">
            {#each llegadas as l}
                <div class="isla clickable" on:click={() => alternarIsla(l.destinoId)}>
                    <span class="punto-rag rag-{l.rag}"></span>
                    <span class="nombre">{l.nombre}</span>
                    <span class="probs">24h {l.p24.toFixed(2)} · 48h {l.p48.toFixed(2)} · 72h {l.p72.toFixed(2)}</span>
                    <span class="buckets" aria-hidden="true">
                        {#each l.buckets12h as p, i}
                            <span
                                class="bucket"
                                style="background: {COLORES_RAG[l.rag]}; opacity: {0.12 + 0.88 * p}"
                                title="h+{i * 12}–h+{(i + 1) * 12}: p = {p.toFixed(2)}"
                            ></span>
                        {/each}
                    </span>
                    {#if islaExpandida === l.destinoId}
                        <div class="detalle">
                            {#if l.contribuciones.length}
                                <table class="tabla">
                                    <thead>
                                        <tr>
                                            <th>Origen</th>
                                            <th>Clase</th>
                                            <th>Salida</th>
                                            <th>Llegada</th>
                                            <th>Peso</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {#each l.contribuciones as c}
                                            <tr>
                                                <td>{nombreSalida(c.puntoId)}</td>
                                                <td>{c.clase}</td>
                                                <td>h+{redondear1(c.horaSalidaH)}</td>
                                                <td>h+{redondear1(c.horaLlegadaH)}</td>
                                                <td>{c.peso.toFixed(3)}</td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            {:else}
                                <p class="nota">Sin contribuciones de llegada en el horizonte.</p>
                            {/if}
                        </div>
                    {/if}
                </div>
            {/each}
            {#if !llegadas.length}
                <p class="nota">Sin datos todavía.</p>
            {/if}
        </div>
    </details>

    <!-- 3. Ventanas de salida -->
    <details class="seccion" open>
        <summary>Ventanas de salida</summary>
        <div class="salidas">
            {#each salidasOrdenadas as s}
                <div class="salida">
                    <div class="salida-cab">
                        <span class="nombre">{s.nombre}</span>
                        <span class="score" style="background: {colorScore(s.scoreVentana)}">
                            {s.scoreVentana.toFixed(2)}
                        </span>
                    </div>
                    {#if s.ventanas.length}
                        <ul class="ventanas">
                            {#each s.ventanas as v}
                                <li>h+{v.inicioH} → h+{v.finH + 1} ({v.finH - v.inicioH + 1} h)</li>
                            {/each}
                        </ul>
                    {:else}
                        <p class="nota">Sin ventanas persistentes de calma.</p>
                    {/if}
                </div>
            {/each}
            {#if !salidasOrdenadas.length}
                <p class="nota">Sin datos todavía.</p>
            {/if}
        </div>
    </details>

    <!-- 4. Alertas -->
    <details class="seccion" open>
        <summary>Alertas</summary>
        <ul class="alertas">
            {#each alertas as a}
                <li>{a}</li>
            {:else}
                <li>Sin avisos en el horizonte de 72 h.</li>
            {/each}
        </ul>
    </details>

    <!-- 5. Capas del mapa + leyenda -->
    <details class="seccion" open>
        <summary>Capas</summary>
        <div class="capas">
            <label><input type="checkbox" bind:checked={capasVisibles.salidas} on:change={aplicarCapas} /> Salidas</label>
            <label><input type="checkbox" bind:checked={capasVisibles.corredores} on:change={aplicarCapas} /> Corredores</label>
            <label><input type="checkbox" bind:checked={capasVisibles.destinos} on:change={aplicarCapas} /> Destinos</label>
        </div>
        <div class="leyenda">
            <div><span class="muestra verde"></span> Verde: p24 &lt; 0.15</div>
            <div><span class="muestra ambar"></span> Ámbar: p24 0.15–0.40</div>
            <div><span class="muestra rojo"></span> Rojo: p24 &gt; 0.40</div>
            <div><span class="muestra oliva"></span> Punto de salida (tamaño/color = score de ventana)</div>
            <div><span class="linea"></span> Corredor activo</div>
            <div><span class="linea discontinua"></span> Corredor con riesgo de deriva</div>
        </div>
    </details>

    <!-- 6. Configuración (plegada por defecto, persistente en localStorage) -->
    <details class="seccion">
        <summary>Configuración</summary>
        <p class="nota">
            Valores efectivos del motor; entre paréntesis, el valor por defecto.
            Se guardan en este navegador (localStorage).
        </p>
        <div class="config">
            {#each CAMPOS_CONFIG as campo}
                <label class="config-fila">
                    <span class="config-etiqueta">
                        {campo.etiqueta} <span class="defecto">({leerRuta(CFG, campo.clave)})</span>
                    </span>
                    <input type="number" step={campo.paso} bind:value={configForm[campo.clave]} />
                </label>
            {/each}
        </div>
        <div class="config-botones">
            <button class="boton" on:click={aplicarYRecalcular}>Aplicar y recalcular</button>
            <button class="boton secundario" on:click={restablecerConfig}>Restablecer valores</button>
        </div>
    </details>

    <!-- 7. Métricas (plegada por defecto) -->
    <details class="seccion">
        <summary>Métricas</summary>
        {#if metricas}
            <table class="tabla metricas">
                <tbody>
                    {#each filasMetricas as f}
                        <tr><td>{f.etiqueta}</td><td class="num">{f.valor}</td></tr>
                    {/each}
                </tbody>
            </table>
        {:else}
            <p class="nota">Sin datos todavía.</p>
        {/if}
    </details>

    <!-- 8. Exportar (para validación retrospectiva) -->
    <details class="seccion">
        <summary>Exportar</summary>
        <p class="nota">Copia el resultado completo (JSON) al portapapeles para la validación retrospectiva.</p>
        <button class="boton" on:click={copiarJSON} disabled={!ultimoResultado}>
            {copiado ? 'Copiado' : 'Copiar JSON'}
        </button>
    </details>

    <!-- 9. Texto ético: siempre visible -->
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
     *
     * Panel con secciones plegables: semáforo por isla (con detalle de
     * contribuciones), ventanas de salida, alertas, capas del mapa,
     * configuración persistente (localStorage), métricas de ejecución y
     * exportación JSON para validación retrospectiva.
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
    let salidas = [];
    let alertas = [];
    let metricas = null;
    let islaExpandida = null;
    let copiado = false;

    // Cobertura de modelos por celda (se incrementa al cargar cada serie)
    let cobertura = { celdas: 0, oleaje: 0, viento: 0, corrientes: 0 };

    // Capas del mapa (L es el Leaflet GL global de Windy)
    let capaSalidas = null;
    let capaCorredores = null;
    let capaDestinos = null;
    let ultimoResultado = null;
    let ultimoCalculo = 0;
    let temporizador = null;

    /* ---------------------------------------------------------------- *
     * Persistencia en localStorage
     * ---------------------------------------------------------------- */
    const LS_CAPAS = 'patera-alert-capas-v1';
    const LS_CONFIG = 'patera-alert-config-v1';

    function leerLS(clave) {
        try {
            const crudo = localStorage.getItem(clave);
            return crudo ? JSON.parse(crudo) : null;
        } catch (e) {
            console.warn('[patera-alert] localStorage no disponible para', clave, e);
            return null;
        }
    }

    function escribirLS(clave, valor) {
        try {
            localStorage.setItem(clave, JSON.stringify(valor));
        } catch (e) {
            console.warn('[patera-alert] no se pudo guardar', clave, e);
        }
    }

    function borrarLS(clave) {
        try {
            localStorage.removeItem(clave);
        } catch (e) {
            /* sin localStorage no hay nada que borrar */
        }
    }

    /* ---------------------------------------------------------------- *
     * Capas: visibilidad persistente
     * ---------------------------------------------------------------- */
    let capasVisibles = Object.assign(
        { salidas: true, corredores: true, destinos: true },
        leerLS(LS_CAPAS) || {}
    );

    function gruposCapas() {
        return { salidas: capaSalidas, corredores: capaCorredores, destinos: capaDestinos };
    }

    // Sincroniza map.addLayer / map.removeLayer con capasVisibles
    function aplicarCapas() {
        const grupos = gruposCapas();
        Object.keys(grupos).forEach(nombre => {
            const capa = grupos[nombre];
            if (!capa) return;
            if (capasVisibles[nombre]) {
                if (!map.hasLayer(capa)) map.addLayer(capa);
            } else if (map.hasLayer(capa)) {
                map.removeLayer(capa);
            }
        });
        escribirLS(LS_CAPAS, capasVisibles);
    }

    /* ---------------------------------------------------------------- *
     * Configuración editable (overrides de PATERA_CONFIG)
     * ---------------------------------------------------------------- */
    // Campos escalares + velocidades/cuotas de las dos clases.
    // Las claves con punto anidan dentro de `clases`.
    const CAMPOS_CONFIG = [
        { clave: 'hsMaxOptimo', etiqueta: 'Hs máx. óptimo (m)', paso: 0.05 },
        { clave: 'hsMaxPosible', etiqueta: 'Hs máx. posible (m)', paso: 0.05 },
        { clave: 'hsPeligro', etiqueta: 'Hs peligro de deriva (m)', paso: 0.1 },
        { clave: 'vientoOptimoKn', etiqueta: 'Viento óptimo (kn)', paso: 1 },
        { clave: 'vientoCeroKn', etiqueta: 'Viento límite (kn)', paso: 1 },
        { clave: 'ventanaMinimaHoras', etiqueta: 'Ventana mínima (h)', paso: 1 },
        { clave: 'kSaturacion', etiqueta: 'k de saturación', paso: 0.1 },
        { clave: 'ragAmbar', etiqueta: 'Umbral RAG ámbar (p24)', paso: 0.05 },
        { clave: 'ragRojo', etiqueta: 'Umbral RAG rojo (p24)', paso: 0.05 },
        { clave: 'leewayVientoPct', etiqueta: 'Leeway de viento (fracción)', paso: 0.005 },
        { clave: 'clases.patera.velocidadKn', etiqueta: 'Patera: velocidad (kn)', paso: 0.5 },
        { clave: 'clases.patera.cuota', etiqueta: 'Patera: cuota (0–1)', paso: 0.05 },
        { clave: 'clases.taxi.velocidadKn', etiqueta: 'Taxi: velocidad (kn)', paso: 0.5 },
        { clave: 'clases.taxi.cuota', etiqueta: 'Taxi: cuota (0–1)', paso: 0.05 },
    ];

    function leerRuta(obj, ruta) {
        return ruta.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
    }

    function escribirRuta(obj, ruta, valor) {
        const partes = ruta.split('.');
        let destino = obj;
        for (let i = 0; i < partes.length - 1; i++) {
            if (!destino[partes[i]]) destino[partes[i]] = {};
            destino = destino[partes[i]];
        }
        destino[partes[partes.length - 1]] = valor;
    }

    function formularioPorDefecto() {
        const form = {};
        CAMPOS_CONFIG.forEach(c => { form[c.clave] = leerRuta(CFG, c.clave); });
        return form;
    }

    // Formulario plano editable; se inicializa con lo persistido (si es válido)
    // y de él se derivan los overrides que se pasan a predecir().
    let configForm = Object.assign(formularioPorDefecto(), leerLS(LS_CONFIG) || {});

    function overridesDesdeFormulario() {
        const overrides = {};
        CAMPOS_CONFIG.forEach(c => {
            const v = parseFloat(configForm[c.clave]);
            const defecto = leerRuta(CFG, c.clave);
            if (!isNaN(v) && v !== defecto) escribirRuta(overrides, c.clave, v);
        });
        return overrides;
    }

    let overridesConfig = overridesDesdeFormulario();

    function aplicarYRecalcular() {
        escribirLS(LS_CONFIG, configForm);
        overridesConfig = overridesDesdeFormulario();
        recalcular();
    }

    function restablecerConfig() {
        configForm = formularioPorDefecto();
        borrarLS(LS_CONFIG);
        overridesConfig = {};
        recalcular();
    }

    /* ---------------------------------------------------------------- *
     * Fetcher getMeteo sobre @windy/fetch (SPEC §6)
     *
     * Modelos con fallback:
     *   oleaje:    ecmwfWaves -> gfsWaves   (getPointForecastData)
     *   viento:    ecmwf -> gfs             (getPointForecastData)
     *   corrientes: cmems                   (getMeteogramForecastData)
     * Caché por celda redondeada de 0.25° para no repetir llamadas.
     * Cada serie cargada incrementa los contadores de cobertura.
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

        // Cobertura de modelos: una celda más con sus series OK/no OK.
        // Se reasigna el objeto para disparar la reactividad de Svelte.
        cobertura = {
            celdas: cobertura.celdas + 1,
            oleaje: cobertura.oleaje + (waves ? 1 : 0),
            viento: cobertura.viento + (wind ? 1 : 0),
            corrientes: cobertura.corrientes + (currU && currV ? 1 : 0),
        };

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

    /* ---------------------------------------------------------------- *
     * Presentación: derivados del resultado
     * ---------------------------------------------------------------- */
    const nombreSalidaPorId = {};
    CFG.puntosSalida.forEach(p => { nombreSalidaPorId[p.id] = p.nombre; });
    const nombreSalida = id => nombreSalidaPorId[id] || id;
    const redondear1 = x => Math.round(x * 10) / 10;

    function alternarIsla(destinoId) {
        islaExpandida = islaExpandida === destinoId ? null : destinoId;
    }

    $: salidasOrdenadas = [...salidas].sort((a, b) => b.scoreVentana - a.scoreVentana);

    const ETIQUETAS_METRICAS = {
        duracionMs: 'Duración del cálculo (ms)',
        celdasConsultadas: 'Celdas de meteo consultadas',
        meteoNula: 'Consultas sin datos (null)',
        contribuciones: 'Contribuciones de llegada',
        corredoresActivos: 'Corredores activos',
        horizonteHoras: 'Horizonte (h)',
        ventanaMinimaHoras: 'Ventana mínima (h)',
        kSaturacion: 'k de saturación',
    };

    $: filasMetricas = metricas
        ? Object.keys(ETIQUETAS_METRICAS)
            .map(k => ({ etiqueta: ETIQUETAS_METRICAS[k], valor: metricas[k] }))
            .concat([{
                etiqueta: 'Cobertura de modelos',
                valor: 'Oleaje ' + cobertura.oleaje + '/' + cobertura.celdas +
                    ' · Viento ' + cobertura.viento + '/' + cobertura.celdas +
                    ' · Corrientes ' + cobertura.corrientes + '/' + cobertura.celdas,
            }])
        : [];

    /* ---------------------------------------------------------------- *
     * Recálculo y exportación
     * ---------------------------------------------------------------- */
    function recalcular() {
        estado = 'Consultando modelos de Windy (oleaje/viento/corrientes)…';
        ultimoCalculo = Date.now();
        const opciones = Object.keys(overridesConfig).length ? { config: overridesConfig } : {};
        PateraEngine.predecir(getMeteo, opciones).then(resultado => {
            ultimoResultado = resultado;
            pintarCapas(resultado);
            llegadas = resultado.llegadas;
            salidas = resultado.salidas;
            alertas = resultado.alertas;
            metricas = resultado.metricas || null;
            generado = new Date(resultado.generadoEn).toLocaleString('es-ES', { timeZone: 'UTC' });
            estado = 'Predicción actualizada.';
        }).catch(e => {
            console.error('[patera-alert]', e);
            estado = 'Error al calcular: ' + e.message;
        });
    }

    // Copia el último resultado al portapapeles (con fallback para contextos
    // sin clipboard API) y muestra confirmación durante 2 s.
    async function copiarJSON() {
        if (!ultimoResultado) return;
        const texto = JSON.stringify(ultimoResultado, null, 2);
        try {
            await navigator.clipboard.writeText(texto);
        } catch (e) {
            const area = document.createElement('textarea');
            area.value = texto;
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            document.body.removeChild(area);
        }
        copiado = true;
        setTimeout(() => { copiado = false; }, 2000);
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
        capaSalidas = L.layerGroup();
        capaCorredores = L.layerGroup();
        capaDestinos = L.layerGroup();
        aplicarCapas(); // añade al mapa solo las capas visibles (persistido)
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
    .boton:disabled { opacity: 0.55; cursor: default; }
    .boton.secundario {
        background: transparent;
        color: #57603c;
        border: 1px solid #6f7a4e;
    }
    .boton.secundario:hover { background: #efe9d8; }

    /* Secciones plegables */
    .seccion {
        margin-top: 14px;
        border-bottom: 1px solid #d7cfba;
        padding-bottom: 6px;
    }
    .seccion summary {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #57603c;
        cursor: pointer;
        padding: 3px 0;
        list-style: none;
        user-select: none;
    }
    .seccion summary::before {
        content: '▸';
        display: inline-block;
        margin-right: 6px;
        transition: transform 0.15s ease;
    }
    .seccion[open] summary::before { transform: rotate(90deg); }
    .seccion summary::-webkit-details-marker { display: none; }

    /* Semáforo por isla */
    .isla {
        display: grid;
        grid-template-columns: 14px 1fr;
        grid-template-rows: auto auto auto;
        column-gap: 8px;
        padding: 5px 0;
        border-bottom: 1px solid #eee7d4;
    }
    .isla.clickable { cursor: pointer; }
    .isla.clickable:hover .nombre { text-decoration: underline; }
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

    /* Mini-barra de buckets de 12 h */
    .buckets {
        grid-column: 2;
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 2px;
        margin-top: 4px;
    }
    .bucket {
        height: 8px;
        border-radius: 2px;
        border: 1px solid rgba(0, 0, 0, 0.15);
    }

    .detalle {
        grid-column: 1 / 3;
        margin-top: 6px;
        max-height: 180px;
        overflow-y: auto;
    }

    /* Tablas (contribuciones y métricas) */
    .tabla {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }
    .tabla th {
        text-align: left;
        color: #57603c;
        border-bottom: 1px solid #d7cfba;
        padding: 2px 6px 2px 0;
        font-weight: bold;
    }
    .tabla td {
        border-bottom: 1px solid #eee7d4;
        padding: 2px 6px 2px 0;
    }
    .tabla.metricas td.num { text-align: right; white-space: nowrap; }

    /* Ventanas de salida */
    .salida { padding: 4px 0; border-bottom: 1px solid #eee7d4; }
    .salida-cab { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .score {
        color: #fff;
        font-size: 11px;
        border-radius: 3px;
        padding: 1px 6px;
        min-width: 30px;
        text-align: center;
    }
    .ventanas { margin: 3px 0 2px; padding-left: 18px; font-size: 12px; color: #3b382e; }
    .ventanas li { margin-bottom: 2px; }

    .alertas { margin: 6px 0 0; padding-left: 18px; }
    .alertas li { margin-bottom: 6px; line-height: 1.35; }

    /* Capas + leyenda */
    .capas { display: flex; gap: 14px; flex-wrap: wrap; margin: 6px 0 10px; }
    .capas label { display: flex; align-items: center; gap: 5px; font-size: 13px; cursor: pointer; }
    .leyenda div { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; font-size: 13px; }
    .muestra { width: 22px; height: 12px; border-radius: 2px; border: 1px solid rgba(0, 0, 0, 0.2); }
    .muestra.verde { background: #5b7f57; }
    .muestra.ambar { background: #bf8a3c; }
    .muestra.rojo { background: #a94438; }
    .muestra.oliva { background: #6f7a4e; }
    .linea { width: 22px; border-top: 3px solid #57603c; }
    .linea.discontinua { border-top-style: dashed; }

    /* Configuración */
    .config { margin-top: 6px; }
    .config-fila {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-bottom: 5px;
        font-size: 12px;
    }
    .config-etiqueta { flex: 1; }
    .defecto { color: #6d675a; }
    .config-fila input {
        width: 82px;
        padding: 3px 5px;
        font-size: 12px;
        border: 1px solid #d7cfba;
        border-radius: 3px;
        background: #fbf8ef;
        color: #3b382e;
    }
    .config-botones { display: flex; gap: 8px; margin-top: 8px; }

    .etica {
        margin-top: 18px;
        font-size: 12px;
        color: #6d675a;
        border-top: 1px solid #d7cfba;
        padding-top: 8px;
    }
    .nota { font-size: 13px; color: #6d675a; }
</style>
