#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = resolve(import.meta.dirname, "..");
const archivePath = resolve(
  process.argv[2] || join(repoRoot, "..", "interface.pak"),
);
const appPath = resolve(process.argv[3] || join(repoRoot, "index.html"));
const outputDir = join(repoRoot, "assets", "research-sprites");
const mapPath = join(repoRoot, "assets", "research-images.js");
const spriteColumns = 10;
const spriteCapacity = 100;

const archiveEntries = execFileSync("unzip", ["-Z1", archivePath], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split(/\r?\n/)
  .filter(Boolean);

const squadPortraits = new Map();
for (const entry of archiveEntries) {
  const match = entry.match(
    /^interface\/scene\/portrait_squad\/(.+)_00\.(tga|png|dds)$/i,
  );
  if (!match) continue;
  squadPortraits.set(match[1].toLocaleLowerCase("en"), entry);
}

const manualSources = new Map([
  [
    "prog_ancil_doctrine",
    "interface/scene/portrait/tanith_lasgun.dds",
  ],
  [
    "squad_storm_mech(ig)",
    "interface/scene/portrait_squad/squad_cad_storm_generic(ig)_00.tga",
  ],
  [
    "squad_tanith_lasgun(ig)",
    "interface/scene/portrait/tanith_lasgun.dds",
  ],
  [
    "squad_tanith_support(ig)",
    "interface/scene/portrait/tanith_ac.dds",
  ],
  [
    "squad_tanith_scout(ig)",
    "interface/scene/portrait/tanith_scout.dds",
  ],
  ["taurox", "interface/scene/portrait_squad/dg_taurox_00.png"],
  ["taurox_ac", "interface/scene/portrait_squad/dg_taurox_ac_00.png"],
]);

const appSource = readFileSync(appPath, "utf8");
const researchRows = [
  ...appSource.matchAll(/\{id:`([^`]+)`,faction:`(ig|tg)`/g),
].map((match) => ({ id: match[1], faction: match[2] }));
if (researchRows.length === 0) {
  throw new Error(`No research nodes found in ${appPath}`);
}

const slugFor = (id) =>
  id
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

rmSync(join(repoRoot, "assets", "research"), {
  recursive: true,
  force: true,
});
rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });
const workDir = join(tmpdir(), `indomitus-research-images-${process.pid}`);
mkdirSync(workDir, { recursive: true });

const seenSlugs = new Map();
const convertedKeys = new Set();
const normalizedImages = new Map();
const mapping = {};
const sourceAudit = [];

try {
  for (const { id, faction } of researchRows) {
    const key = id.toLocaleLowerCase("en");
    const entry = manualSources.get(key) || squadPortraits.get(key);
    if (!entry) throw new Error(`No portrait found for research ID: ${id}`);
    if (!archiveEntries.includes(entry)) {
      throw new Error(`Archive entry does not exist for ${id}: ${entry}`);
    }

    const slug = slugFor(id);
    const previous = seenSlugs.get(slug);
    if (previous && previous !== key) {
      throw new Error(`Filename collision: ${previous} and ${key} -> ${slug}`);
    }
    seenSlugs.set(slug, key);

    if (!convertedKeys.has(key)) {
      const extension = basename(entry).split(".").pop().toLocaleLowerCase("en");
      const sourcePath = join(workDir, `${slug}.${extension}`);
      const normalizedPath = join(workDir, `${slug}.png`);
      const bytes = execFileSync("unzip", ["-p", archivePath, entry], {
        encoding: null,
        maxBuffer: 16 * 1024 * 1024,
      });
      writeFileSync(sourcePath, bytes);
      execFileSync("convert", [
        sourcePath,
        "-strip",
        "-resize",
        "112x140>",
        "-background",
        "none",
        "-gravity",
        "center",
        "-extent",
        "112x140",
        normalizedPath,
      ]);
      convertedKeys.add(key);
      normalizedImages.set(key, normalizedPath);
    }

    sourceAudit.push({
      id,
      faction,
      source: entry,
      mapping: manualSources.has(key) ? "composition-based" : "exact-id",
    });
  }

  const spriteSources = [...normalizedImages.entries()].sort(([a], [b]) =>
    a.localeCompare(b, "en"),
  );
  const spriteFiles = [];

  for (
    let offset = 0, sheetIndex = 0;
    offset < spriteSources.length;
    offset += spriteCapacity, sheetIndex += 1
  ) {
    const sheetSources = spriteSources.slice(offset, offset + spriteCapacity);
    const spriteRows = Math.ceil(sheetSources.length / spriteColumns);
    const spriteName = `research-${sheetIndex}.webp`;
    const spritePath = join(outputDir, spriteName);

    execFileSync("montage", [
      ...sheetSources.map(([, sourcePath]) => sourcePath),
      "-background",
      "none",
      "-tile",
      `${spriteColumns}x${spriteRows}`,
      "-geometry",
      "112x140+0+0",
      "-quality",
      "82",
      spritePath,
    ]);

    spriteFiles.push(`assets/research-sprites/${spriteName}`);
    sheetSources.forEach(([key], position) => {
      mapping[key] = [
        sheetIndex,
        position % spriteColumns,
        Math.floor(position / spriteColumns),
        spriteColumns,
        spriteRows,
      ];
    });
  }

  mkdirSync(dirname(mapPath), { recursive: true });
  writeFileSync(
    mapPath,
    `window.INDOMITUS_RESEARCH_SPRITES=${JSON.stringify(spriteFiles)};\nwindow.INDOMITUS_RESEARCH_IMAGES=${JSON.stringify(mapping)};\n`,
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

writeFileSync(
  join(repoRoot, "assets", "research-images-audit.json"),
  `${JSON.stringify(sourceAudit, null, 2)}\n`,
);

console.log(
  `Prepared ${sourceAudit.length} research cards with ${convertedKeys.size} unique images in ${Math.ceil(convertedKeys.size / spriteCapacity)} sprite sheets`,
);
