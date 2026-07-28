#!/usr/bin/env node

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
} from "node:path";
import vm from "node:vm";

const repoRoot = resolve(import.meta.dirname, "..");
const plannerDataPath = resolve(
  process.argv[2] || join(repoRoot, "assets", "planner-data.js"),
);
const gamelogicRoot = resolve(
  process.argv[3] || join(repoRoot, "..", "gamelogic-full"),
);
const entityRoot = resolve(
  process.argv[4] || join(repoRoot, "..", "entity-defs", "entity"),
);
const englishLocalizationRoot = resolve(
  process.argv[5] || join(repoRoot, "..", "localization-default", "default"),
);
const russianLocalizationRoot = resolve(
  process.argv[6] || join(repoRoot, "..", "localization-ru", "ru"),
);
const outputPath = join(repoRoot, "assets", "weapon-ranges.js");
const auditPath = join(repoRoot, "assets", "weapon-ranges-audit.json");

const lower = (value) => String(value || "").toLocaleLowerCase("en");
const normalizeId = (value) =>
  lower(value)
    .replaceAll("\\", "/")
    .replace(/\s+/g, " ")
    .trim();
const canonicalAmmo = (value) =>
  normalizeId(value)
    .replace(/^ammo\s+/, "")
    .replace(/\s+ammo(?:\s+|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function walkFiles(root) {
  const result = [];
  const visit = (current) => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      const stats = statSync(path);
      if (stats.isDirectory()) visit(path);
      else result.push(path);
    }
  };
  visit(root);
  return result;
}

function blockAt(text, index, open = "{", close = "}") {
  if (text[index] !== open) return "";
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') {
      quoted = true;
      continue;
    }
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return text.slice(index, cursor + 1);
    }
  }
  return "";
}

function parenthesizedBlockAt(text, index) {
  return blockAt(text, index, "(", ")");
}

function firstNamedBlock(text, name) {
  const expression = new RegExp(`\\{${name}\\b`, "i");
  const match = expression.exec(text);
  return match ? blockAt(text, match.index) : "";
}

function removeNamedBlocks(text, name) {
  const expression = new RegExp(`\\{${name}\\b`, "gi");
  let output = "";
  let cursor = 0;
  for (const match of text.matchAll(expression)) {
    if (match.index < cursor) continue;
    const block = blockAt(text, match.index);
    if (!block) continue;
    output += text.slice(cursor, match.index);
    cursor = match.index + block.length;
  }
  return output + text.slice(cursor);
}

function stripComments(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/;.*$/, ""))
    .join("\n");
}

function parsePlannerData(path) {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(path, "utf8"), context);
  const data = context.window.INDOMITUS_PLANNER_DATA;
  if (!data?.nodes?.length) {
    throw new Error(`Planner data was not found in ${path}`);
  }
  return data;
}

function unquotePo(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value.replace(/^"|"$/g, "");
  }
}

function stripGameMarkup(value) {
  return String(value || "")
    .replace(/<c\([^)]*\)>/gi, "")
    .replace(/<\/c>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePoDirectory(root, valueField) {
  const values = new Map();
  const files = walkFiles(root).filter((path) => /\.(?:po|pot)$/i.test(path));

  for (const path of files) {
    const text = readFileSync(path, "utf8");
    const entries = text.split(/\n\s*\n/);
    for (const entry of entries) {
      const contextMatch = entry.match(/^msgctxt\s+(".*")$/m);
      if (!contextMatch) continue;
      const valueMatch = entry.match(
        new RegExp(`^${valueField}\\s+(".*")$`, "m"),
      );
      const fallbackMatch = entry.match(/^msgid\s+(".*")$/m);
      const raw = valueMatch ? unquotePo(valueMatch[1]) : "";
      const fallback = fallbackMatch ? unquotePo(fallbackMatch[1]) : "";
      const value = stripGameMarkup(raw || fallback);
      if (value) values.set(lower(unquotePo(contextMatch[1])), value);
    }
  }

  return values;
}

function localizedValue(localizations, type, id, fallback) {
  const normalized = normalizeId(id).replace(/^(?:weapon|ammo)\s+/, "");
  const candidates = [
    `desc/${type}/${normalized}`,
    `desc/stuff/${normalized}`,
    `desc/weapon/${normalized}`,
    `desc/ammo/${normalized}`,
  ];
  for (const candidate of candidates) {
    const value = localizations.get(candidate);
    if (value) return value;
  }
  return fallback || id;
}

function parseInventoryItems(text) {
  return [...text.matchAll(/\{item\s+"([^"]+)"/gi)].map(
    (match) => match[1],
  );
}

function parseBreedWeapons(root) {
  const result = new Map();
  const breedFiles = walkFiles(root).filter(
    (path) =>
      path.includes(`${join("set", "breed", "mp")}`) &&
      path.includes(`${join("warhammer")}`) &&
      /\.set$/i.test(path),
  );
  for (const path of breedFiles) {
    const text = stripComments(readFileSync(path, "utf8"));
    const inventory = firstNamedBlock(text, "inventory");
    if (!inventory) continue;
    const weaponMatch = inventory.match(
      /\{item\s+"([^"]+)"\s+(?:filled|filling\b)/i,
    );
    if (!weaponMatch) continue;
    const id = lower(basename(path, extname(path)));
    result.set(id, {
      weaponId: weaponMatch[1],
      inventoryItems: parseInventoryItems(text),
      sourcePath: path,
      sourceType: "breed",
    });
  }
  return result;
}

