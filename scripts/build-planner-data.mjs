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

const nameCorrections = {
  prog_ancil_doctrine: ["Вспомогательная доктрина", "Ancillary Doctrine"],
  "squad_tanith_lasgun(ig)": ["(1) Пехотный отряд Танита", "(1) Tanith Infantry Squad"],
  "squad_tanith_support(ig)": ["(1) Отряд поддержки Танита", "(1) Tanith Support Squad"],
  "squad_tanith_scout(ig)": ["(1) Разведывательный отряд Танита", "(1) Tanith Scout Squad"],
  "squad_storm_mech(ig)": ["(1) Механизированный отряд штурмовиков", "(1) Mechanized Storm Trooper Squad"],
  "squad_dk_gorgon(ig)": ["(1) Штурмовой взвод «Горгона»", "(1) Gorgon Assault Platoon"],
  prog_daemon_summoning: ["Ритуалы призыва демонов", "Daemonic Summoning Rituals"],
  bp_fueltruck: ["Топливозаправщик Кровавого договора", "Blood Pattern Fuel Truck"],
  bp_stand_missilelauncher: ["Ракетная установка образца «Восс» (ПТУР)", "Voss Pattern (HKM) Missile Launcher"],
  dg_fueltruck: ["Топливозаправщик сил Нургла", "Rot Pattern Fuel Truck"],
  dg_stand_missilelauncher: ["Ракетная установка образца «Восс» (ПТУР)", "Voss Pattern (HKM) Missile Launcher"],
  bp_sentinel_hb: ["«Часовой» (ТБ)", "Sentinel (HB)"],
  bp_sentinel_hb_rl: ["«Часовой» (ТБ/НУРС)", "Sentinel (HB/RL)"],
  dg_salamander_toxflamer: ["«Саламандра» (ТОКС)", "Salamander (TOX)"],
};
const externalRootRequirements = new Set([
  "single_pdf_officer(ig)",
  "single_bp_militia_officer(tg)",
  "single_dg_militia_officer(tg)",
]);

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
    requires: node.requires.filter(
      (requirement) => !externalRootRequirements.has(requirement),
    ),
    cost: node.cost,
    x: node.x,
    y: node.y,
    section: node.section,
    sectionRu: node.sectionRu,
    sectionEn: node.sectionEn,
    nameRu: nameCorrections[node.id]?.[0] || node.nameRu,
    nameEn: nameCorrections[node.id]?.[1] || node.nameEn,
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
