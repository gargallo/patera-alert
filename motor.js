/*
 * motor.js — Núcleo puro de "Patera Alert"
 *
 * Sistema de alerta temprana (24–72 h) de llegadas de pateras a Baleares,
 * con lógica de patrón: ventanas de buen tiempo en puntos de salida argelinos,
 * tránsito por clase de embarcación y probabilidad de llegada por isla (RAG).
 *
 * El motor NO hace fetch: el entorno (demo standalone o plugin Windy) inyecta
 * un fetcher de meteo. Funciona sin cambios en node (module.exports) y en
 * navegador (global PateraEngine). Sin dependencias.
 *
 * Herramienta humanitaria de anticipación logística: no localiza embarcaciones
 * ni personas.
 */
(function (root, factory) {
  var PateraEngine = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PateraEngine;
  }
  if (root) {
    root.PateraEngine = PateraEngine;
    root.PATERA_CONFIG = PateraEngine.PATERA_CONFIG;
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Configuración por defecto (SPEC §2). Todo es sobreescribible
   * pasando { config: {...} } en las opciones de predecir().
   * ------------------------------------------------------------------ */
  var PATERA_CONFIG = {
    // Umbrales de mar y viento (SPEC §2)
    hsMaxOptimo: 0.5,        // m: por debajo, condiciones óptimas de salida
    hsMaxPosible: 0.65,      // m: por encima, salida prácticamente imposible
    hsPeligro: 1.5,          // m: superada en corredor -> riesgo de deriva
    vientoMax: 10,           // kn en el punto de salida (referencia operativa)
    vientoOptimoKn: 8,       // kn: por debajo, score de viento = 1
    vientoCeroKn: 12,        // kn: por encima, score de viento = 0
    ventanaMinimaHoras: 6,   // persistencia mínima de calma para considerar salida
    horizonteHoras: 72,      // horizonte de predicción
    bucketHoras: 12,         // tamaño de los buckets de llegada
    // Semáforo RAG sobre p24 (probabilidad agregada de llegada en 24 h)
    ragAmbar: 0.15,
    ragRojo: 0.40,
    // Función de saturación: p = 1 - exp(-k * sumaPesos)
    kSaturacion: 1.0,
    // Deriva (leeway): fracción del viento + corriente superficial
    leewayVientoPct: 0.02,
    // Penalización de velocidad por mar gruesa durante el tránsito:
    // factor = 1 - min(penalizacionMax, pendientePenalizacion * (hs - umbral))
    pendientePenalizacion: 0.6,
    penalizacionMax: 0.6,

    // Puntos de salida (SPEC §2)
    puntosSalida: [
      { id: 'oran',       nombre: 'Orán',       lat: 35.70, lon: -0.64, factorSalida: 0.15 },
      { id: 'mostaganem', nombre: 'Mostaganem', lat: 35.93, lon: 0.09,  factorSalida: 0.15 },
      { id: 'argel',      nombre: 'Argel',      lat: 36.79, lon: 3.06,  factorSalida: 1.0 },
      { id: 'tipaza',     nombre: 'Tipaza',     lat: 36.59, lon: 2.45,  factorSalida: 1.0 },
      { id: 'boumerdes',  nombre: 'Boumerdès',  lat: 36.77, lon: 3.48,  factorSalida: 1.0 },
      { id: 'dellys',     nombre: 'Dellys',     lat: 36.92, lon: 3.91,  factorSalida: 1.0 },
      { id: 'bejaia',     nombre: 'Béjaïa',     lat: 36.75, lon: 5.07,  factorSalida: 1.0 }
    ],

    // Destinos (SPEC §2)
    destinos: [
      { id: 'cabrera',       nombre: 'Cabrera',                 lat: 39.14, lon: 2.93 },
      { id: 'mallorca_sur',  nombre: 'Mallorca sur (Colònia de Sant Jordi)', lat: 39.31, lon: 2.99 },
      { id: 'mallorca_este', nombre: 'Mallorca este (Cala Rajada)',          lat: 39.71, lon: 3.46 },
      { id: 'menorca',       nombre: 'Menorca',                 lat: 39.95, lon: 4.05 },
      { id: 'ibiza',         nombre: 'Ibiza',                   lat: 38.91, lon: 1.43 },
      { id: 'formentera',    nombre: 'Formentera',              lat: 38.70, lon: 1.48 }
    ],

    // Matriz origen -> destinos plausibles con pesos (SPEC §2)
    matriz: {
      argel:      { cabrera: 0.35, mallorca_sur: 0.35, mallorca_este: 0.15, menorca: 0.10, formentera: 0.05 },
      tipaza:     { cabrera: 0.35, mallorca_sur: 0.35, mallorca_este: 0.15, menorca: 0.10, formentera: 0.05 },
      boumerdes:  { cabrera: 0.35, mallorca_sur: 0.35, mallorca_este: 0.15, menorca: 0.10, formentera: 0.05 },
      dellys:     { cabrera: 0.35, mallorca_sur: 0.35, mallorca_este: 0.15, menorca: 0.10, formentera: 0.05 },
      bejaia:     { formentera: 0.45, ibiza: 0.35, mallorca_este: 0.20 },
      oran:       { mallorca_sur: 0.5, cabrera: 0.3, formentera: 0.2 },
      mostaganem: { mallorca_sur: 0.5, cabrera: 0.3, formentera: 0.2 }
    },

    // Clases de embarcación (SPEC §2)
    clases: {
      patera: { velocidadKn: 3.0,  cuota: 0.8, umbralHsPenaliza: 0.8 },
      taxi:   { velocidadKn: 15.0, cuota: 0.2, umbralHsPenaliza: 1.5 }
    },

    puntosPorCorredor: 16  // muestreo de la línea geodésica para corredores[].path
  };

  var KN_A_KMH = 1.852;   // 1 nudo = 1.852 km/h
  var KN_A_MS = 0.514444; // 1 nudo = 0.5144 m/s

  /* ------------------------------------------------------------------ *
   * Utilidades geodésicas
   * ------------------------------------------------------------------ */

  function aRad(g) { return g * Math.PI / 180; }

  // Distancia geodésica haversine en km
  function distanciaKm(lat1, lon1, lat2, lon2) {
    var R = 6371.0;
    var dLat = aRad(lat2 - lat1);
    var dLon = aRad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Línea geodésica muestreada (interpolación lineal suficiente a estas distancias)
  function muestrearRuta(lat1, lon1, lat2, lon2, n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var f = i / (n - 1);
      pts.push([lat1 + (lat2 - lat1) * f, lon1 + (lon2 - lon1) * f]);
    }
    return pts;
  }

  // Desplaza un punto una distancia (km) en un rumbo (grados, hacia)
  function desplazar(lat, lon, distKm, rumboGrad) {
    var r = aRad(rumboGrad);
    var dLat = (distKm * Math.cos(r)) / 111.32;
    var dLon = (distKm * Math.sin(r)) / (111.32 * Math.cos(aRad(lat)) || 1e-6);
    return [lat + dLat, lon + dLon];
  }

  /* ------------------------------------------------------------------ *
   * Lógica de patrón
   * ------------------------------------------------------------------ */

  // Interpolación lineal acotada: 1 en (x <= x0), 0 en (x >= x1)
  function rampa(x, x0, x1) {
    if (x <= x0) return 1;
    if (x >= x1) return 0;
    return (x1 - x) / (x1 - x0);
  }

  /*
   * Score de ventana continuo (SPEC §3.1):
   * 1 si Hs <= hsMaxOptimo y viento <= vientoOptimoKn;
   * 0 si Hs >= hsMaxPosible o viento >= vientoCeroKn; interpolación lineal.
   * El score de la hora es el mínimo de ambos factores: basta con que
   * el mar o el viento se pasen para que el patrón no zarpe.
   */
  function scoreHora(meteo, cfg) {
    if (!meteo) return 0;
    var hs = (typeof meteo.hs === 'number') ? meteo.hs : Infinity;
    var viento = (typeof meteo.vientoKn === 'number') ? meteo.vientoKn : Infinity;
    var sHs = rampa(hs, cfg.hsMaxOptimo, cfg.hsMaxPosible);
    var sViento = rampa(viento, cfg.vientoOptimoKn, cfg.vientoCeroKn);
    return Math.min(sHs, sViento);
  }

  /*
   * Detecta ventanas persistentes (>= ventanaMinimaHoras) de score > 0.
   * Devuelve [{ inicioH, finH, score }] con finH = última hora incluida
   * y score = media de la ventana.
   */
  function detectarVentanas(scores, cfg) {
    var ventanas = [];
    var inicio = -1;
    for (var h = 0; h <= scores.length; h++) {
      var abierto = h < scores.length && scores[h] > 0;
      if (abierto && inicio < 0) {
        inicio = h;
      } else if (!abierto && inicio >= 0) {
        var fin = h - 1;
        if (fin - inicio + 1 >= cfg.ventanaMinimaHoras) {
          var suma = 0;
          for (var j = inicio; j <= fin; j++) suma += scores[j];
          ventanas.push({ inicioH: inicio, finH: fin, score: suma / (fin - inicio + 1) });
        }
        inicio = -1;
      }
    }
    return ventanas;
  }

  // Penalización de velocidad por mar gruesa en el corredor (SPEC §3.2)
  function factorPenalizacion(hs, umbral, cfg) {
    if (!(hs > umbral)) return 1;
    return Math.max(1 - cfg.penalizacionMax, 1 - cfg.pendientePenalizacion * (hs - umbral));
  }

  // Función de saturación pesos -> probabilidad 0..1 (SPEC §3.4)
  function saturar(sumaPesos, k) {
    return 1 - Math.exp(-k * Math.max(0, sumaPesos));
  }

  function ragDesdeP24(p24, cfg) {
    if (p24 > cfg.ragRojo) return 'rojo';
    if (p24 >= cfg.ragAmbar) return 'ambar';
    return 'verde';
  }

  function mergeConfig(base, extra) {
    var out = {};
    var k;
    for (k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    }
    if (extra) {
      for (k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }

  function redondear(x, n) {
    var f = Math.pow(10, n || 3);
    return Math.round(x * f) / f;
  }

  /* ------------------------------------------------------------------ *
   * Motor principal
   *
   * getMeteo(lat, lon, offsetHoras) -> Promise<{hs, periodo?, vientoKn,
   *   vientoDir, corrU, corrV} | null>
   *   hs en m, vientoKn en nudos, vientoDir en grados (de dónde sopla),
   *   corrU/corrV en m/s (hacia: U este, V norte).
   * ------------------------------------------------------------------ */
  function predecir(getMeteo, opciones) {
    opciones = opciones || {};
    var cfg = mergeConfig(PATERA_CONFIG, opciones.config);
    var horizonte = cfg.horizonteHoras;
    var nBuckets = Math.ceil(horizonte / cfg.bucketHoras);

    // Métricas de ejecución (campo aditivo `metricas` del resultado; no
    // altera el contrato existente: generadoEn/salidas/llegadas/corredores/
    // alertas se mantienen tal cual).
    var tInicio = Date.now();
    var meteoNula = 0;

    // Caché interna por punto redondeado y hora: evita multiplicar llamadas
    // al fetcher inyectado (el entorno puede además cachear por celda).
    var cacheMeteo = {};
    function meteoCached(lat, lon, offsetH) {
      var clave = lat.toFixed(2) + ',' + lon.toFixed(2) + ',' + Math.round(offsetH);
      if (!cacheMeteo[clave]) {
        cacheMeteo[clave] = Promise.resolve(getMeteo(lat, lon, Math.round(offsetH)))
          .catch(function () { return null; })
          .then(function (m) {
            if (m === null || m === undefined) meteoNula++;
            return m === undefined ? null : m;
          });
      }
      return cacheMeteo[clave];
    }

    var destinosPorId = {};
    cfg.destinos.forEach(function (d) { destinosPorId[d.id] = d; });

    // Paso 1: muestrear meteo horaria en cada punto de salida (0..horizonte)
    var trabajosSalidas = cfg.puntosSalida.map(function (punto) {
      var horas = [];
      for (var h = 0; h <= horizonte; h++) {
        horas.push(meteoCached(punto.lat, punto.lon, h));
      }
      return Promise.all(horas).then(function (serie) {
        var scores = serie.map(function (m) { return scoreHora(m, cfg); });
        var ventanas = detectarVentanas(scores, cfg);
        var comentario;
        if (!ventanas.length) {
          comentario = 'Sin ventanas persistentes de calma en las próximas ' + horizonte + ' h.';
        } else {
          var mejor = ventanas.reduce(function (a, b) { return b.score > a.score ? b : a; });
          comentario = ventanas.length + ' ventana(s) de salida; la mejor desde h+' +
            mejor.inicioH + ' durante ' + (mejor.finH - mejor.inicioH + 1) +
            ' h (score ' + redondear(mejor.score, 2) + ').';
        }
        return { punto: punto, scores: scores, ventanas: ventanas, comentario: comentario };
      });
    });

    return Promise.all(trabajosSalidas).then(function (analisisSalidas) {
      var salidas = [];
      var alertas = [];
      var contribPorDestino = {};   // destinoId -> [contribuciones]
      var meteoCorredores = {};     // puntoId|destinoId -> meteo del punto medio (peor caso)
      var trabajosTransitos = [];

      cfg.destinos.forEach(function (d) { contribPorDestino[d.id] = []; });

      analisisSalidas.forEach(function (a) {
        var punto = a.punto;
        salidas.push({
          puntoId: punto.id,
          nombre: punto.nombre,
          lat: punto.lat,
          lon: punto.lon,
          scoreVentana: a.ventanas.length
            ? redondear(a.ventanas.reduce(function (m, v) { return Math.max(m, v.score); }, 0), 3)
            : 0,
          ventanas: a.ventanas.map(function (v) {
            return { inicioH: v.inicioH, finH: v.finH, score: redondear(v.score, 3) };
          }),
          comentario: a.comentario
        });

        // Alertas de ventana, redactadas como parte náutico (SPEC §3.5)
        a.ventanas.forEach(function (v) {
          if (v.score >= 0.5) {
            alertas.push('Ventana favorable en ' + punto.nombre + ' desde h+' + v.inicioH +
              ' durante ' + (v.finH - v.inicioH + 1) + ' h (score ' + redondear(v.score, 2) + ').');
          }
        });

        var matrizPunto = cfg.matriz[punto.id] || {};

        // Paso 2 y 3: por cada ventana, hora de salida, clase y destino
        a.ventanas.forEach(function (v) {
          var horasSalida = [];
          for (var h = v.inicioH; h <= v.finH; h++) horasSalida.push(h);
          horasSalida.forEach(function (t0) {
            var scoreT0 = a.scores[t0];
            Object.keys(matrizPunto).forEach(function (destinoId) {
              var destino = destinosPorId[destinoId];
              if (!destino) return;
              var pesoOD = matrizPunto[destinoId];
              var distKm = distanciaKm(punto.lat, punto.lon, destino.lat, destino.lon);
              var midLat = (punto.lat + destino.lat) / 2;
              var midLon = (punto.lon + destino.lon) / 2;

              Object.keys(cfg.clases).forEach(function (claseId) {
                var clase = cfg.clases[claseId];
                var durBaseH = distKm / (clase.velocidadKn * KN_A_KMH);
                var tMedio = t0 + durBaseH / 2;
                if (tMedio > horizonte) return; // sin previsión para evaluar el corredor

                var trabajo = meteoCached(midLat, midLon, tMedio).then(function (meteoMid) {
                  var hsMid = meteoMid && typeof meteoMid.hs === 'number' ? meteoMid.hs : 0;
                  var factor = factorPenalizacion(hsMid, clase.umbralHsPenaliza, cfg);
                  var durH = durBaseH / factor;
                  var tLlegada = t0 + durH;
                  if (tLlegada > horizonte) return; // llegada fuera del horizonte

                  // Peso de la contribución (SPEC §3.3)
                  var peso = scoreT0 * pesoOD * clase.cuota * (punto.factorSalida || 1);
                  if (peso <= 0) return;

                  var riesgoDeriva = hsMid > cfg.hsPeligro;

                  // Registrar meteo del corredor (peor caso para el path)
                  var claveCorr = punto.id + '|' + destinoId;
                  var prev = meteoCorredores[claveCorr];
                  if (!prev || hsMid > prev.hs) {
                    meteoCorredores[claveCorr] = {
                      hs: hsMid,
                      meteo: meteoMid,
                      durH: durH,
                      riesgoDeriva: prev ? (prev.riesgoDeriva || riesgoDeriva) : riesgoDeriva
                    };
                  } else if (riesgoDeriva) {
                    prev.riesgoDeriva = true;
                  }

                  contribPorDestino[destinoId].push({
                    puntoId: punto.id,
                    clase: claseId,
                    horaSalidaH: t0,
                    horaLlegadaH: redondear(tLlegada, 1),
                    peso: redondear(peso, 4)
                  });
                });
                trabajosTransitos.push(trabajo);
              });
            });
          });
        });
      });

      return Promise.all(trabajosTransitos).then(function () {
        // Paso 4: agregación por destino en buckets de 12 h y saturación
        var llegadas = cfg.destinos.map(function (destino) {
          var contrib = contribPorDestino[destino.id];
          var sumas = [];
          var i;
          for (i = 0; i < nBuckets; i++) sumas.push(0);
          contrib.forEach(function (c) {
            var b = Math.min(nBuckets - 1, Math.floor(c.horaLlegadaH / cfg.bucketHoras));
            sumas[b] += c.peso;
          });
          var buckets12h = sumas.map(function (s) { return redondear(saturar(s, cfg.kSaturacion), 4); });
          function pHasta(nHoras) {
            var s = 0;
            var n = Math.min(nBuckets, Math.ceil(nHoras / cfg.bucketHoras));
            for (var i = 0; i < n; i++) s += sumas[i];
            return redondear(saturar(s, cfg.kSaturacion), 4);
          }
          var p24 = pHasta(24);
          var p48 = pHasta(48);
          var p72 = pHasta(72);
          var rag = ragDesdeP24(p24, cfg);

          if (rag === 'rojo') {
            alertas.push('Aviso alto: probabilidad de llegadas a ' + destino.nombre +
              ' en las próximas 24 h (p24=' + redondear(p24, 2) + '). Prever refuerzo logístico.');
          } else if (rag === 'ambar') {
            alertas.push('Aviso moderado: posibles llegadas a ' + destino.nombre +
              ' en las próximas 24 h (p24=' + redondear(p24, 2) + ').');
          }

          contrib.sort(function (x, y) { return y.peso - x.peso; });
          return {
            destinoId: destino.id,
            nombre: destino.nombre,
            lat: destino.lat,
            lon: destino.lon,
            p24: p24,
            p48: p48,
            p72: p72,
            rag: rag,
            buckets12h: buckets12h,
            contribuciones: contrib
          };
        });

        // Paso 6: corredores con path geodésico y desplazamiento por deriva
        var corredores = [];
        cfg.puntosSalida.forEach(function (punto) {
          var matrizPunto = cfg.matriz[punto.id] || {};
          Object.keys(matrizPunto).forEach(function (destinoId) {
            var destino = destinosPorId[destinoId];
            if (!destino) return;
            var claveCorr = punto.id + '|' + destinoId;
            var info = meteoCorredores[claveCorr];
            var activo = contribPorDestino[destinoId].some(function (c) { return c.puntoId === punto.id; });
            var riesgoDeriva = !!(info && info.riesgoDeriva);
            var path = muestrearRuta(punto.lat, punto.lon, destino.lat, destino.lon, cfg.puntosPorCorredor);

            if (riesgoDeriva && info && info.meteo) {
              // Deriva (leeway): 2% del viento hacia donde sopla + corriente
              // superficial, aplicada de forma progresiva sobre el trayecto.
              var m = info.meteo;
              var vientoMs = (m.vientoKn || 0) * KN_A_MS;
              var rumboDownwind = aRad((m.vientoDir || 0) + 180); // hacia donde empuja
              var derU = cfg.leewayVientoPct * vientoMs * Math.sin(rumboDownwind) + (m.corrU || 0);
              var derV = cfg.leewayVientoPct * vientoMs * Math.cos(rumboDownwind) + (m.corrV || 0);
              var derivaMs = Math.sqrt(derU * derU + derV * derV);
              if (derivaMs > 0) {
                var rumboDeriva = (Math.atan2(derU, derV) * 180 / Math.PI + 360) % 360;
                var derivaTotalKm = derivaMs * 3.6 * info.durH;
                path = path.map(function (pt, i) {
                  var f = i / (path.length - 1);
                  return desplazar(pt[0], pt[1], derivaTotalKm * f, rumboDeriva)
                    .map(function (x) { return redondear(x, 4); });
                });
                alertas.push('Mar gruesa en el corredor ' + punto.nombre + ' – ' + destino.nombre +
                  ' (Hs ' + redondear(info.hs, 1) + ' m): riesgo de avería y deriva en ruta.');
              }
            }

            corredores.push({
              puntoId: punto.id,
              destinoId: destinoId,
              path: path.map(function (pt) { return [redondear(pt[0], 4), redondear(pt[1], 4)]; }),
              activo: activo,
              riesgoDeriva: riesgoDeriva
            });
          });
        });

        // Ordenar llegadas de mayor a menor p24 para la presentación
        llegadas.sort(function (x, y) { return y.p24 - x.p24; });

        // Métricas de ejecución (aditivo; ver cabecera de predecir)
        var totalContribuciones = llegadas.reduce(function (s, l) {
          return s + l.contribuciones.length;
        }, 0);
        var metricas = {
          duracionMs: Date.now() - tInicio,
          celdasConsultadas: Object.keys(cacheMeteo).length,
          meteoNula: meteoNula,
          contribuciones: totalContribuciones,
          corredoresActivos: corredores.filter(function (c) { return c.activo; }).length,
          horizonteHoras: cfg.horizonteHoras,
          ventanaMinimaHoras: cfg.ventanaMinimaHoras,
          kSaturacion: cfg.kSaturacion
        };

        return {
          generadoEn: new Date().toISOString(),
          salidas: salidas,
          llegadas: llegadas,
          corredores: corredores,
          alertas: alertas,
          metricas: metricas
        };
      });
    });
  }

  return {
    predecir: predecir,
    PATERA_CONFIG: PATERA_CONFIG,
    // Utilidades expuestas para tests y para los entornos (demo / Windy)
    distanciaKm: distanciaKm,
    muestrearRuta: muestrearRuta,
    scoreHora: scoreHora,
    detectarVentanas: detectarVentanas,
    ragDesdeP24: ragDesdeP24
  };
});
