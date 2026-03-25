"use strict";

function applyPositionClasses(boardTiles) {
  const CORNERS = new Set([0, 10, 20, 30]);

  const tiles = Array.isArray(boardTiles)
    ? boardTiles
        .map((tile, index) => {
          if (!tile || !tile.element) return null;
          tile.element.dataset.index = String(index);
          if (tile.iso) tile.element.dataset.iso = tile.iso;
          return tile.element;
        })
        .filter(Boolean)
    : Array.from(document.querySelectorAll(".tile[data-index]"));

  tiles.forEach((el) => {
    const index = Number.parseInt(el.dataset.index || "-1", 10);
    if (Number.isNaN(index) || index < 0) return;

    el.classList.remove("corner-tile", "top-row", "right-col", "bottom-row", "left-col");

    if (CORNERS.has(index)) {
      el.classList.add("corner-tile");
      return;
    }

    if (index >= 1 && index <= 9) {
      el.classList.add("top-row");
    } else if (index >= 11 && index <= 19) {
      el.classList.add("right-col");
    } else if (index >= 21 && index <= 29) {
      el.classList.add("bottom-row");
    } else if (index >= 31 && index <= 39) {
      el.classList.add("left-col");
    }

    if (typeof window.injectFlagIntoTile === "function") {
      window.injectFlagIntoTile(el);
    }
  });
}

function buildPropertyTile(cityName, tier) {
  const country = getCountryForCity(cityName);
  const tileData = {
    type: "property",
    cityName,
    countryKey: country?.countryKey || null,
    iso: country?.iso || null,
    tier,
    owner: null,
    houses: 0,
    hasHotel: false,
    isMortgaged: false,
  };

  const el = document.createElement("div");
  el.className = `tile tile-property tier-${tier}`;
  el.dataset.city = cityName;
  el.dataset.country = country?.countryKey || "";
  el.dataset.iso = country?.iso || "";
  el.id = `tile-${cityName.replace(/\s+/g, "-").toLowerCase()}`;

  const nameEl = document.createElement("div");
  nameEl.className = "tile-name";
  nameEl.textContent = cityName;
  el.appendChild(nameEl);

  tileData.element = el;
  return tileData;
}

function buildActiveSets(activeTiles) {
  const groups = {};

  activeTiles
    .filter((t) => t.type === "property")
    .forEach((tile) => {
      const c = getCountryForCity(tile.cityName || tile.name);
      if (!c) return;
      if (!groups[c.countryKey]) groups[c.countryKey] = { iso: c.iso, tiles: [] };
      groups[c.countryKey].tiles.push(tile);
    });

  const activeSets = {};
  Object.entries(groups).forEach(([key, g]) => {
    if (g.tiles.length >= 2) activeSets[key] = g;
  });

  return activeSets;
}

function ownsCompleteSet(player, countryKey, activeSets) {
  const set = activeSets[countryKey];
  if (!set) return false;
  return set.tiles.every((t) => t.owner === player.id);
}

function highlightCompletedSet(countryKey, activeSets) {
  activeSets[countryKey]?.tiles.forEach((tile) => {
    tile.element?.classList.add("set-complete");
  });
}

function clearSetHighlight(countryKey, activeSets) {
  activeSets[countryKey]?.tiles.forEach((tile) => {
    tile.element?.classList.remove("set-complete");
  });
}

window.applyPositionClasses = applyPositionClasses;
window.buildPropertyTile = buildPropertyTile;
window.buildActiveSets = buildActiveSets;
window.ownsCompleteSet = ownsCompleteSet;
window.highlightCompletedSet = highlightCompletedSet;
window.clearSetHighlight = clearSetHighlight;

document.addEventListener("DOMContentLoaded", () => {
  applyPositionClasses();
});
