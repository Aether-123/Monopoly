"use strict";

const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function getTierCountries(tier) {
  const keys = Object.keys(COUNTRY_DATA);
  const perTier = 5;
  const start = (tier - 1) * perTier;
  return keys.slice(start, start + perTier);
}

function buildRandomBoard(params, arrangeTilesOnBoard) {
  const selectedTiles = [];
  const countriesUsed = new Set();

  Object.entries(params.tierDistribution).forEach(([tier, count]) => {
    const tierCountries = getTierCountries(Number(tier));
    const shuffled = [...tierCountries].sort(() => Math.random() - 0.5);

    let remaining = count;
    for (const countryKey of shuffled) {
      if (remaining <= 0) break;
      if (countriesUsed.has(countryKey)) continue;

      const max = Math.min(params.tilesPerCountry.max, remaining);
      const cityCount = randomInt(params.tilesPerCountry.min, max);
      const allCities = COUNTRY_DATA[countryKey].cities;
      const picked = shuffle(allCities).slice(0, cityCount);

      picked.forEach((city) => selectedTiles.push(buildPropertyTile(city, Number(tier))));

      countriesUsed.add(countryKey);
      remaining -= cityCount;
    }
  });

  if (typeof arrangeTilesOnBoard === "function") arrangeTilesOnBoard(selectedTiles);
  applyPositionClasses(selectedTiles);
  return buildActiveSets(selectedTiles);
}

window.shuffle = shuffle;
window.randomInt = randomInt;
window.getTierCountries = getTierCountries;
window.buildRandomBoard = buildRandomBoard;
