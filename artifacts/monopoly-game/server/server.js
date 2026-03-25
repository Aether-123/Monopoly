/**
 * Monopoly Online — server.js v3.1 (Node.js + Socket.IO)
 */
import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import { randomUUID } from "crypto";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import * as E from "./engine.js";

const START_PORT = parseInt(process.env.GAME_PORT || "8011");
const HOST = (process.env.GAME_HOST || "0.0.0.0").trim() || "0.0.0.0";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GAME_PUBLIC_DIR = join(__dirname, "..", "public", "game");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET","POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.get("/flags/:file", (req, res, next) => {
  const file = String(req.params.file || "");
  res.sendFile(join(GAME_PUBLIC_DIR, "flags", "svg", file), (err) => {
    if (err) next();
  });
});

app.use(express.static(GAME_PUBLIC_DIR));
app.get("/", (_req, res) => {
  res.sendFile(join(GAME_PUBLIC_DIR, "index.html"));
});

// ─── State ────────────────────────────────────────────
/** @type {Map<string, object>} roomId → room */
const rooms = new Map();
/** @type {Map<string, string>} sid → roomId */
const sidRoom = new Map();
/** @type {Map<string, string>} sid → playerId */
const sidPlayer = new Map();
/** @type {Map<string, string>} playerId → sid */
const playerSid = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const reconnectTimers = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const auctionTimers = new Map();

const TOKENS = ["🎩","🚗","🐕","🚢","🛸","🎲","⚓","🏆"];
const COLORS  = ["#e74c3c","#3b82f6","#22c55e","#f97316","#a855f7","#14b8a6","#f59e0b","#ec4899"];
const SEED_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RECONNECT_GRACE = 120;
const VOTEKICK_THRESHOLD = 0.6;
const DOMESTIC_PRESETS = new Set(["india", "uk", "usa"]);

function applyEdgeCountrySetRule(spaces, opts = {}) {
  if (!Array.isArray(spaces) || !spaces.length) return spaces;
  const seedSalt = String(opts?.seedSalt || "");

  const board = spaces.map(sp => ({ ...sp }));
  const props = board.filter(sp => sp?.type === "property");
  if (props.length < 6) return board;
  const total = board.length;
  const C = Math.floor(total / 4);

  function sideOfPos(pos) {
    if (pos > C && pos < 2 * C) return "east";
    if (pos > 2 * C && pos < 3 * C) return "south";
    if (pos > 3 * C && pos < 4 * C) return "west";
    if (pos > 0 && pos < C) return "north";
    return "corner";
  }

  const catalog = new Map(
    E.getCountriesList().map(c => [String(c.code || "").toLowerCase(), c])
  );
  const allCodes = [...catalog.keys()];
  if (!allCodes.length) return board;

  const sidePreferred = {
    north: [],
    east: [],
    south: [],
    west: [],
  };
  props.forEach(sp => {
    const code = String(sp.countryCode || "").toLowerCase();
    const side = sideOfPos(Number(sp.pos));
    if (!code || !sidePreferred[side]) return;
    if (!sidePreferred[side].includes(code)) sidePreferred[side].push(code);
  });

  const propsSorted = props
    .slice()
    .sort((a, b) => Number(a.price || 0) - Number(b.price || 0));

  const eastCandidate = props
    .filter(sp => sideOfPos(Number(sp.pos)) === "east")
    .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))[0] || null;
  const southCandidate = props
    .filter(sp => sideOfPos(Number(sp.pos)) === "south")
    .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))[0] || null;

  const utilityProps = [];
  if (eastCandidate) utilityProps.push(eastCandidate);
  if (southCandidate && southCandidate !== eastCandidate) utilityProps.push(southCandidate);

  if (utilityProps.length < 2) {
    propsSorted.slice().reverse().forEach(sp => {
      if (utilityProps.length >= 2) return;
      if (!utilityProps.includes(sp)) utilityProps.push(sp);
    });
  }

  const utilitySet = new Set(utilityProps);
  const countryProps = propsSorted.filter(sp => !utilitySet.has(sp));
  const sideTierMap = {
    north: new Set([1, 2]),
    east: new Set([2, 3]),
    south: new Set([4, 5]),
    west: new Set([6, 7]),
  };

  const codesByTier = {
    north: allCodes.filter(code => sideTierMap.north.has(Number(catalog.get(code)?.tier || 0))),
    east: allCodes.filter(code => sideTierMap.east.has(Number(catalog.get(code)?.tier || 0))),
    south: allCodes.filter(code => sideTierMap.south.has(Number(catalog.get(code)?.tier || 0))),
    west: allCodes.filter(code => sideTierMap.west.has(Number(catalog.get(code)?.tier || 0))),
  };

  const globalCount = new Map();
  const cursors = new Map();

  const chunkSide = (count) => {
    const chunks = [];
    let n = count;
    while (n > 0) {
      if (n === 1) {
        if (chunks.length && chunks[chunks.length - 1] < 3) chunks[chunks.length - 1] += 1;
        else chunks.push(1);
        break;
      }
      if (n === 2 || n === 3) {
        chunks.push(n);
        break;
      }
      if (n === 4) {
        chunks.push(2, 2);
        break;
      }
      chunks.push(3);
      n -= 3;
    }
    return chunks;
  };

  const pickCodeForChunk = (pool, chunkSize) => {
    const eligibleStrict = pool.filter(code => (globalCount.get(code) || 0) + chunkSize <= 3);
    const eligibleLoose = pool.filter(code => (globalCount.get(code) || 0) < 3);
    const source = eligibleStrict.length ? eligibleStrict : (eligibleLoose.length ? eligibleLoose : allCodes);
    if (!source.length) return allCodes[0];
    source.sort((a, b) => (globalCount.get(a) || 0) - (globalCount.get(b) || 0));
    return source[0];
  };

  const hashStr = (str) => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  const assignedCodeByPos = new Map();
  ["north", "east", "south", "west"].forEach(side => {
    const sideProps = countryProps
      .filter(sp => sideOfPos(Number(sp.pos)) === side)
      .sort((a, b) => Number(a.pos) - Number(b.pos));
    if (!sideProps.length) return;

    const chunks = chunkSide(sideProps.length);
    const tierPool = (codesByTier[side] && codesByTier[side].length) ? [...codesByTier[side]] : [...allCodes];
    const preferred = (sidePreferred[side] || []).filter(code => tierPool.includes(code));
    const remainingPool = tierPool.filter(code => !preferred.includes(code));
    let pool = [...preferred, ...remainingPool];
    if (seedSalt && pool.length > 1) {
      const shift = hashStr(`${seedSalt}|${side}`) % pool.length;
      pool = pool.slice(shift).concat(pool.slice(0, shift));
    }
    const poolOrder = new Map(pool.map((code, idx) => [code, idx]));
    let cursor = 0;
    chunks.forEach(chunkSize => {
      const chosen = (() => {
        const eligibleStrict = pool.filter(code => (globalCount.get(code) || 0) + chunkSize <= 3);
        const eligibleLoose = pool.filter(code => (globalCount.get(code) || 0) < 3);
        const source = eligibleStrict.length ? eligibleStrict : (eligibleLoose.length ? eligibleLoose : allCodes);
        if (!source.length) return allCodes[0];
        source.sort((a, b) => {
          const diff = (globalCount.get(a) || 0) - (globalCount.get(b) || 0);
          if (diff !== 0) return diff;
          return (poolOrder.get(a) || 0) - (poolOrder.get(b) || 0);
        });
        return source[0];
      })();
      for (let i = 0; i < chunkSize && cursor < sideProps.length; i++) {
        const tile = sideProps[cursor++];
        assignedCodeByPos.set(tile.pos, chosen);
        globalCount.set(chosen, (globalCount.get(chosen) || 0) + 1);
      }
    });
  });

  // Fallback assignment if anything was not assigned
  countryProps.forEach(sp => {
    if (assignedCodeByPos.has(sp.pos)) return;
    const side = sideOfPos(Number(sp.pos));
    const pool = (codesByTier[side] && codesByTier[side].length) ? [...codesByTier[side]] : [...allCodes];
    const chosen = pickCodeForChunk(pool, 1);
    assignedCodeByPos.set(sp.pos, chosen);
    globalCount.set(chosen, (globalCount.get(chosen) || 0) + 1);
  });

  // Remove single-country side occurrences (count=1) by merging into another side country
  ["north", "east", "south", "west"].forEach(side => {
    const sideTiles = countryProps
      .filter(sp => sideOfPos(Number(sp.pos)) === side)
      .map(sp => ({ pos: Number(sp.pos), code: assignedCodeByPos.get(Number(sp.pos)) || "" }))
      .filter(x => x.code);
    if (!sideTiles.length) return;

    const counts = new Map();
    sideTiles.forEach(x => counts.set(x.code, (counts.get(x.code) || 0) + 1));

    const singletons = [...counts.entries()].filter(([, cnt]) => cnt === 1).map(([code]) => code);
    singletons.forEach(singleCode => {
      const tile = sideTiles.find(x => x.code === singleCode);
      if (!tile) return;

      const candidates = [...counts.entries()]
        .filter(([code, cnt]) => code !== singleCode && cnt === 2)
        .sort((a, b) => {
          const aCnt = a[1], bCnt = b[1];
          const aScore = aCnt < 3 ? 0 : 1;
          const bScore = bCnt < 3 ? 0 : 1;
          if (aScore !== bScore) return aScore - bScore;
          return bCnt - aCnt;
        });

      if (!candidates.length) return;
      const targetCode = candidates[0][0];
      assignedCodeByPos.set(tile.pos, targetCode);
      counts.set(singleCode, 0);
      counts.set(targetCode, (counts.get(targetCode) || 0) + 1);
    });
  });

  const cityStartByCode = new Map();
  countryProps.forEach((sp) => {
    const code = assignedCodeByPos.get(sp.pos);
    const cMeta = catalog.get(code);
    sp.countryCode = code || "";
    sp.countryName = cMeta?.name || sp.countryName || "";
    sp.countryFlag = cMeta?.flag || sp.countryFlag || "";
    if (Array.isArray(cMeta?.cities) && cMeta.cities.length) {
      if (!cityStartByCode.has(code)) {
        const offset = seedSalt
          ? (hashStr(`${seedSalt}|${code}|cities`) % cMeta.cities.length)
          : 0;
        cityStartByCode.set(code, offset);
      }
      const c = cursors.get(code) || 0;
      const offset = cityStartByCode.get(code) || 0;
      sp.name = cMeta.cities[(offset + c) % cMeta.cities.length] || sp.name;
      cursors.set(code, c + 1);
    }
  });

  // Baseline progression: city values increase as players move from START
  const progressionProps = countryProps.slice().sort((a, b) => Number(a.pos) - Number(b.pos));
  const sortedPrices = progressionProps
    .map(sp => Math.max(20, Number(sp.price || 0)))
    .sort((a, b) => a - b);
  const calcRents = (price) => ([
    Math.max(6, Math.floor(price * 0.08)),
    Math.max(20, Math.floor(price * 0.32)),
    Math.max(50, Math.floor(price * 0.8)),
    Math.max(100, Math.floor(price * 1.8)),
    Math.max(160, Math.floor(price * 2.8)),
    Math.max(220, Math.floor(price * 3.8)),
  ]);
  progressionProps.forEach((sp, idx) => {
    const price = sortedPrices[idx] ?? Number(sp.price || 20);
    sp.price = price;
    sp.rents = calcRents(price);
    sp.houseCost = Math.max(50, Math.floor(price * 0.5));
  });

  const electricTile = utilityProps.find(sp => sideOfPos(Number(sp.pos)) === "east") || utilityProps[0];
  const waterTile = utilityProps.find(sp => sideOfPos(Number(sp.pos)) === "south") || utilityProps.find(sp => sp !== electricTile) || utilityProps[1] || utilityProps[0];

  [
    { sp: electricTile, name: "Electric Company" },
    { sp: waterTile, name: "Water Company" },
  ].forEach(({ sp, name }, idx) => {
    if (!sp) return;
    sp.type = "utility";
    sp.group = "company_set";
    sp.name = name;
    sp.countryCode = "";
    sp.countryName = "";
    sp.countryFlag = "";
    sp.price = 150;
    sp.rents = [0, 0, 0, 0, 0, 0];
    sp.houseCost = 0;
    sp.houses = 0;
    if (sp.owner == null) sp.owner = null;
    if (sp.mortgaged == null) sp.mortgaged = false;
  });

  return board;
}