function definitionRank(path, faction) {
  const normalized = lower(path);
  let rank = 0;
  if (normalized.includes("/[40k]vehicle/")) rank += 20;
  if (faction === "ig" && normalized.includes("/imperial_guard/")) rank += 10;
  if (faction === "tg" && normalized.includes("/traitor_guard/")) rank += 10;
  if (normalized.includes("/construction/")) rank -= 5;
  return rank;
}

function parseVehicleDefinitions(root) {
  const result = new Map();
  for (const path of walkFiles(root).filter((item) => /\.def$/i.test(item))) {
    const id = lower(basename(path, extname(path)));
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(path);
  }
  return result;
}

function parseVehicleWeapon(path) {
  const text = stripComments(readFileSync(path, "utf8"));
  const weaponry = firstNamedBlock(text, "weaponry");
  if (!weaponry) return null;

  const places = [];
  for (const match of weaponry.matchAll(/\{place\s+"([^"]+)"/gi)) {
    const block = blockAt(weaponry, match.index);
    const weapon = block.match(/\{weapon\s+"([^"]+)"/i);
    if (!weapon) continue;
    places.push({
      place: lower(match[1]),
      weaponId: weapon[1],
      initialAmmo:
        block.match(
          /\{weapon\s+"[^"]+"\s+filling\s+"([^"]+)"/i,
        )?.[1] || null,
    });
  }

  const usable = places.filter(
    (item) => !["commander_vision", "commander"].includes(lower(item.weaponId)),
  );
  let main =
    usable.find((item) => item.place === "gun") ||
    usable.find((item) => item.place === "main") ||
    usable.find((item) => item.place === "gun1") ||
    usable[0];
  if (!main) {
    const mount = text.match(/\{weapon\s+"([^"]+)"\s+\{mask\s+"mountable"/i);
    if (mount) {
      const user = text.match(
        new RegExp(
          `\\{item\\s+"([^"]+)"\\s+filling\\s+"([^"]+)"[^}]*\\{user\\s+"${mount[1]}"`,
          "i",
        ),
      );
      if (user) {
        main = {
          place: lower(mount[1]),
          weaponId: user[1],
          initialAmmo: user[2],
        };
      }
    }
  }
  if (!main) return null;
  return {
    ...main,
    inventoryItems: parseInventoryItems(text),
    sourcePath: path,
    sourceType: "vehicle",
  };
}

function createMacroRangeIndex(stuffRoot) {
  const macros = new Map();
  for (const path of walkFiles(stuffRoot).filter(
    (item) => basename(item) === ".presets",
  )) {
    const text = stripComments(readFileSync(path, "utf8"));
    for (const match of text.matchAll(/\(define\s+"([^"]+)"/gi)) {
      const block = parenthesizedBlockAt(text, match.index);
      const range = block.match(/\{range\s+([\d.]+)(?:\s+([\d.]+))?/i);
      if (range) macros.set(lower(match[1]), Number(range[2] || range[1]));
    }
  }
  return macros;
}

function createConfigIndex(stuffRoot) {
  const configs = new Map();
  const patterns = new Map();
  for (const path of walkFiles(stuffRoot)) {
    const name = basename(path);
    if (name === ".presets") continue;
    const extension = extname(name);
    const stem = lower(extension ? basename(name, extension) : name);
    if (extension === ".ammo") continue;
    const target = extension === ".pattern" ? patterns : configs;
    if (!target.has(stem)) target.set(stem, path);
  }
  return { configs, patterns };
}

function findWeaponConfig(index, weaponId) {
  const normalized = normalizeId(weaponId).replace(/^weapon\s+/, "");
  const candidates = [
    normalized,
    normalized.replace(/\s+/g, "_"),
    normalized.replace(/^ammo\s+/, ""),
  ];
  for (const candidate of candidates) {
    const path = index.configs.get(candidate);
    if (path) return path;
  }
  return null;
}

function parseRangeData(path, configIndex, macroRanges) {
  const text = stripComments(readFileSync(path, "utf8"));
  const specific = {};
  const family = {};

  for (const match of text.matchAll(
    /\("penetration_(?:long|medium|short)"\s+shell\(([^)]+)\)\s+range\(([\d.]+)\)/gi,
  )) {
    specific[lower(match[1])] = Number(match[2]);
  }

  for (const match of text.matchAll(
    /range_(ap|he|heat)\(([\d.]+)\)/gi,
  )) {
    family[lower(match[1])] = Number(match[2]);
  }

  for (const match of text.matchAll(/\{parameters\s+"([^"]+)"/gi)) {
    const block = blockAt(text, match.index);
    const range = block.match(/\{range\s+([\d.]+)(?:\s+([\d.]+))?/i);
    if (range) specific[lower(match[1])] = Number(range[2] || range[1]);
  }

  const withoutParameters = removeNamedBlocks(text, "parameters");
  const directRanges = [...withoutParameters.matchAll(
    /\{range\s+([\d.]+)(?:\s+([\d.]+))?/gi,
  )].map((match) => Number(match[2] || match[1]));
  for (const match of withoutParameters.matchAll(
    /\{(?:aimRange|maxRange)\s+([\d.]+)/gi,
  )) {
    directRanges.push(Number(match[1]));
  }
  const directRange = directRanges.length
    ? Math.max(...directRanges)
    : undefined;

  const macroCalls = [...text.matchAll(/\("([^"]+)"/g)]
    .map((match) => lower(match[1]))
    .filter((name) => macroRanges.has(name));
  const preferredMacro =
    macroCalls.find((name) => name.startsWith("range_")) ||
    macroCalls.find((name) => /(?:lasgun|plasma|rifle|autogun|bolter)/.test(name));
  const macroRange = preferredMacro
    ? macroRanges.get(preferredMacro)
    : undefined;

  const patternRanges = [];
  const visitedPatterns = new Set();
  const collectPatternRanges = (patternName) => {
    const normalized = lower(patternName);
    if (!normalized || visitedPatterns.has(normalized)) return;
    visitedPatterns.add(normalized);
    const patternPath = configIndex.patterns.get(normalized);
    if (!patternPath) return;
    const patternText = stripComments(readFileSync(patternPath, "utf8"));
    for (const match of patternText.matchAll(
      /\{range\s+([\d.]+)(?:\s+([\d.]+))?/gi,
    )) {
      patternRanges.push(Number(match[2] || match[1]));
    }
    const parent =
      patternText.match(/\{from\s+"pattern\s+([^"]+)"/i)?.[1] ||
      patternText.match(/\{from\s+"([^"]+)\s+pattern"/i)?.[1];
    if (parent) collectPatternRanges(parent);
  };
  const patternName =
    text.match(/\{from\s+"pattern\s+([^"]+)"/i)?.[1] ||
    text.match(/\{from\s+"([^"]+)\s+pattern"/i)?.[1];
  if (patternName) collectPatternRanges(patternName);

  const knownRanges = [
    directRange,
    macroRange,
    ...patternRanges,
    ...Object.values(specific),
    ...Object.values(family),
  ].filter(Number.isFinite);
  const range = knownRanges.length ? Math.max(...knownRanges) : null;
  const filling = text.match(/\{filling\s+"([^"]+)"/i)?.[1] || null;
  const normalizedPath = lower(path);
  const calibre = Number(text.match(/\{calibre\s+([\d.]+)/i)?.[1] || 0);
  const gunLike =
    normalizedPath.includes(`${join("stuff", "gun")}`) ||
    normalizedPath.includes(`${join("stuff", "mortar")}`) ||
    normalizedPath.includes(`${join("stuff", "reactive")}`) ||
    normalizedPath.includes(`${join("stuff", "bazooka")}`) ||
    calibre >= 20;

  return {
    range,
    specific,
    family,
    filling,
    gunLike,
    sourcePath: path,
  };
}

function ammoType(ammoId) {
  const normalized = canonicalAmmo(ammoId);
  const tokens = normalized.split(" ");
  return lower(tokens.at(-1));
}

function ammoFamily(type) {
  if (/^ap|^hvap|^krak/.test(type)) return "ap";
  if (/^heat|^heata|^heatb|^heatc/.test(type)) return "heat";
  if (/^he|^sm$|^wp$|^ic$|^gas$|^inferno$/.test(type)) return "he";
  return null;
}

function rangeForAmmo(rangeData, type) {
  return (
    rangeData.specific[type] ??
    rangeData.family[ammoFamily(type)] ??
    rangeData.range
  );
}

function selectAmmoIds(source, rangeData) {
  const candidates = [...source.inventoryItems];
  if (source.initialAmmo) candidates.unshift(source.initialAmmo);
  if (!rangeData.filling) {
    return source.initialAmmo ? [source.initialAmmo] : [];
  }

  const filling = canonicalAmmo(rangeData.filling);
  const matches = candidates.filter((item) => {
    const candidate = canonicalAmmo(item);
    return candidate === filling || candidate.startsWith(`${filling} `);
  });
  if (!matches.length && source.initialAmmo) matches.push(source.initialAmmo);
  return [
    ...new Map(
      matches.map((item) => [canonicalAmmo(item), canonicalAmmo(item)]),
    ).values(),
  ];
}

const plannerData = parsePlannerData(plannerDataPath);
const english = parsePoDirectory(englishLocalizationRoot, "msgid");
const russian = parsePoDirectory(russianLocalizationRoot, "msgstr");
const breedWeapons = parseBreedWeapons(gamelogicRoot);
const vehicleDefinitions = parseVehicleDefinitions(entityRoot);
const stuffRoot = join(gamelogicRoot, "set", "stuff");
const configIndex = createConfigIndex(stuffRoot);
const macroRanges = createMacroRangeIndex(stuffRoot);
const rangeCache = new Map();
const units = {};
const missing = [];
const uniqueItems = new Map();

for (const node of plannerData.nodes) {
  for (const item of node.composition.items) {
    uniqueItems.set(`${node.faction}:${lower(item.id)}`, {
      faction: node.faction,
      ...item,
    });
  }
}

for (const [key, item] of uniqueItems) {
  let source = breedWeapons.get(lower(item.id));

  if (!source) {
    const candidates = vehicleDefinitions.get(lower(item.id)) || [];
    const path = [...candidates].sort(
      (left, right) =>
        definitionRank(right, item.faction) -
        definitionRank(left, item.faction),
    )[0];
    if (path) source = parseVehicleWeapon(path);
  }

  if (!source) {
    missing.push({
      key,
      itemId: item.id,
      kind: item.kind,
      reason: "no-primary-weapon",
    });
    continue;
  }

  const configPath = findWeaponConfig(configIndex, source.weaponId);
  if (!configPath) {
    missing.push({
      key,
      itemId: item.id,
      kind: item.kind,
      weaponId: source.weaponId,
      sourcePath: source.sourcePath,
      reason: "weapon-config-not-found",
    });
    continue;
  }

  if (!rangeCache.has(configPath)) {
    rangeCache.set(
      configPath,
      parseRangeData(configPath, configIndex, macroRanges),
    );
  }
  const rangeData = rangeCache.get(configPath);
  if (!Number.isFinite(rangeData.range)) {
    missing.push({
      key,
      itemId: item.id,
      kind: item.kind,
      weaponId: source.weaponId,
      sourcePath: source.sourcePath,
      configPath,
      reason: "range-not-found",
    });
  }

  const weaponId = normalizeId(source.weaponId);
  const ammunition = selectAmmoIds(source, rangeData).map((id) => {
    const type = ammoType(id);
    return {
      id,
      type: type.toUpperCase(),
      nameRu: localizedValue(russian, "ammo", id, id),
      nameEn: localizedValue(english, "ammo", id, id),
      range: rangeForAmmo(rangeData, type),
    };
  });

  units[key] = {
    weaponId,
    nameRu: localizedValue(russian, "weapon", weaponId, weaponId),
    nameEn: localizedValue(english, "weapon", weaponId, weaponId),
    range: rangeData.range,
    gunLike: rangeData.gunLike,
    ammunition,
  };
}

const audit = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: "gamelogic.pak + entity.pak + default/ru localization",
    researchNodes: plannerData.nodes.length,
    uniqueCompositionItems: uniqueItems.size,
    itemsWithWeapon: Object.keys(units).length,
    itemsWithWeaponAndRange: Object.values(units).filter((item) =>
      Number.isFinite(item.range),
    ).length,
    itemsWithoutWeaponOrRange: missing.length,
    weaponConfigsUsed: rangeCache.size,
  },
  samples: Object.fromEntries(
    [
      "ig:ig_lasgun",
      "ig:ig_kasrkin_plasmacannon",
      "ig:lr_bc_lc_hb",
      "ig:ig_stand_autocannon",
      "ig:macharius",
    ]
      .filter((key) => units[key])
      .map((key) => [key, units[key]]),
  ),
  missing,
};
const compact = {
  meta: {
    dataVersion: "2026.07.28.2",
    source: audit.meta.source,
    items: Object.keys(units).length,
  },
  units,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `window.INDOMITUS_WEAPON_RANGES=${JSON.stringify(compact)};\n`,
);
writeFileSync(
  auditPath,
  `${JSON.stringify(
    audit,
    (key, value) =>
      key.endsWith("Path") && typeof value === "string"
        ? relative(repoRoot, value).replaceAll("\\", "/")
        : value,
    2,
  )}\n`,
);

console.log(JSON.stringify(audit.meta, null, 2));
console.log(JSON.stringify(audit.samples, null, 2));
console.log(JSON.stringify(missing.slice(0, 30), null, 2));
