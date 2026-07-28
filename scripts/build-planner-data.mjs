#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(
  process.argv[2] ||
    join(
      repoRoot,
      "..",
      "github-pages-dist",
      "assets",
      "research-data-CReEOmsX.js",
    ),
);
const outputPath = join(repoRoot, "assets", "planner-data.js");
const sourceModule = await import(
  `${pathToFileURL(sourcePath).href}?build=${Date.now()}`
);
const source = sourceModule.t;

if (!source?.nodes?.length) {
  throw new Error(`Research data was not found in ${sourcePath}`);
}

const plannerData = {
  dataVersion: "2026.07.28.1",
  modVersion: "1.063",
  steamUrl:
    "https://steamcommunity.com/sharedfiles/filedetails/?id=3494196322",
  generatedFrom: source.meta.generatedFrom,
  nodes: source.nodes.map((node) => ({
    id: node.id,
    faction: node.faction,
    tech: node.tech,
    requires: node.requires,
    cost: node.cost,
    x: node.x,
    y: node.y,
    section: node.section,
    sectionRu: node.sectionRu,
    sectionEn: node.sectionEn,
    nameRu: node.nameRu,
    nameEn: node.nameEn,
    composition: {
      vehicles: node.composition.vehicles,
      infantry: node.composition.infantry,
      crew: node.composition.crew,
      gunCrew: node.composition.gunCrew,
      totalEntities: node.composition.totalEntities,
      items: node.composition.items.map((item) => ({
        kind: item.kind,
        id: item.id,
        count: item.count,
        nameRu: item.nameRu,
        nameEn: item.nameEn,
      })),
    },
  })),
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `window.INDOMITUS_PLANNER_DATA=${JSON.stringify(plannerData)};\n`,
);

console.log(
  `Prepared planning data for ${plannerData.nodes.length} research nodes`,
);