function applyFortyFourInfrastructureRule(spaces) {
  if (!Array.isArray(spaces) || spaces.length !== 44) return spaces;
  const board = spaces.map(sp => ({ ...sp }));
  const props = board.filter(sp => sp?.type === "property");
  if (props.length < 2) return board;

  const C = Math.floor(board.length / 4);
  function sideOfPos(pos) {
    if (pos > C && pos < 2 * C) return "east";
    if (pos > 2 * C && pos < 3 * C) return "south";
    if (pos > 3 * C && pos < 4 * C) return "west";
    if (pos > 0 && pos < C) return "north";
    return "corner";
  }

  const used = new Set();
  const pickInRange = (side, minPos, maxPos) => {
    const tile = props
      .filter(sp => {
        const pos = Number(sp.pos);
        return sideOfPos(pos) === side && pos >= minPos && pos <= maxPos && !used.has(sp.pos);
      })
      .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))[0] || null;
    if (tile) used.add(tile.pos);
    return tile;
  };
  const pickOnSide = (side) => {
    const tile = props
      .filter(sp => sideOfPos(Number(sp.pos)) === side && !used.has(sp.pos))
      .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))[0] || null;
    if (tile) used.add(tile.pos);
    return tile;
  };
  const pickAny = () => {
    const tile = props
      .filter(sp => !used.has(sp.pos))
      .sort((a, b) => Number(b.price || 0) - Number(a.price || 0))[0] || null;
    if (tile) used.add(tile.pos);
    return tile;
  };
  const isAdjacent = (pos1, pos2) => {
    const p1 = Number(pos1);
    const p2 = Number(pos2);
    return Math.abs(p1 - p2) === 1 || (p1 === 0 && p2 === 43) || (p1 === 43 && p2 === 0);
  };

  const sideStarts = {
    north: 1,
    east: C + 1,
    south: 2 * C + 1,
    west: 3 * C + 1,
  };
  const midOffset = Math.floor((C - 1) / 2);
  const airportPositions = [
    sideStarts.north + midOffset,
    sideStarts.east + midOffset,
    sideStarts.south + midOffset,
    sideStarts.west + midOffset,
  ];

  const toAirportAtPos = (pos, name) => {
    if (pos <= 0 || pos >= board.length || pos % C === 0) return;
    const sp = board[pos] || { pos };
    board[pos] = {
      ...sp,
      pos,
      type: "airport",
      group: "airport_set",
      name,
      countryCode: "",
      countryName: "",
      countryFlag: "",
      stateName: undefined,
      price: 200,
      rents: [0, 0, 0, 0, 0, 0],
      houseCost: 0,
      houses: 0,
      owner: null,
      mortgaged: false,
    };
  };

  toAirportAtPos(airportPositions[0], "North Airport");
  toAirportAtPos(airportPositions[1], "East Airport");
  toAirportAtPos(airportPositions[2], "South Airport");
  toAirportAtPos(airportPositions[3], "West Airport");

  const westAirportPos = airportPositions[3];
  const westAirportTile = board[westAirportPos];
  if (westAirportTile?.type === "airport") {
    const westProps = board
      .filter(sp => sp?.type === "property" && sideOfPos(Number(sp.pos)) === "west")
      .sort((a, b) => Number(a.pos) - Number(b.pos));

    const nearestBelow = westProps.find(sp => Number(sp.pos) > westAirportPos) || null;
    const nearestAbove = westProps.slice().reverse().find(sp => Number(sp.pos) < westAirportPos) || null;

    if (nearestBelow && nearestAbove) {
      const belowCode = String(nearestBelow.countryCode || "").toLowerCase();
      const aboveCode = String(nearestAbove.countryCode || "").toLowerCase();

      const belowCountryTiles = westProps
        .filter(sp => Number(sp.pos) > westAirportPos && String(sp.countryCode || "").toLowerCase() === belowCode)
        .sort((a, b) => Number(a.pos) - Number(b.pos));
      const sourceCityTile = belowCountryTiles[0] || nearestBelow;

      const aboveCountryTiles = westProps
        .filter(sp => Number(sp.pos) < westAirportPos && String(sp.countryCode || "").toLowerCase() === aboveCode)
        .sort((a, b) => Number(a.pos) - Number(b.pos));
      const firstTileOfCountryAbove = aboveCountryTiles[0] || nearestAbove;

      if (sourceCityTile && firstTileOfCountryAbove) {
        board[westAirportPos] = {
          ...sourceCityTile,
          pos: westAirportPos,
          type: "property",
          owner: null,
          mortgaged: false,
          houses: 0,
        };

        toAirportAtPos(Number(firstTileOfCountryAbove.pos), "West Airport");
      }
    }
  }

  return board;
}

