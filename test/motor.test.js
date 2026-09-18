/*
 * test/motor.test.js — Tests del motor "Patera Alert" (SPEC §5)
 *
 * Ejecutar con: node test/motor.test.js
 * Sin dependencias: fetcher sintético inyectado y asserts propios.
 */
'use strict';

var PateraEngine = require('../motor.js');
var CFG = PateraEngine.PATERA_CONFIG;

/* ------------------------------------------------------------------ */
/* Mini-framework de tests                                             */
/* ------------------------------------------------------------------ */
var fallos = 0;
var pasados = 0;

function ok(cond, msg) {
  if (cond) {
    pasados++;
    console.log('  ok - ' + msg);
  } else {
    fallos++;
    console.error('  FALLO - ' + msg);
  }
}

function test(nombre, fn) {
  console.log('\n# ' + nombre);
  return Promise.resolve().then(fn).catch(function (e) {
    fallos++;
    console.error('  FALLO (excepción) - ' + e.stack);
  });
}

/* ------------------------------------------------------------------ */
/* Fetchers sintéticos                                                 */
/* ------------------------------------------------------------------ */

// Calma total: Hs 0.2 m, viento 4 kn, corriente nula
function meteoCalma() {
  return Promise.resolve({ hs: 0.2, periodo: 6, vientoKn: 4, vientoDir: 90, corrU: 0, corrV: 0 });
}

// Temporal: Hs 3 m, viento 30 kn
function meteoTemporal() {
  return Promise.resolve({ hs: 3.0, periodo: 9, vientoKn: 30, vientoDir: 315, corrU: 0.3, corrV: 0.1 });
}

// Ventana parcial: calma solo entre h+6 y h+18 (ambos incluidos)
function meteoVentanaParcial(lat, lon, offsetH) {
  if (offsetH >= 6 && offsetH <= 18) return meteoCalma();
  return meteoTemporal();
}

/* ------------------------------------------------------------------ */
/* Casos del SPEC §5                                                   */
/* ------------------------------------------------------------------ */

var cadena = Promise.resolve();

cadena = cadena.then(function () {
  return test('1. Calma total 72 h -> ventanas largas y al menos un destino en rojo/ambar', function () {
    return PateraEngine.predecir(meteoCalma).then(function (r) {
      ok(r.salidas.length === CFG.puntosSalida.length, 'se analizan todos los puntos de salida');
      var argel = r.salidas.filter(function (s) { return s.puntoId === 'argel'; })[0];
      ok(argel.ventanas.length === 1, 'Argel tiene una única ventana continua');
      ok(argel.ventanas[0].finH - argel.ventanas[0].inicioH + 1 >= 72,
        'la ventana de Argel cubre todo el horizonte (>= 72 h)');
      ok(argel.scoreVentana === 1, 'score de ventana máximo en calma total');
      var algunAviso = r.llegadas.some(function (l) { return l.rag === 'rojo' || l.rag === 'ambar'; });
      ok(algunAviso, 'al menos un destino en rojo o ambar');
      var cabrera = r.llegadas.filter(function (l) { return l.destinoId === 'cabrera'; })[0];
      ok(cabrera.p24 > CFG.ragAmbar, 'Cabrera supera el umbral ambar en 24 h (p24=' + cabrera.p24 + ')');
      ok(cabrera.buckets12h.length === 6, 'buckets de 12 h: 6 entradas');
      ok(r.alertas.length > 0, 'se generan alertas en español');
      var corredorActivo = r.corredores.some(function (c) { return c.activo; });
      ok(corredorActivo, 'hay corredores activos');
      var corr = r.corredores[0];
      ok(corr.path.length === CFG.puntosPorCorredor, 'corredor muestreado con ' + CFG.puntosPorCorredor + ' puntos');
    });
  });
});

cadena = cadena.then(function () {
  return test('2. Temporal (Hs 3 m, viento 30 kn) -> scores 0 y todo verde', function () {
    return PateraEngine.predecir(meteoTemporal).then(function (r) {
      var todosCero = r.salidas.every(function (s) { return s.scoreVentana === 0 && s.ventanas.length === 0; });
      ok(todosCero, 'ningún punto de salida tiene ventana');
      var todoVerde = r.llegadas.every(function (l) {
        return l.rag === 'verde' && l.p24 === 0 && l.p48 === 0 && l.p72 === 0 &&
          l.contribuciones.length === 0;
      });
      ok(todoVerde, 'todos los destinos en verde con probabilidad 0');
      var ningunActivo = r.corredores.every(function (c) { return !c.activo; });
      ok(ningunActivo, 'ningún corredor activo');
    });
  });
});

