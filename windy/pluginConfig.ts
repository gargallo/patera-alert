import type { ExternalPluginConfig } from '@windy/interfaces';

/*
 * Configuracion del plugin "Patera Alert" (SPEC §6).
 * Nota: el campo `icon` admite cualquier string; se usa texto plano en lugar
 * de emoji para cumplir la regla del proyecto "sin emojis en archivos".
 * El plugin se publica como privado por defecto (compartible por URL).
 */
const config: ExternalPluginConfig = {
    name: 'windy-plugin-patera-alert',
    version: '0.1.0',
    icon: 'PA',
    title: 'Patera Alert: alerta temprana Baleares',
    description:
        'Alerta temprana (24-72 h) de llegadas de pateras a Baleares a partir de la meteo marina: ' +
        'ventanas de salida en la costa argelina, transito por clase de embarcacion y semaforo RAG por isla. ' +
        'Herramienta humanitaria de anticipacion logistica: no localiza embarcaciones ni personas.',
    author: 'Patera Alert (prototipo en validacion)',
    repository: 'https://github.com/gargallo/patera-alert',
    desktopUI: 'rhpane',
    desktopWidth: 360,
    mobileUI: 'fullscreen',
    routerPath: '/patera-alert',
    private: true,
};

export default config;
