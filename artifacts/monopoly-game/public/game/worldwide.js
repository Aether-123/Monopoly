"use strict";

function buildWorldwideBoard(selectedCities, resolveTierForCity, arrangeTilesOnBoard, showMessage) {
  const countryCount = {};

  selectedCities.forEach((city) => {
    const c = getCountryForCity(city);
    if (!c) return;
    countryCount[c.countryKey] = (countryCount[c.countryKey] || 0) + 1;
  });

  Object.entries(countryCount).forEach(([key, count]) => {
    if (count === 1 && typeof showMessage === "function") {
      showMessage(`⚠️ ${key} has only 1 city selected. Add at least 1 more to form a set.`);
    }
  });

  const tiles = selectedCities.map((city) => {
    const tier = typeof resolveTierForCity === "function" ? resolveTierForCity(city) : 1;
    return buildPropertyTile(city, tier);
  });

  if (typeof arrangeTilesOnBoard === "function") arrangeTilesOnBoard(tiles);
  applyPositionClasses(tiles);
  return buildActiveSets(tiles);
}

window.buildWorldwideBoard = buildWorldwideBoard;