function applyFortyFourWestTaxFallback(spaces, opts = {}) {
  if (!Array.isArray(spaces) || spaces.length !== 44) return spaces;
  const board = spaces.map(sp => ({ ...sp }));
  const seedSalt = String(opts?.seedSalt || "");
  const C = Math.floor(board.length / 4);

  const sideOfPos = (pos) => {
    if (pos > C && pos < 2 * C) return "east";
    if (pos > 2 * C && pos < 3 * C) return "south";
    if (pos > 3 * C && pos < 4 * C) return "west";
    if (pos > 0 && pos < C) return "north";
    return "corner";
  };

  const westProps = board
    .filter(sp => sp?.type === "property" && sideOfPos(Number(sp.pos)) === "west")
    .sort((a, b) => Number(a.pos) - Number(b.pos));
  if (!westProps.length) return board;

  const runs = [];
  let i = 0;
  while (i < westProps.length) {
    const start = i;
    const code = String(westProps[i].countryCode || "").toLowerCase();
    let end = i;
    while (
      end + 1 < westProps.length &&
      String(westProps[end + 1].countryCode || "").toLowerCase() === code &&
      Number(westProps[end + 1].pos) === Number(westProps[end].pos) + 1
    ) {
      end += 1;
    }
    runs.push({ start, end, len: end - start + 1, code });
    i = end + 1;
  }

  const longest = runs.sort((a, b) => b.len - a.len)[0];
  if (!longest || longest.len <= 3) return board;

  const hashStr = (str) => {
    let h = 2166136261 >>> 0;
    for (let idx = 0; idx < str.length; idx++) {
      h ^= str.charCodeAt(idx);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  const runTiles = westProps.slice(longest.start, longest.end + 1);
  const pickIndex = seedSalt
    ? hashStr(`${seedSalt}|west-tax-fallback|${longest.code}|${longest.len}`) % runTiles.length
    : Math.floor(runTiles.length / 2);
  const chosen = runTiles[pickIndex] || runTiles[Math.floor(runTiles.length / 2)];
  if (!chosen) return board;

  const pos = Number(chosen.pos);
  board[pos] = {
    pos,
    type: "tax_return",
    name: "$ Tax Refund",
  };

  return board;
}

function applyFortyFourToFortyTwoWestTrim(spaces) {
  if (!Array.isArray(spaces) || spaces.length !== 44) return spaces;
  const board = spaces.map(sp => ({ ...sp }));
  const westAirportPos = board.findIndex(
    (sp) =>
      sp?.type === "airport" &&
      (
        String(sp?.label || "").toLowerCase() === "west" ||
        String(sp?.name || "").toLowerCase().includes("west airport")
      ),
  );
  if (westAirportPos < 0) return board;

  const removeSet = new Set([westAirportPos + 1, westAirportPos + 2]);
  const trimmed = board.filter((_, idx) => !removeSet.has(idx));
  if (trimmed.length !== 42) return board;

  return trimmed.map((sp, idx) => ({ ...(sp || {}), pos: idx }));
}

function swapSouthLuxuryTaxWithAdjacentCity(spaces) {
  if (!Array.isArray(spaces) || spaces.length < 24) return spaces;
  const board = spaces.map(sp => ({ ...sp }));
  const C = Math.floor(board.length / 4);

  const goPos = board.findIndex(sp => sp?.type === "go");
  const jailPos = board.findIndex(sp => sp?.type === "jail");
  const freePos = board.findIndex(sp => sp?.type === "free_parking");
  const goToJailPos = board.findIndex(sp => sp?.type === "go_to_jail");
  const hasCorners = goPos >= 0 && jailPos > goPos && freePos > jailPos && goToJailPos > freePos;

  const sideOfPos = (pos) => {
    if (hasCorners) {
      if (pos > goPos && pos < jailPos) return "north";
      if (pos > jailPos && pos < freePos) return "east";
      if (pos > freePos && pos < goToJailPos) return "south";
      if (pos > goToJailPos || pos < goPos) return "west";
      return "corner";
    }
    if (pos > C && pos < 2 * C) return "east";
    if (pos > 2 * C && pos < 3 * C) return "south";
    if (pos > 3 * C && pos < 4 * C) return "west";
    if (pos > 0 && pos < C) return "north";
    return "corner";
  };

  const luxuryPos = board.findIndex(
    (sp, idx) => sp?.type === "luxury_tax" && sideOfPos(idx) === "south",
  );
  if (luxuryPos < 0) return board;

  const candidatePositions = [luxuryPos - 1, luxuryPos + 1];
  const adjacentCityPos = candidatePositions.find(
    (pos) =>
      pos >= 0 &&
      pos < board.length &&
      sideOfPos(pos) === "south" &&
      board[pos]?.type === "property",
  );
  if (adjacentCityPos == null) return board;

  const luxuryTile = board[luxuryPos];
  const cityTile = board[adjacentCityPos];

  board[luxuryPos] = {
    ...cityTile,
    pos: luxuryPos,
  };
  board[adjacentCityPos] = {
    ...luxuryTile,
    pos: adjacentCityPos,
  };

  return board;
}

function enforceSingleTaxReturnTile(spaces) {
  if (!Array.isArray(spaces) || !spaces.length) return spaces;
  const board = spaces.map(sp => ({ ...sp }));
  const taxTiles = board
    .filter(sp => sp?.type === "tax_return")
    .map(sp => ({ pos: Number(sp.pos), tile: sp }))
    .filter(item => Number.isFinite(item.pos));
  if (taxTiles.length <= 1) return board;

  const C = Math.floor(board.length / 4);
  const sideOfPos = (pos) => {
    if (pos > C && pos < 2 * C) return "east";
    if (pos > 2 * C && pos < 3 * C) return "south";
    if (pos > 3 * C && pos < 4 * C) return "west";
    if (pos > 0 && pos < C) return "north";
    return "corner";
  };

  let keepPos = taxTiles[0].pos;
  if (board.length === 42 || board.length === 44) {
    const westTax = taxTiles.find(item => sideOfPos(item.pos) === "west");
    if (westTax) keepPos = westTax.pos;
  }

  taxTiles.forEach(({ pos }) => {
    if (pos === keepPos) return;
    board[pos] = {
      pos,
      type: "chance",
      name: "❓ Surprise",
    };
  });

  return board;
}

function enforceEastTaxGovPattern(spaces) {
  if (!Array.isArray(spaces) || !spaces.length) return spaces;
  const board = spaces.map(sp => ({ ...sp }));
  const total = board.length;
  const C = Math.floor(total / 4);
  const S = C - 1;
  if (C < 2 || S < 4) return board;

  const scaffold = E.generateDefaultBoard(S);
  for (let i = 0; i < board.length; i++) {
    if (board[i]?.type !== "luxury_tax") continue;
    const fallback = scaffold[i];
    if (fallback?.type === "property") {
      board[i] = { ...fallback, pos: i };
      continue;
    }
    board[i] = {
      pos: i,
      type: "property",
      group: "g0",
      name: `City ${i}`,
      countryCode: "",
      countryFlag: "",
      countryName: "",
      price: 120,
      rents: [12, 36, 72, 144, 220, 320],
      houseCost: 60,
      houses: 0,
      owner: null,
      mortgaged: false,
    };
  }

  const eastStart = C + 1;
  const eastEnd = (2 * C) - 1;
  const eastSlots = Array.from({ length: S }, (_, i) => eastStart + i);

  const preferredIdx = Math.max(0, Math.min(S - 4, Math.floor((2 * S) / 5)));
  const eastTaxPos = eastSlots.find(
    (pos) => board[pos]?.type === "tax_return" && (pos + 3) <= eastEnd,
  );
  const eastTaxIdx = eastTaxPos != null ? (eastTaxPos - eastStart) : -1;

  const scanOrder = [];
  if (eastTaxIdx >= 0) scanOrder.push(eastTaxIdx);
  if (!scanOrder.includes(preferredIdx)) scanOrder.push(preferredIdx);
  for (let i = 0; i <= S - 4; i++) {
    if (!scanOrder.includes(i)) scanOrder.push(i);
  }

  const isCityGapCandidate = (idx) => {
    const taxPos = eastStart + idx;
    const cityOne = board[taxPos + 1];
    const cityTwo = board[taxPos + 3];
    return cityOne?.type === "property" && cityTwo?.type === "property";
  };

  let chosenIdx = scanOrder.find((idx) => isCityGapCandidate(idx));
  if (chosenIdx == null) chosenIdx = scanOrder[0] ?? 0;

  const taxPos = eastStart + chosenIdx;
  const govPos = taxPos + 2;
  if (taxPos < eastStart || govPos > eastEnd) return board;

  board[taxPos] = { pos: taxPos, type: "tax_return", name: "$ Tax Refund" };
  board[govPos] = { pos: govPos, type: "gov_prot", name: "🏛️ Government Protection" };

  return board;
}

function buildWorldwideBoard(wwCities, size, seedSalt = "") {
  const board = E.generateDefaultBoard(size);
  const pools = (Array.isArray(wwCities) ? wwCities : []).map(c => ({
    code: String(c.code || "").toLowerCase(),
    name: c.name || "",
    flag: c.flag || "",
    base: Number(c.base || 60),
    cities: Array.isArray(c.cities) ? c.cities.slice() : [],
  })).filter(c => c.code && c.cities.length);
  if (!pools.length) {
    return enforceEastTaxGovPattern(E.enforceBoardLayoutConstraints(board, size));
  }

  const propByGroup = {};
  for (const sp of board) {
    if (sp.type === "property") {
      const grp = sp.group || "g0";
      if (!propByGroup[grp]) propByGroup[grp] = [];
      propByGroup[grp].push(sp);
    }
  }

  const cityCursorByCode = {};
  for (let gi = 0; gi < 8; gi++) {
    const grp = `g${gi}`;
    const propsInGrp = propByGroup[grp] || [];
    const pool = pools[gi % pools.length];
    for (let ci = 0; ci < propsInGrp.length; ci++) {
      const sp = propsInGrp[ci];
      const cityIdx = cityCursorByCode[pool.code] || 0;
      const city = pool.cities[cityIdx % pool.cities.length] || sp.name;
      const price = pool.base + (ci * 10);
      sp.name = city;
      sp.countryCode = pool.code;
      sp.countryFlag = pool.flag;
      sp.countryName = pool.name;
      sp.price = price;
      sp.rents = [
        Math.max(6, Math.floor(price * 0.08)),
        Math.max(20, Math.floor(price * 0.32)),
        Math.max(50, Math.floor(price * 0.8)),
        Math.max(100, Math.floor(price * 1.8)),
        Math.max(160, Math.floor(price * 2.8)),
        Math.max(220, Math.floor(price * 3.8)),
      ];
      sp.houseCost = Math.max(50, Math.floor(price * 0.5));
      cityCursorByCode[pool.code] = cityIdx + 1;
    }
  }

  let out = E.enforceBoardLayoutConstraints(board, size);
  out = applyEdgeCountrySetRule(out, { seedSalt });
  out = applyFortyFourInfrastructureRule(out);
  out = applyFortyFourWestTaxFallback(out, { seedSalt });
  out = applyFortyFourToFortyTwoWestTrim(out);
  out = enforceSingleTaxReturnTile(out);
  out = enforceEastTaxGovPattern(out);
  return out;
}

function normalizeMapConfig(mapCfg) {
  const cfg = { ...(mapCfg || {}) };
  const size = Math.max(6, Math.min(parseInt(cfg.tilesPerSide || "9"), 9));
  const preset = String(cfg.preset || "").toLowerCase();
  const skipEdgeRule = DOMESTIC_PRESETS.has(preset);
  const shouldApplyEdgeRule = !skipEdgeRule && preset !== "worldwide";
  cfg.tilesPerSide = size;
  if (Array.isArray(cfg.spaces) && cfg.spaces.length) {
    cfg.spaces = E.enforceBoardLayoutConstraints(cfg.spaces, size);
    // Apply normalization rules to custom editor boards too
    if (shouldApplyEdgeRule) {
      cfg.spaces = applyEdgeCountrySetRule(cfg.spaces, { seedSalt: cfg.seed || "" });
      cfg.spaces = applyFortyFourInfrastructureRule(cfg.spaces);
      cfg.spaces = applyFortyFourWestTaxFallback(cfg.spaces, { seedSalt: cfg.seed || "" });
      cfg.spaces = applyFortyFourToFortyTwoWestTrim(cfg.spaces);
      cfg.spaces = swapSouthLuxuryTaxWithAdjacentCity(cfg.spaces);
      cfg.spaces = enforceSingleTaxReturnTile(cfg.spaces);
    }
    cfg.spaces = enforceEastTaxGovPattern(cfg.spaces);
    return cfg;
  }

  if (cfg.preset === "worldwide" && Array.isArray(cfg.wwCities) && cfg.wwCities.length) {
    cfg.spaces = buildWorldwideBoard(cfg.wwCities, size, cfg.seed || "");
    return cfg;
  }

  if (cfg.preset === "india" || cfg.preset === "uk" || cfg.preset === "usa") {
    cfg.spaces = E.generateDomesticBoard(cfg.preset, size);
    cfg.spaces = E.enforceBoardLayoutConstraints(cfg.spaces, size);
    cfg.spaces = applyEdgeCountrySetRule(cfg.spaces);
    cfg.spaces = applyFortyFourInfrastructureRule(cfg.spaces);
    cfg.spaces = applyFortyFourWestTaxFallback(cfg.spaces);
    cfg.spaces = applyFortyFourToFortyTwoWestTrim(cfg.spaces);
    cfg.spaces = swapSouthLuxuryTaxWithAdjacentCity(cfg.spaces);
    cfg.spaces = enforceSingleTaxReturnTile(cfg.spaces);
    cfg.spaces = enforceEastTaxGovPattern(cfg.spaces);
    return cfg;
  }

  if (cfg.preset === "random" && cfg.seed && cfg.mode) {
    cfg.spaces = E.enforceBoardLayoutConstraints(E.generateRandomBoard(String(cfg.seed), String(cfg.mode), size), size);
    if (shouldApplyEdgeRule) {
      cfg.spaces = applyEdgeCountrySetRule(cfg.spaces, { seedSalt: cfg.seed });
      cfg.spaces = applyFortyFourInfrastructureRule(cfg.spaces);
      cfg.spaces = applyFortyFourWestTaxFallback(cfg.spaces, { seedSalt: cfg.seed });
      cfg.spaces = applyFortyFourToFortyTwoWestTrim(cfg.spaces);
      cfg.spaces = swapSouthLuxuryTaxWithAdjacentCity(cfg.spaces);
      cfg.spaces = enforceSingleTaxReturnTile(cfg.spaces);
    }
    cfg.spaces = enforceEastTaxGovPattern(cfg.spaces);
    return cfg;
  }

  cfg.spaces = E.enforceBoardLayoutConstraints(E.generateDefaultBoard(size), size);
  if (shouldApplyEdgeRule) {
    cfg.spaces = applyEdgeCountrySetRule(cfg.spaces);
    cfg.spaces = applyFortyFourInfrastructureRule(cfg.spaces);
    cfg.spaces = applyFortyFourWestTaxFallback(cfg.spaces);
    cfg.spaces = applyFortyFourToFortyTwoWestTrim(cfg.spaces);
    cfg.spaces = swapSouthLuxuryTaxWithAdjacentCity(cfg.spaces);
    cfg.spaces = enforceSingleTaxReturnTile(cfg.spaces);
  }
  cfg.spaces = enforceEastTaxGovPattern(cfg.spaces);
  return cfg;
}

function makeRoomId() {
  return Array.from({length:6}, () => SEED_CHARS[Math.floor(Math.random() * SEED_CHARS.length)]).join("");
}

function sanitize(s, n = 200) {
  if (typeof s !== "string") return "";
  return s.replace(/[<>&"']/g,"").trim().slice(0, n);
}

function mkLobbyPlayer(sid, name, idx, isHost, avatar = null) {
  return {
    id: sid, sid, isHost,
    name: sanitize(name) || `Player ${idx+1}`,
    token: TOKENS[idx % 8], color: COLORS[idx % 8],
    avatar: avatar || {skinTone:"#F5CBA7",hairStyle:"short",hairColor:"#3B2314",beardStyle:"none",eyeStyle:"normal"},
    disconnected: false, reconnectDeadline: null, isSpectator: false,
  };
}

function lobbyPayload(room) {
  return {
    roomId: room.id, players: room.players,
    spectators: room.spectators || [],
    settings: room.settings, mapConfig: room.mapConfig,
    boardChangeRequests: room.boardChangeRequests || [],
    phase: room.phase,
  };
}

function roomOf(sid) {
  const rid = sidRoom.get(sid);
  return rid ? rooms.get(rid) : null;
}

function pid(sid) { return sidPlayer.get(sid) || sid; }

function findGp(gs, playerId) {
  return gs.players.find(p => p.id === playerId) || null;
}

function activeCount(room) {
  const gs = room.gameState;
  if (!gs) return room.players.filter(p => !p.isSpectator && !p.disconnected).length;
  return gs.players.filter(p => !p.bankrupted && !p.isSpectator && !p.disconnected).length;
}

// ─── Reconnect timer ──────────────────────────────────
function startReconnect(rid, playerId) {
  const old = reconnectTimers.get(playerId);
  if (old) clearTimeout(old);
  reconnectTimers.set(playerId, setTimeout(() => {
    reconnectTimers.delete(playerId);
    const room = rooms.get(rid); if (!room) return;
    const gs = room.gameState;
    if (gs) {
      const gp = findGp(gs, playerId);
      if (gp && gp.disconnected) {
        gp.isSpectator = true; gp.disconnected = false;
        if (!room.spectators) room.spectators = [];
        room.spectators.push({id:playerId,name:gp.name,reason:"timeout"});
        gs.log.push(`⏱️ ${gp.name} timed out → spectator.`);
        const cur = gs.players[gs.currentPlayerIdx || 0];
        if (cur.id === playerId) E.nextTurn(gs);
        io.to(rid).emit("state_update", {gameState:gs});
        io.to(rid).emit("player_timeout", {playerId,name:gp.name});
      }
    } else {
      room.players = room.players.filter(p => p.id !== playerId);
      if (!room.players.length) { rooms.delete(rid); return; }
      if (room.hostId === playerId) {
        room.hostId = room.players[0].id; room.players[0].isHost = true;
      }
      io.to(rid).emit("lobby_update", lobbyPayload(room));
    }
  }, RECONNECT_GRACE * 1000));
}

function cancelReconnect(playerId) {
  const t = reconnectTimers.get(playerId);
  if (t) { clearTimeout(t); reconnectTimers.delete(playerId); }
}

// ─── Auction timer ────────────────────────────────────
function resetAuctionTimer(rid, pos) {
  const old = auctionTimers.get(rid);
  if (old) clearTimeout(old);
  auctionTimers.set(rid, setTimeout(() => {
    auctionTimers.delete(rid);
    const room = rooms.get(rid); if (!room || room.phase !== "playing") return;
    const gs = room.gameState; if (!gs || gs.phase !== "auction") return;
    const auc = gs.auction; if (!auc || !auc.active || auc.pos !== pos) return;
    E.doAuctionEnd(gs);
    io.to(rid).emit("state_update", {gameState:gs});
    io.to(rid).emit("auction_ended", {pos});
    if (gs.winner) { room.phase = "ended"; io.to(rid).emit("game_over", {winnerId:gs.winner}); }
  }, 10000));
}

function cancelAuctionTimer(rid) {
  const t = auctionTimers.get(rid);
  if (t) { clearTimeout(t); auctionTimers.delete(rid); }
}

// ─── Online count ──────────────────────────────────────
function broadcastCount() {
  io.emit("online_count", {count: io.engine.clientsCount});
}

// ─── Socket.IO events ─────────────────────────────────
io.on("connection", (socket) => {
  broadcastCount();

  socket.on("disconnect", () => {
    const room = roomOf(socket.id);
    sidRoom.delete(socket.id);
    const playerId = sidPlayer.get(socket.id);
    sidPlayer.delete(socket.id);
    if (playerId) playerSid.delete(playerId);

    if (!room) { broadcastCount(); return; }
    const rid = room.id;

    if (room.phase === "lobby") {
      room.players = room.players.filter(p => p.sid !== socket.id);
      if (!room.players.length) { rooms.delete(rid); broadcastCount(); return; }
      if (room.hostId === (playerId || socket.id)) {
        room.hostId = room.players[0].id; room.players[0].isHost = true;
      }
      io.to(rid).emit("lobby_update", lobbyPayload(room));
    } else {
      const gs = room.gameState;
      const player_id = playerId || socket.id;
      if (gs) {
        const gp = findGp(gs, player_id);
        if (gp && !gp.bankrupted && !gp.isSpectator) {
          gp.disconnected = true; gp.reconnectDeadline = Date.now()/1000 + RECONNECT_GRACE;
          gs.log.push(`📴 ${gp.name} disconnected — ${RECONNECT_GRACE}s grace.`);
          startReconnect(rid, player_id);
          const cur = gs.players[gs.currentPlayerIdx || 0];
          if (cur.id === player_id && ["roll","action","buy"].includes(gs.phase)) E.nextTurn(gs);
          io.to(rid).emit("state_update", {gameState:gs});
          io.to(rid).emit("player_disconnected", {
            playerId:player_id, name:gp.name,
            graceSecs:RECONNECT_GRACE, deadline:gp.reconnectDeadline,
          });
        }
      }
    }
    broadcastCount();
  });

  socket.on("reconnect_player", (data) => {
    data = data || {};
    const rid  = sanitize(data.roomId || "", 6).toUpperCase();
    const pid2  = sanitize(data.playerId || "", 64);
    const room = rooms.get(rid); if (!room) return;

    const oldSid = playerSid.get(pid2);
    if (oldSid && oldSid !== socket.id) {
      sidRoom.delete(oldSid); sidPlayer.delete(oldSid);
    }
    sidRoom.set(socket.id, rid); sidPlayer.set(socket.id, pid2); playerSid.set(pid2, socket.id);
    socket.join(rid); cancelReconnect(pid2);

    const gs = room.gameState;
    if (gs) {
      const gp = findGp(gs, pid2);
      if (gp) {
        gp.disconnected = false; gp.reconnectDeadline = null; gp.sid = socket.id;
        gs.log.push(`✅ ${gp.name} reconnected!`);
        socket.emit("game_started", {gameState:gs});
        io.to(rid).emit("state_update", {gameState:gs});
        io.to(rid).emit("player_reconnected", {playerId:pid2,name:gp.name});
      }
    } else {
      socket.emit("lobby_update", lobbyPayload(room));
    }

    const p = room.players.find(q => q.id === pid2);
    if (p) p.sid = socket.id;
    socket.emit("reconnect_ok", {roomId:rid, player:p||{id:pid2}});
  });

  socket.on("create_room", async (data) => {
    data = data || {};
    const name   = sanitize(data.playerName || "", 20) || "Player 1";
    const mapCfg = normalizeMapConfig(data.mapConfig || {});
    const isPublic = data.isPublic !== false;
    const avatar = data.avatar || null;
    const rid = makeRoomId();
    const settings = E.defaultSettings();
    settings.privateRoom = !isPublic;
    if (mapCfg.settings) Object.assign(settings, mapCfg.settings);
    const player = mkLobbyPlayer(socket.id, name, 0, true, avatar);
    const room = {
      id:rid, hostId:player.id,
      players:[player], spectators:[],
      settings, mapConfig:mapCfg,
      phase:"lobby", gameState:null,
      chatLog:[], createdAt:Date.now()/1000, votes:{}, boardChangeRequests:[],
    };
    rooms.set(rid, room);
    sidRoom.set(socket.id, rid);
    sidPlayer.set(socket.id, player.id);
    playerSid.set(player.id, socket.id);
    socket.join(rid);
    socket.emit("room_created", {roomId:rid, player});
    io.to(rid).emit("lobby_update", lobbyPayload(room));
  });

  socket.on("join_room", async (data) => {
    data = data || {};
    const code  = sanitize(data.roomId || "", 6).toUpperCase();
    const name  = sanitize(data.playerName || "", 20) || "Player";
    const avatar = data.avatar || null;
    const playerIdForReconnect = sanitize(data.playerId || "", 64);
    const room = rooms.get(code);
    if (!room) { socket.emit("join_error", {message:"Room not found."}); return; }
    
    // Check if this is a reconnect attempt during active game within grace period
    if (room.phase !== "lobby" && playerIdForReconnect) {
      const gs = room.gameState;
      if (gs) {
        const gp = findGp(gs, playerIdForReconnect);
        if (gp && gp.disconnected && gp.reconnectDeadline && gp.reconnectDeadline > Date.now()/1000) {
          // This is a valid reconnect; route to reconnect handler
          const oldSid = playerSid.get(playerIdForReconnect);
          if (oldSid && oldSid !== socket.id) {
            sidRoom.delete(oldSid); sidPlayer.delete(oldSid);
          }
          sidRoom.set(socket.id, code); sidPlayer.set(socket.id, playerIdForReconnect); playerSid.set(playerIdForReconnect, socket.id);
          socket.join(code); cancelReconnect(playerIdForReconnect);
          gp.disconnected = false; gp.reconnectDeadline = null; gp.sid = socket.id;
          gs.log.push(`✅ ${gp.name} reconnected!`);
          socket.emit("game_started", {gameState:gs});
          io.to(code).emit("state_update", {gameState:gs});
          io.to(code).emit("player_reconnected", {playerId:playerIdForReconnect,name:gp.name});
          return;
        }
      }
    }
    
    // Not a reconnect or not within grace period; check for new join
    if (room.phase !== "lobby") { addSpectator(socket, room, name, avatar); return; }
    if (room.players.length >= room.settings.maxPlayers) { socket.emit("join_error", {message:"Room is full."}); return; }
    const idx = room.players.length;
    const player = mkLobbyPlayer(socket.id, name, idx, false, avatar);
    room.players.push(player);
    sidRoom.set(socket.id, room.id);
    sidPlayer.set(socket.id, player.id);
    playerSid.set(player.id, socket.id);
    socket.join(room.id);
    socket.emit("room_joined", {roomId:room.id, player});
    io.to(room.id).emit("lobby_update", lobbyPayload(room));
  });

  function addSpectator(sock, room, name, avatar) {
    const spec = {sid:sock.id,id:"spec-"+sock.id.slice(0,8),name,avatar,isSpectator:true,color:"#888"};
    if (!room.spectators) room.spectators = [];
    room.spectators.push(spec);
    sidRoom.set(sock.id, room.id);
    sock.join(room.id);
    sock.emit("spectate_start", {gameState:room.gameState,roomId:room.id,spectatorId:spec.id});
    io.to(room.id).emit("spectator_joined", {name,count:room.spectators.length});
  }

  socket.on("spectate", (data) => {
    data = data || {};
    let room = roomOf(socket.id);
    if (!room) {
      const rid = sanitize(data.roomId || "", 6).toUpperCase();
      room = rooms.get(rid);
    }
    if (!room) return;
    const name = sanitize(data.playerName || "", 20) || "Spectator";
    addSpectator(socket, room, name, data.avatar || null);
  });

  socket.on("quick_match", async (data) => {
    data = data || {};
    const name = sanitize(data.playerName || "", 20) || "Player";
    const avatar = data.avatar || null;
    const avail = [...rooms.values()].find(r =>
      r.phase === "lobby" && !r.settings.privateRoom &&
      r.players.length < r.settings.maxPlayers && r.players.length >= 1
    );
    if (avail) {
      const idx = avail.players.length;
      const player = mkLobbyPlayer(socket.id, name, idx, false, avatar);
      avail.players.push(player);
      sidRoom.set(socket.id, avail.id);
      sidPlayer.set(socket.id, player.id);
      playerSid.set(player.id, socket.id);
      socket.join(avail.id);
      socket.emit("room_joined", {roomId:avail.id, player});
      io.to(avail.id).emit("lobby_update", lobbyPayload(avail));
    } else {
      // Fake the create_room event
      socket.emit("_quick_create", {playerName:name,isPublic:true,avatar});
      socket.once("_quick_create", () => {});
      // Actually just call the logic directly:
      const rid = makeRoomId();
      const settings = E.defaultSettings(); settings.privateRoom = false;
      const player = mkLobbyPlayer(socket.id, name, 0, true, avatar);
      const mapConfig = normalizeMapConfig({});  // Initialize with default board
      const room = {id:rid,hostId:player.id,players:[player],spectators:[],settings,mapConfig,phase:"lobby",gameState:null,chatLog:[],createdAt:Date.now()/1000,votes:{}};
      rooms.set(rid, room);
      sidRoom.set(socket.id, rid); sidPlayer.set(socket.id, player.id); playerSid.set(player.id, socket.id);
      socket.join(rid);
      socket.emit("room_created", {roomId:rid, player});
      io.to(rid).emit("lobby_update", lobbyPayload(room));
    }
  });

  socket.on("update_settings", (data) => {
    const room = roomOf(socket.id);
    if (!room || room.hostId !== pid(socket.id)) return;
    Object.assign(room.settings, (data || {}).settings || {});
    io.to(room.id).emit("lobby_update", lobbyPayload(room));
  });

  socket.on("request_board_change", (data) => {
    const room = roomOf(socket.id);
    if (!room || room.phase !== "lobby") return;
    const actorId = pid(socket.id);
    const actor = room.players.find(p => p.id === actorId);
    const payload = {
      id: randomUUID(),
      byId: actorId,
      byName: actor?.name || "Player",
      kind: sanitize((data || {}).kind || "", 20),
      from: sanitize((data || {}).from || "", 80),
      to: sanitize((data || {}).to || "", 80),
      ts: Date.now(),
    };
    if (!payload.kind || !payload.from || !payload.to) return;
    room.boardChangeRequests = room.boardChangeRequests || [];
    room.boardChangeRequests.unshift(payload);
    room.boardChangeRequests = room.boardChangeRequests.slice(0, 20);
    io.to(room.id).emit("board_change_requested", payload);
    io.to(room.id).emit("lobby_update", lobbyPayload(room));
  });

  socket.on("apply_board_change", (data) => {
    const room = roomOf(socket.id);
    if (!room || room.phase !== "lobby") return;
    if (room.hostId !== pid(socket.id)) return;
    const cfg = normalizeMapConfig(room.mapConfig || {});
    const change = {
      kind: sanitize((data || {}).kind || "", 20),
      from: sanitize((data || {}).from || "", 80),
      to: sanitize((data || {}).to || "", 80),
    };
    if (!change.kind || !change.from || !change.to) return;
    cfg.spaces = E.applyLobbyBoardChange(cfg.spaces || [], change);
    room.mapConfig = cfg;
    room.boardChangeRequests = (room.boardChangeRequests || []).filter(r => r.id !== (data || {}).requestId);
    io.to(room.id).emit("board_changed", { change });
    io.to(room.id).emit("lobby_update", lobbyPayload(room));
  });

  socket.on("start_game", () => {
    const room = roomOf(socket.id);
    if (!room || room.hostId !== pid(socket.id)) return;
    const lobbyActivePlayers = room.players.filter(p => !p.isSpectator && !p.disconnected).length;
    if (lobbyActivePlayers < 2) {
      socket.emit("start_error", { message: "At least 2 players are required to start the game." });
      io.to(room.id).emit("lobby_update", lobbyPayload(room));
      return;
    }
    room.phase = "playing";
    room.gameState = E.initGame(room);
    io.to(room.id).emit("game_started", {gameState:room.gameState});
  });

  socket.on("game_action", (data) => {
    const room = roomOf(socket.id);
    if (!room || room.phase !== "playing" || !room.gameState) return;
    const gs = room.gameState;
    const playerId = pid(socket.id);
    const pi = gs.players.findIndex(p => p.id === playerId);
    if (pi === -1 || gs.players[pi].isSpectator || gs.players[pi].disconnected) return;
    if (gs.currentPlayerIdx !== pi) return;
    data = data || {};
    const action = sanitize(data.action || "", 30);
    room.gameState = E.processAction(gs, pi, action, data.data || {});
    const gs2 = room.gameState;
    io.to(room.id).emit("state_update", {gameState:gs2});
    if (gs2.phase === "auction" && gs2.auction && gs2.auction.active) resetAuctionTimer(room.id, gs2.auction.pos);
    if (gs2.winner) { room.phase = "ended"; cancelAuctionTimer(room.id); io.to(room.id).emit("game_over", {winnerId:gs2.winner}); }
  });

  socket.on("auction_bid", (data) => {
    const room = roomOf(socket.id);
    if (!room || room.phase !== "playing") return;
    const gs = room.gameState;
    if (!gs || gs.phase !== "auction") return;
    const playerId = pid(socket.id);
    const pi = gs.players.findIndex(p => p.id === playerId);
    if (pi === -1 || gs.players[pi].isSpectator) return;
    const prev = gs.auction.currentBid;
    E.doAuctionBid(gs, pi, data || {});
    if (gs.auction && gs.auction.currentBid > prev) resetAuctionTimer(room.id, gs.auction.pos);
    io.to(room.id).emit("state_update", {gameState:gs});
  });

  socket.on("auction_fold", () => {
    const room = roomOf(socket.id);
    if (!room || room.phase !== "playing") return;
    const gs = room.gameState;
    if (!gs || gs.phase !== "auction") return;
    const playerId = pid(socket.id);
    const pi = gs.players.findIndex(p => p.id === playerId);
    if (pi === -1) return;
    E.doAuctionFold(gs, pi);
    if (!gs.auction) cancelAuctionTimer(room.id);
    io.to(room.id).emit("state_update", {gameState:gs});
  });

  socket.on("vote_kick", (data) => {
    const room = roomOf(socket.id);
    if (!room || room.phase !== "playing") return;
    const gs = room.gameState; if (!gs) return;
    data = data || {};
    const voterId = pid(socket.id);
    const targetId = sanitize(data.targetId || "", 64);
    if (!voterId || !targetId || voterId === targetId) return;
    const targetP = findGp(gs, targetId);
    if (!targetP || targetP.bankrupted || targetP.isSpectator) return;
    if (!room.votes) room.votes = {};
    if (!room.votes[targetId]) room.votes[targetId] = new Set();
    room.votes[targetId].add(voterId);
    const voteCount = room.votes[targetId].size;
    const needed = Math.max(2, Math.ceil(activeCount(room) * VOTEKICK_THRESHOLD));
    io.to(room.id).emit("vote_update", {targetId,targetName:targetP.name,votes:voteCount,needed});
    if (voteCount >= needed) {
      targetP.isSpectator = true; targetP.disconnected = false;
      cancelReconnect(targetId);
      delete room.votes[targetId];
      if (!room.spectators) room.spectators = [];
      room.spectators.push({id:targetId,name:targetP.name,reason:"votekick"});
      gs.log.push(`🚫 ${targetP.name} was vote-kicked.`);
      const cur = gs.players[gs.currentPlayerIdx || 0];
      if (cur.id === targetId) E.nextTurn(gs);
      const kickedSid = playerSid.get(targetId);
      if (kickedSid) io.to(kickedSid).emit("you_were_kicked", {roomId:room.id,gameState:gs});
      io.to(room.id).emit("player_kicked", {playerId:targetId,name:targetP.name});
      io.to(room.id).emit("state_update", {gameState:gs});
    }
  });

  socket.on("cancel_vote_kick", (data) => {
    const room = roomOf(socket.id); if (!room) return;
    const voterId = pid(socket.id);
    const targetId = sanitize((data || {}).targetId || "", 64);
    if (voterId && targetId && room.votes && room.votes[targetId]) {
      room.votes[targetId].delete(voterId);
    }
  });

  socket.on("trade_offer", (data) => {
    const room = roomOf(socket.id);
    if (!room || room.phase !== "playing") return;
    data = data || {};
    const playerId = pid(socket.id);
    io.to(room.id).emit("trade_incoming", {
      tradeId:randomUUID(), fromId:playerId,
      toId:data.toPlayerId, offer:data.offer||{},
    });
  });

  socket.on("trade_respond", (data) => {
    const room = roomOf(socket.id); if (!room) return;
    data = data || {};
    const playerId = pid(socket.id);
    if (!data.accepted) { io.to(room.id).emit("trade_declined", {tradeId:data.tradeId}); return; }
    const gs = room.gameState;
    const fid = data.fromId;
    const fi = gs.players.findIndex(p => p.id === fid);
    const ti = gs.players.findIndex(p => p.id === playerId);
    if (fi === -1 || ti === -1) return;
    E.execTrade(gs, fi, ti, data.offer || {});
    io.to(room.id).emit("state_update", {gameState:gs});
    io.to(room.id).emit("trade_accepted", {tradeId:data.tradeId});
  });

  socket.on("trade_negotiate", (data) => {
    const room = roomOf(socket.id); if (!room) return;
    data = data || {};
    const playerId = pid(socket.id);
    io.to(room.id).emit("trade_negotiate", {
      tradeId:data.tradeId, fromId:playerId,
      toId:data.toId, offer:data.offer||{},
      message:sanitize(data.message||"", 200),
    });
  });

  socket.on("chat", (data) => {
    const room = roomOf(socket.id); if (!room) return;
    data = data || {};
    const playerId = pid(socket.id);
    const gs = room.gameState;
    let player = null;
    if (gs) player = findGp(gs, playerId);
    if (!player) player = room.players.find(p => p.sid === socket.id || p.id === playerId);
    if (!player) player = (room.spectators||[]).find(s => s.sid === socket.id);
    if (!player) return;
    const isSpec = player.isSpectator || (player.id||"").startsWith("spec-");
    const msg = {
      name:player.name, color:player.color||"#aaa",
      text:sanitize(data.message||"", 200),
      ts:Date.now(), isSpectator:isSpec,
    };
    room.chatLog.push(msg);
    if (room.chatLog.length > 100) room.chatLog = room.chatLog.slice(-80);
    io.to(room.id).emit("chat_msg", msg);
  });
});

// ─── REST API ─────────────────────────────────────────
app.get("/mapi/rooms", (_req, res) => {
  const pub = [...rooms.values()]
    .filter(r => r.phase === "lobby" && !r.settings.privateRoom)
    .map(r => ({
      id: r.id,
      hostName:   r.players[0]?.name || "?",
      hostToken:  r.players[0]?.token || "🎩",
      boardName:  (r.mapConfig||{}).name || "Standard",
      boardSize:  (r.mapConfig||{}).tilesPerSide || 9,
      playerCount:r.players.length,
      maxPlayers: r.settings.maxPlayers,
      currency:   r.settings.currency,
      createdAt:  r.createdAt,
    }));
  res.json(pub);
});

app.get("/mapi/countries", (_req, res) => res.json(E.getCountriesList()));
app.get("/mapi/domestic-maps", (_req, res) => res.json(E.getDomesticMaps()));

app.use(express.json({ limit: "1mb" }));

app.post("/mapi/worldwide-board", (req, res) => {
  const S = Math.max(6, Math.min(parseInt(req.body?.S || "9"), 9));
  const wwCities = Array.isArray(req.body?.wwCities) ? req.body.wwCities : [];
  const board = buildWorldwideBoard(wwCities, S);
  res.json({ board, tilesPerSide: S });
});

app.get("/mapi/domestic-board", (req, res) => {
  const preset = (req.query.preset || "india").toString();
  const S = Math.max(6, Math.min(parseInt(req.query.S || "9"), 9));
  let board = E.generateDomesticBoard(preset, S);
  board = E.enforceBoardLayoutConstraints(board, S);
  board = applyEdgeCountrySetRule(board);
  board = applyFortyFourInfrastructureRule(board);
  board = applyFortyFourWestTaxFallback(board);
  board = applyFortyFourToFortyTwoWestTrim(board);
  board = swapSouthLuxuryTaxWithAdjacentCity(board);
  board = enforceSingleTaxReturnTile(board);
  board = enforceEastTaxGovPattern(board);
  res.json({preset, board, tilesPerSide: S});
});

app.get("/mapi/random-board", (req, res) => {
  const mode = (req.query.mode || "balanced").toString();
  const S    = Math.max(6, Math.min(parseInt(req.query.S || "9"), 9));
  const seed = (req.query.seed || "").toString().toUpperCase() ||
    Array.from({length:6}, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random()*32)]).join("");
  let board = E.enforceBoardLayoutConstraints(E.generateRandomBoard(seed, mode, S), S);
  board = applyEdgeCountrySetRule(board, { seedSalt: seed });
  board = applyFortyFourInfrastructureRule(board);
  board = applyFortyFourWestTaxFallback(board, { seedSalt: seed });
  board = applyFortyFourToFortyTwoWestTrim(board);
  board = swapSouthLuxuryTaxWithAdjacentCity(board);
  board = enforceSingleTaxReturnTile(board);
  board = enforceEastTaxGovPattern(board);
  res.json({seed, board, tilesPerSide: S});
});

app.get("/mapi/default-board", (req, res) => {
  const S = Math.max(6, Math.min(parseInt(req.query.S || "9"), 9));
  let board = E.enforceBoardLayoutConstraints(E.generateDefaultBoard(S), S);
  board = applyEdgeCountrySetRule(board);
  board = applyFortyFourInfrastructureRule(board);
  board = applyFortyFourWestTaxFallback(board);
  board = applyFortyFourToFortyTwoWestTrim(board);
  board = swapSouthLuxuryTaxWithAdjacentCity(board);
  board = enforceSingleTaxReturnTile(board);
  board = enforceEastTaxGovPattern(board);
  res.json({board, tilesPerSide: S});
});

app.get("/favicon.ico", (_req, res) => res.status(204).end());

// ─── Cleanup old rooms (every hour) ──────────────────
setInterval(() => {
  const cutoff = Date.now()/1000 - 14400;
  for (const [rid, room] of rooms) {
    if (room.createdAt < cutoff) rooms.delete(rid);
  }
}, 3_600_000);

// ─── Start ────────────────────────────────────────────
let currentPort = START_PORT;
let retryCount = 0;
const MAX_PORT_RETRIES = 20;

function startServer() {
  httpServer.listen(currentPort, HOST, () => {
    console.log(`🎲  Monopsony :- A Monopoly Alternative v3.1  →  http://${HOST}:${currentPort}`);
  });
}

httpServer.on("error", (err) => {
  if (err?.code === "EADDRINUSE" && retryCount < MAX_PORT_RETRIES) {
    retryCount += 1;
    currentPort += 1;
    console.log(`⚠️ Port in use. Retrying on ${currentPort}...`);
    setTimeout(startServer, 100);
    return;
  }
  throw err;
});

startServer();