cadena = cadena.then(function () {
  return test('3. Ventana parcial (calma h+6..h+18) -> contribuciones solo con t0 en ese rango', function () {
    return PateraEngine.predecir(meteoVentanaParcial).then(function (r) {
      var argel = r.salidas.filter(function (s) { return s.puntoId === 'argel'; })[0];
      ok(argel.ventanas.length === 1, 'Argel detecta una única ventana');
      ok(argel.ventanas[0].inicioH === 6 && argel.ventanas[0].finH === 18,
        'la ventana es exactamente h+6..h+18');
      var todas = [];
      r.llegadas.forEach(function (l) { todas = todas.concat(l.contribuciones); });
      ok(todas.length > 0, 'existen contribuciones de llegada');
      var dentroRango = todas.every(function (c) { return c.horaSalidaH >= 6 && c.horaSalidaH <= 18; });
      ok(dentroRango, 'todas las contribuciones salen dentro de la ventana (t0 en [6,18])');
      var lleganDentro = todas.every(function (c) { return c.horaLlegadaH > c.horaSalidaH && c.horaLlegadaH <= 72; });
      ok(lleganDentro, 'todas las llegadas caen dentro del horizonte de 72 h');
    });
  });
});

cadena = cadena.then(function () {
  return test('4. Unidades: geodésica Argel->Cabrera y duración de patera', function () {
    var argel = CFG.puntosSalida.filter(function (p) { return p.id === 'argel'; })[0];
    var cabrera = CFG.destinos.filter(function (d) { return d.id === 'cabrera'; })[0];
    var dKm = PateraEngine.distanciaKm(argel.lat, argel.lon, cabrera.lat, cabrera.lon);
    console.log('  distancia Argel->Cabrera = ' + dKm.toFixed(1) + ' km');
    // NOTA: la SPEC (§5) indica 290-310 km, pero la geodésica haversine de las
    // coordenadas de la propia SPEC (§2) da ~262 km. Se admite el rango
    // 250-310 km; la duración de patera (48 h +/- 30 %) es coherente con 262 km.
    ok(dKm >= 250 && dKm <= 310, 'distancia geodésica en rango plausible (250-310 km)');
    var durH = dKm / (CFG.clases.patera.velocidadKn * 1.852);
    console.log('  duración patera a 3 kn = ' + durH.toFixed(1) + ' h');
    ok(Math.abs(durH - 48) <= 48 * 0.3, 'duración patera ~48 h +/- 30 %');
    return PateraEngine.predecir(meteoCalma).then(function (r) {
      var lleg = r.llegadas.filter(function (l) { return l.destinoId === 'cabrera'; })[0];
      var contribPatera = lleg.contribuciones.filter(function (c) { return c.puntoId === 'argel' && c.clase === 'patera'; });
      ok(contribPatera.length > 0, 'hay contribuciones de patera Argel->Cabrera');
      var durMedia = contribPatera.reduce(function (s, c) { return s + (c.horaLlegadaH - c.horaSalidaH); }, 0) / contribPatera.length;
      ok(Math.abs(durMedia - durH) < 2, 'la duración usada por el motor coincide con la teórica (' + durMedia.toFixed(1) + ' h)');
    });
  });
});

cadena = cadena.then(function () {
  return test('5. Deriva: mar gruesa en corredor marca riesgoDeriva y desplaza el path', function () {
    // Calma en salidas, pero temporal solo en alta mar (lat < 38.5 y fuera de costa)
    function meteoMixto(lat, lon, offsetH) {
      if (lat > 37.3 && lat < 38.7) return meteoTemporal(); // franja central del corredor
      return meteoCalma();
    }
    return PateraEngine.predecir(meteoMixto).then(function (r) {
      var conDeriva = r.corredores.filter(function (c) { return c.riesgoDeriva; });
      ok(conDeriva.length > 0, 'hay corredores con riesgo de deriva');
      var c0 = conDeriva[0];
      var recta = PateraEngine.muestrearRuta(
        CFG.puntosSalida.filter(function (p) { return p.id === c0.puntoId; })[0].lat,
        CFG.puntosSalida.filter(function (p) { return p.id === c0.puntoId; })[0].lon,
        CFG.destinos.filter(function (d) { return d.id === c0.destinoId; })[0].lat,
        CFG.destinos.filter(function (d) { return d.id === c0.destinoId; })[0].lon,
        CFG.puntosPorCorredor);
      var desplazado = c0.path.some(function (pt, i) {
        return Math.abs(pt[0] - recta[i][0]) > 1e-6 || Math.abs(pt[1] - recta[i][1]) > 1e-6;
      });
      ok(desplazado, 'el path con deriva se desvía de la geodésica directa');
    });
  });
});

cadena = cadena.then(function () {
  return test('6. Configuración sobreescribible vía opciones.config', function () {
    return PateraEngine.predecir(meteoTemporal, { config: { hsMaxPosible: 4.0, vientoCeroKn: 40 } }).then(function (r) {
      var algunaVentana = r.salidas.some(function (s) { return s.ventanas.length > 0; });
      ok(algunaVentana, 'con umbrales relajados el temporal ya no bloquea las ventanas');
    });
  });
});

cadena = cadena.then(function () {
  console.log('\n----------------------------------------');
  console.log('Resultado: ' + pasados + ' ok, ' + fallos + ' fallos');
  process.exit(fallos ? 1 : 0);
});
