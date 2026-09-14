'use strict';

/**
 * De dimmer werkt betrouwbaar tussen 30 en 100. De hub rekent in die ruwe
 * waarden, maar toont de gebruiker een schaal van 0 tot 100, en dat is ook wat
 * de webinterface doet. Zonder omrekenen zou een boiler die net aanslaat in
 * Homey op 31% staan terwijl het dashboard 1% zegt.
 */
const MIN_STAND = 30;
const MAX_STAND = 100;

function zichtbaarNaarRuw(zichtbaar) {
  const v = Number(zichtbaar) || 0;
  if (v <= 0) return 0;
  if (v >= 100) return MAX_STAND;
  return Math.round(MIN_STAND + (v / 100) * (MAX_STAND - MIN_STAND));
}

function ruwNaarZichtbaar(ruw) {
  if (ruw === null || ruw === undefined) return null;
  const r = Number(ruw);
  if (r <= 0) return 0;
  return Math.max(0, Math.min(100, ((r - MIN_STAND) / (MAX_STAND - MIN_STAND)) * 100));
}

module.exports = { MIN_STAND, MAX_STAND, zichtbaarNaarRuw, ruwNaarZichtbaar };
