#!/usr/bin/env node

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
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
  process.argv[4] || join(repoRoot, "..", "entity-full", "entity"),
);
const outputRoot = resolve(
  process.argv[5] || join(repoRoot, "assets", "models"),
);
const manifestPath = join(repoRoot, "assets", "unit-models.js");
const auditPath = join(repoRoot, "assets", "unit-models-audit.json");

const lower = (value) => String(value || "").toLocaleLowerCase("en");
const slash = (value) => String(value || "").replaceAll("\\", "/");

function walkFiles(root) {
  const result = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else result.push(path);
    }
  };
  visit(root);
  return result;
}

function indexByBasename(files) {
  const result = new Map();
  for (const path of files) {
    const key = lower(basename(path, extname(path)));
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(path);
  }
  return result;
}

function parsePlannerData(path) {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(path, "utf8"), context);
  const data = context.window.INDOMITUS_PLANNER_DATA;
  if (!data?.nodes?.length) throw new Error(`Planner data missing: ${path}`);
  return data;
}

function pathRank(path, faction, kind) {
  const normalized = lower(slash(path));
  let rank = 0;
  if (normalized.includes("/[40k]vehicle/")) rank += kind === "vehicle" ? 50 : 5;
  if (normalized.includes("/humanskin/")) rank += kind === "skin" ? 50 : 0;
  if (faction === "ig" && normalized.includes("/imperial_guard/")) rank += 20;
  if (
    faction === "tg" &&
    (normalized.includes("/traitor_guard/") || normalized.includes("/chaos/"))
  ) {
    rank += 20;
  }
  if (normalized.includes("/construction/")) rank -= 10;
  if (normalized.includes("/x/") || normalized.includes("_x/")) rank -= 30;
  if (normalized.includes("/xx/") || normalized.includes("_xx/")) rank -= 50;
  return rank;
}

function choosePath(paths, faction, kind, nearPath = null) {
  if (!paths?.length) return null;
  return [...paths].sort((left, right) => {
    let leftRank = pathRank(left, faction, kind);
    let rightRank = pathRank(right, faction, kind);
    if (nearPath) {
      leftRank -= relative(dirname(nearPath), left).split(/[\\/]/).length;
      rightRank -= relative(dirname(nearPath), right).split(/[\\/]/).length;
    }
    return rightRank - leftRank || left.localeCompare(right);
  })[0];
}

function extensionFromDefinition(path) {
  if (!path) return null;
  const text = readFileSync(path, "utf8");
  return text.match(/\{\s*extension\s+"([^"]+\.mdl)"/i)?.[1] || null;
}

function resolveExtension(definitionPath, extension, mdlIndex, faction, kind) {
  if (!extension) return null;
  const localPath = resolve(dirname(definitionPath), slash(extension));
  try {
    if (statSync(localPath).isFile()) return localPath;
  } catch {
    // Some definitions point to a model in another entity directory.
  }
  return choosePath(
    mdlIndex.get(lower(basename(extension, extname(extension)))),
    faction,
    kind,
    definitionPath,
  );
}

function resolveUnitModel({ faction, id }, indices) {
  const key = lower(id);
  const { defIndex, mdlIndex, breedIndex } = indices;

  const unitDefinition = choosePath(defIndex.get(key), faction, "vehicle");
  if (unitDefinition) {
    const extension = extensionFromDefinition(unitDefinition);
    const modelPath = resolveExtension(
      unitDefinition,
      extension,
      mdlIndex,
      faction,
      "vehicle",
    );
    if (modelPath) {
      return { modelPath, sourcePath: unitDefinition, kind: "vehicle" };
    }
  }

  const breedPath = choosePath(
    (breedIndex.get(key) || []).filter((path) =>
      lower(slash(path)).includes("/set/breed/mp/"),
    ),
    faction,
    "skin",
  );
  if (breedPath) {
    const text = readFileSync(breedPath, "utf8");
    const skinId = text.match(/\{\s*skin\s+"([^"]+)"/i)?.[1];
    if (skinId) {
      let modelPath = choosePath(mdlIndex.get(lower(skinId)), faction, "skin");
      if (!modelPath) {
        const skinDefinition = choosePath(
          defIndex.get(lower(skinId)),
          faction,
          "skin",
        );
        modelPath = resolveExtension(
          skinDefinition,
          extensionFromDefinition(skinDefinition),
          mdlIndex,
          faction,
          "skin",
        );
      }
      if (modelPath) {
        return {
          modelPath,
          sourcePath: breedPath,
          kind: "infantry",
          skinId,
        };
      }
    }
  }

  const fallback = choosePath(mdlIndex.get(key), faction, "vehicle");
  return fallback
    ? { modelPath: fallback, sourcePath: null, kind: "fallback" }
    : null;
}

function tokenizeMdl(text) {
  const tokens = [];
  let cursor = 0;
  while (cursor < text.length) {
    const character = text[cursor];
    if (/\s/.test(character)) {
      cursor += 1;
      continue;
    }
    if (character === ";") {
      while (cursor < text.length && text[cursor] !== "\n") cursor += 1;
      continue;
    }
    if (character === "{" || character === "}") {
      tokens.push(character);
      cursor += 1;
      continue;
    }
    if (character === '"') {
      let value = "";
      cursor += 1;
      while (cursor < text.length) {
        if (text[cursor] === '"') {
          cursor += 1;
          break;
        }
        if (text[cursor] === "\\" && cursor + 1 < text.length) {
          value += text[cursor + 1];
          cursor += 2;
        } else {
          value += text[cursor];
          cursor += 1;
        }
      }
      tokens.push(value);
      continue;
    }
    let end = cursor + 1;
    while (end < text.length && !/[\s{}]/.test(text[end])) end += 1;
    tokens.push(text.slice(cursor, end));
    cursor = end;
  }
  return tokens;
}

function parseMdl(text) {
  const tokens = tokenizeMdl(text);
  let cursor = 0;

  function parseBlock() {
    if (tokens[cursor] !== "{") return null;
    cursor += 1;
    const type = tokens[cursor++] || "";
    const args = [];
    const children = [];
    while (cursor < tokens.length && tokens[cursor] !== "}") {
      if (tokens[cursor] === "{") children.push(parseBlock());
      else args.push(tokens[cursor++]);
    }
    if (tokens[cursor] === "}") cursor += 1;
    return { type, args, children: children.filter(Boolean) };
  }

  const blocks = [];
  while (cursor < tokens.length) {
    if (tokens[cursor] === "{") blocks.push(parseBlock());
    else cursor += 1;
  }
  return blocks;
}

function gltfMatrix(matrix) {
  return [
    matrix[0], matrix[3], matrix[6], 0,
    matrix[1], matrix[4], matrix[7], 0,
    matrix[2], matrix[5], matrix[8], 0,
    matrix[9], matrix[10], matrix[11], 1,
  ];
}

function meshReferenceForBone(block, modelDirectory) {
  const direct = block.children.find(
    (child) => lower(child.type) === "volumeview",
  );
  if (direct?.args[0]) {
    const path = resolve(modelDirectory, slash(direct.args[0]));
    try {
      if (statSync(path).size > 0) return path;
    } catch {
      return null;
    }
  }

  const lod = block.children.find((child) => lower(child.type) === "lodview");
  if (!lod) return null;
  const candidates = lod.children
    .filter((child) => lower(child.type) === "volumeview" && child.args[0])
    .map((child) => resolve(modelDirectory, slash(child.args[0])));
  // The inspector renders models in a compact viewport, so prefer the lowest
  // available authored LOD. This is the main model-size optimization.
  for (const path of candidates.reverse()) {
    try {
      if (statSync(path).size > 0) return path;
    } catch {
      // Try the next authored LOD.
    }
  }
  return null;
}

function collectModelParts(modelPath) {
  const blocks = parseMdl(readFileSync(modelPath, "utf8"));
  const modelDirectory = dirname(modelPath);
  const parts = [];
  const sourceToGltf = [1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0];

  function visit(block) {
    const isBone = lower(block.type) === "bone";
    if (isBone) {
      const meshPath = meshReferenceForBone(block, modelDirectory);
      if (meshPath) {
        parts.push({
          name: block.args.at(-1) || basename(meshPath, extname(meshPath)),
          meshPath,
          // GEM PLY vertices are already stored in the common bind coordinate
          // system. Keep that stable neutral pose for a compact static GLB;
          // MDL matrices drive runtime animation and must not be applied again.
          matrix: sourceToGltf,
        });
      }
    }
    for (const child of block.children) visit(child);
  }

  for (const block of blocks) visit(block);
  return parts;
}

function readMaterialName(buffer, offset) {
  if (offset >= buffer.length) return null;
  const length = buffer[offset];
  if (length < 1 || length > 180 || offset + 1 + length > buffer.length) {
    return null;
  }
  const value = buffer.toString("utf8", offset + 1, offset + 1 + length);
  if (!/^[\x20-\x7e]+$/.test(value) || !/\.mtl$/i.test(value)) return null;
  return { value, next: offset + 1 + length };
}

function parsePly(path) {
  const buffer = readFileSync(path);
  if (buffer.length < 48 || buffer.toString("ascii", 0, 8) !== "EPLYBNDS") {
    throw new Error("unsupported PLY signature");
  }
  let cursor = 32;
  const materialGroups = [];
  let positions = null;
  let normals = null;
  let uvs = null;
  let indices = null;
  let vertexCount = 0;

  while (cursor + 4 <= buffer.length) {
    const entry = buffer.toString("ascii", cursor, cursor + 4);
    cursor += 4;
    if (entry === "SKIN") {
      const count = buffer.readUInt32LE(cursor);
      cursor += 4;
      for (let index = 0; index < count; index += 1) {
        const length = buffer[cursor];
        cursor += 1 + length;
      }
    } else if (entry === "MESH") {
      const meshInfo = buffer.readUInt32LE(cursor);
      cursor += 4;
      cursor += 4;
      const triangleCount = buffer.readUInt32LE(cursor);
      cursor += 4;
      const materialInfo = buffer.readUInt32LE(cursor);
      cursor += 4;
      const withoutColor = readMaterialName(buffer, cursor);
      const withColor = readMaterialName(buffer, cursor + 4);
      const material = withoutColor || withColor;
      if (!material) throw new Error(`unsupported MESH header at ${cursor}`);
      cursor = material.next;
      if (meshInfo === 0x1118 || meshInfo === 0x1158) {
        const extraCount = buffer[cursor] || 0;
        cursor += 1 + extraCount;
      }
      materialGroups.push({
        triangleCount,
        materialInfo,
        materialName: material.value,
      });
    } else if (entry === "VERT") {
      vertexCount = buffer.readUInt32LE(cursor);
      cursor += 4;
      const description = buffer.readUInt32LE(cursor);
      cursor += 4;
      const stride = description & 0xff;
      if (stride < 32 || cursor + vertexCount * stride > buffer.length) {
        throw new Error(`unsupported vertex description 0x${description.toString(16)}`);
      }
      const uvOffset =
        description === 0x00070020 || description >= 0x0007002c
          ? 24
          : stride - 8;
      positions = new Float32Array(vertexCount * 3);
      // KHR_mesh_quantization permits compact normalized BYTE normals. Pad
      // each VEC3 to four bytes so every vertex remains 4-byte aligned.
      normals = new Int8Array(vertexCount * 4);
      uvs = new Uint16Array(vertexCount * 2);
      for (let index = 0; index < vertexCount; index += 1) {
        const start = cursor + index * stride;
        for (let axis = 0; axis < 3; axis += 1) {
          const position = buffer.readFloatLE(start + axis * 4);
          positions[index * 3 + axis] = Number.isFinite(position) ? position : 0;
        }
        const sourceNormal = [0, 1, 2].map((axis) => {
          const value = buffer.readFloatLE(start + 12 + axis * 4);
          return Number.isFinite(value) ? value : 0;
        });
        const normalOffset = index * 4;
        const normalLength = Math.hypot(
          sourceNormal[0],
          sourceNormal[1],
          sourceNormal[2],
        );
        if (normalLength > 0.000001) {
          normals[normalOffset] = Math.round((sourceNormal[0] / normalLength) * 127);
          normals[normalOffset + 1] = Math.round((sourceNormal[1] / normalLength) * 127);
          normals[normalOffset + 2] = Math.round((sourceNormal[2] / normalLength) * 127);
        } else {
          normals[normalOffset + 2] = 127;
        }
        const u = buffer.readFloatLE(start + uvOffset);
        const v = buffer.readFloatLE(start + uvOffset + 4);
        uvs[index * 2] = Math.round(
          Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0)) * 65535,
        );
        uvs[index * 2 + 1] = Math.round(
          Math.max(0, Math.min(1, Number.isFinite(v) ? 1 - v : 0)) * 65535,
        );
      }
      cursor += vertexCount * stride;
    } else if (entry === "INDX") {
      const count = buffer.readUInt32LE(cursor);
      cursor += 4;
      if (!positions || count % 3 || cursor + count * 2 > buffer.length) {
        throw new Error("invalid index data");
      }
      indices = new Uint16Array(count);
      let source = cursor;
      let target = 0;
      for (const group of materialGroups) {
        const groupIndices = Math.min(group.triangleCount * 3, count - target);
        for (let index = 0; index < groupIndices; index += 3) {
          const one = buffer.readUInt16LE(source);
          const two = buffer.readUInt16LE(source + 2);
          const three = buffer.readUInt16LE(source + 4);
          source += 6;
          const preserve =
            group.materialInfo === 0x0744 || group.materialInfo === 0x0c54;
          indices[target++] = preserve ? one : three;
          indices[target++] = two;
          indices[target++] = preserve ? three : one;
        }
      }
      while (target < count) {
        indices[target++] = buffer.readUInt16LE(source);
        source += 2;
      }
      break;
    } else {
      throw new Error(`unsupported entry ${JSON.stringify(entry)} at ${cursor - 4}`);
    }
  }
  if (!positions || !normals || !uvs || !indices) {
    throw new Error("incomplete PLY mesh");
  }
  if (!materialGroups.length) {
    materialGroups.push({
      triangleCount: indices.length / 3,
      materialInfo: 0,
      materialName: "default.mtl",
    });
  }
  return { positions, normals, uvs, indices, materialGroups, vertexCount };
}

function materialColor(materialPath) {
  let red = 0.58;
  let green = 0.62;
  let blue = 0.6;
  let alpha = 1;
  let blend = false;
  try {
    const text = readFileSync(materialPath, "utf8");
    const color = text.match(/\{\s*color\s+"?(\d+)\s+(\d+)\s+(\d+)(?:\s+(\d+))?/i);
    if (color) {
      // GEM's color is a multiplier for a diffuse texture. When the matching
      // base-game texture is unavailable, use a darker neutral equivalent so
      // the geometry remains readable under PBR lighting instead of glowing.
      red = (Number(color[1]) / 255) * 0.5;
      green = (Number(color[2]) / 255) * 0.5;
      blue = (Number(color[3]) / 255) * 0.5;
    }
    blend = /\{\s*blend\s+(?:blend|add|alpha)/i.test(text);
    if (blend) alpha = 0.55;
  } catch {
    // Base-game textures and materials are intentionally not fabricated.
  }
  const name = lower(basename(materialPath));
  if (/track|tire|rubber|wheel/.test(name)) {
    red *= 0.3;
    green *= 0.3;
    blue *= 0.3;
  } else if (/glass|visor|eye/.test(name)) {
    red = 0.26;
    green = 0.48;
    blue = 0.56;
    alpha = 0.45;
    blend = true;
  }
  return { color: [red, green, blue, alpha], blend };
}

class GlbBuilder {
  constructor() {
    this.binary = [];
    this.bufferViews = [];
    this.accessors = [];
    this.materials = [];
    this.materialByKey = new Map();
    this.meshes = [];
    this.nodes = [];
    this.meshByPath = new Map();
  }

  appendBuffer(buffer, target = undefined) {
    const padding = (4 - (this.byteLength() % 4)) % 4;
    if (padding) this.binary.push(Buffer.alloc(padding));
    const byteOffset = this.byteLength();
    const value = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.binary.push(value);
    const view = { buffer: 0, byteOffset, byteLength: value.length };
    if (target) view.target = target;
    this.bufferViews.push(view);
    return this.bufferViews.length - 1;
  }

  byteLength() {
    return this.binary.reduce((sum, buffer) => sum + buffer.length, 0);
  }

  accessor(bufferView, options) {
    this.accessors.push({ bufferView, byteOffset: 0, ...options });
    return this.accessors.length - 1;
  }

  material(path) {
    const key = lower(path);
    if (this.materialByKey.has(key)) return this.materialByKey.get(key);
    const { color, blend } = materialColor(path);
    const material = {
      name: basename(path),
      pbrMetallicRoughness: {
        baseColorFactor: color,
        metallicFactor: 0.18,
        roughnessFactor: 0.76,
      },
      doubleSided: true,
    };
    if (blend) {
      material.alphaMode = "BLEND";
      material.pbrMetallicRoughness.metallicFactor = 0.02;
    }
    this.materials.push(material);
    const index = this.materials.length - 1;
    this.materialByKey.set(key, index);
    return index;
  }

  addMesh(path) {
    if (this.meshByPath.has(path)) return this.meshByPath.get(path);
    const data = parsePly(path);
    const positionView = this.appendBuffer(data.positions, 34962);
    const normalView = this.appendBuffer(data.normals, 34962);
    this.bufferViews[normalView].byteStride = 4;
    const uvView = this.appendBuffer(data.uvs, 34962);
    const indexView = this.appendBuffer(data.indices, 34963);
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (let index = 0; index < data.positions.length; index += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], data.positions[index + axis]);
        maximum[axis] = Math.max(maximum[axis], data.positions[index + axis]);
      }
    }
    const positionAccessor = this.accessor(positionView, {
      componentType: 5126,
      count: data.vertexCount,
      type: "VEC3",
      min: minimum,
      max: maximum,
    });
    const normalAccessor = this.accessor(normalView, {
      componentType: 5120,
      normalized: true,
      count: data.vertexCount,
      type: "VEC3",
    });
    const uvAccessor = this.accessor(uvView, {
      componentType: 5123,
      normalized: true,
      count: data.vertexCount,
      type: "VEC2",
    });

    let indexOffset = 0;
    const primitives = [];
    for (const group of data.materialGroups) {
      const count = Math.min(group.triangleCount * 3, data.indices.length - indexOffset);
      if (count <= 0) continue;
      const indexAccessor = this.accessor(indexView, {
        byteOffset: indexOffset * 2,
        componentType: 5123,
        count,
        type: "SCALAR",
      });
      primitives.push({
        attributes: {
          POSITION: positionAccessor,
          NORMAL: normalAccessor,
          TEXCOORD_0: uvAccessor,
        },
        indices: indexAccessor,
        material: this.material(resolve(dirname(path), group.materialName)),
        mode: 4,
      });
      indexOffset += count;
    }
    if (!primitives.length) throw new Error("PLY has no drawable primitives");
    this.meshes.push({ name: basename(path), primitives });
    const meshIndex = this.meshes.length - 1;
    this.meshByPath.set(path, meshIndex);
    return meshIndex;
  }

  addPart(part) {
    const mesh = this.addMesh(part.meshPath);
    this.nodes.push({ name: part.name, mesh, matrix: gltfMatrix(part.matrix) });
  }

  build(modelName) {
    const binary = Buffer.concat(this.binary);
    const document = {
      asset: {
        version: "2.0",
        generator: "Indomitus GEM-to-GLB converter",
      },
      extensionsUsed: ["KHR_mesh_quantization"],
      extensionsRequired: ["KHR_mesh_quantization"],
      scene: 0,
      scenes: [{ name: modelName, nodes: this.nodes.map((_, index) => index) }],
      nodes: this.nodes,
      meshes: this.meshes,
      materials: this.materials,
      accessors: this.accessors,
      bufferViews: this.bufferViews,
      buffers: [{ byteLength: binary.length }],
    };
    let json = Buffer.from(JSON.stringify(document));
    const jsonPadding = (4 - (json.length % 4)) % 4;
    if (jsonPadding) json = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
    const binaryPadding = (4 - (binary.length % 4)) % 4;
    const paddedBinary = binaryPadding
      ? Buffer.concat([binary, Buffer.alloc(binaryPadding)])
      : binary;
    const totalLength = 12 + 8 + json.length + 8 + paddedBinary.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(totalLength, 8);
    const jsonHeader = Buffer.alloc(8);
    jsonHeader.writeUInt32LE(json.length, 0);
    jsonHeader.writeUInt32LE(0x4e4f534a, 4);
    const binaryHeader = Buffer.alloc(8);
    binaryHeader.writeUInt32LE(paddedBinary.length, 0);
    binaryHeader.writeUInt32LE(0x004e4942, 4);
    return Buffer.concat([
      header,
      jsonHeader,
      json,
      binaryHeader,
      paddedBinary,
    ]);
  }
}

function hashPath(value) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function modelFilename(modelPath) {
  const stem = lower(basename(modelPath, extname(modelPath)))
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unit";
  const key = slash(relative(entityRoot, modelPath));
  return `${stem}-${hashPath(key)}.glb`;
}

const plannerData = parsePlannerData(plannerDataPath);
const entityFiles = walkFiles(entityRoot);
const gamelogicFiles = walkFiles(gamelogicRoot);
const indices = {
  defIndex: indexByBasename(
    entityFiles.filter((path) => lower(extname(path)) === ".def"),
  ),
  mdlIndex: indexByBasename(
    entityFiles.filter((path) => lower(extname(path)) === ".mdl"),
  ),
  breedIndex: indexByBasename(
    gamelogicFiles.filter((path) => lower(extname(path)) === ".set"),
  ),
};

const compositionItems = new Map();
for (const node of plannerData.nodes) {
  for (const item of node.composition.items) {
    const key = `${node.faction}:${lower(item.id)}`;
    if (!compositionItems.has(key)) {
      compositionItems.set(key, { faction: node.faction, id: item.id });
    }
  }
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const resolvedUnits = new Map();
const models = new Map();
const missing = [];
for (const [key, unit] of compositionItems) {
  const resolvedModel = resolveUnitModel(unit, indices);
  if (!resolvedModel) {
    missing.push({ key, itemId: unit.id, reason: "model-not-found" });
    continue;
  }
  resolvedUnits.set(key, resolvedModel);
  if (!models.has(resolvedModel.modelPath)) {
    models.set(resolvedModel.modelPath, {
      ...resolvedModel,
      filename: modelFilename(resolvedModel.modelPath),
      units: [],
    });
  }
  models.get(resolvedModel.modelPath).units.push(key);
}

const converted = new Map();
const failedModels = [];
let totalBytes = 0;
let totalParts = 0;
let totalMeshes = 0;
for (const [modelPath, model] of models) {
  try {
    const parts = collectModelParts(modelPath);
    if (!parts.length) throw new Error("MDL contains no model parts");
    const builder = new GlbBuilder();
    const partErrors = [];
    for (const part of parts) {
      try {
        builder.addPart(part);
      } catch (error) {
        partErrors.push({
          mesh: slash(relative(entityRoot, part.meshPath)),
          error: error.message,
        });
      }
    }
    if (!builder.nodes.length) {
      throw new Error(`no supported model parts (${partErrors[0]?.error || "unknown"})`);
    }
    const glb = builder.build(basename(modelPath, extname(modelPath)));
    writeFileSync(join(outputRoot, model.filename), glb);
    totalBytes += glb.length;
    totalParts += builder.nodes.length;
    totalMeshes += builder.meshes.length;
    converted.set(modelPath, {
      ...model,
      bytes: glb.length,
      parts: builder.nodes.length,
      skippedParts: partErrors,
    });
  } catch (error) {
    failedModels.push({
      model: slash(relative(entityRoot, modelPath)),
      error: error.message,
      units: model.units,
    });
  }
}

const units = {};
for (const [key, resolvedModel] of resolvedUnits) {
  const model = converted.get(resolvedModel.modelPath);
  if (!model) continue;
  units[key] = {
    src: `./assets/models/${model.filename}`,
    kind: resolvedModel.kind,
    source: slash(relative(entityRoot, resolvedModel.modelPath)),
    size: model.bytes,
  };
}

const dataVersion = `${plannerData.modVersion || "mod"}-models-1`;
writeFileSync(
  manifestPath,
  `window.INDOMITUS_UNIT_MODELS=${JSON.stringify({
    meta: {
      dataVersion,
      generatedAt: new Date().toISOString(),
      source: "entity.pak + gamelogic.pak",
      presentation: "static bind geometry with simplified materials",
      unitCount: Object.keys(units).length,
      modelCount: converted.size,
    },
    units,
  })};\n`,
);

const audit = {
  meta: {
    generatedAt: new Date().toISOString(),
    source: "entity.pak + gamelogic.pak",
    presentation: "static bind geometry with simplified materials",
    researchNodes: plannerData.nodes.length,
    uniqueCompositionItems: compositionItems.size,
    resolvedItems: resolvedUnits.size,
    itemsWithWebModel: Object.keys(units).length,
    uniqueSourceModels: models.size,
    convertedModels: converted.size,
    failedModels: failedModels.length,
    outputBytes: totalBytes,
    outputMiB: Number((totalBytes / 1024 / 1024).toFixed(2)),
    modelParts: totalParts,
    uniqueMeshes: totalMeshes,
  },
  missing,
  failedModels,
  models: [...converted.values()].map((model) => ({
    source: slash(relative(entityRoot, model.modelPath)),
    output: model.filename,
    kind: model.kind,
    bytes: model.bytes,
    parts: model.parts,
    unitCount: model.units.length,
    skippedParts: model.skippedParts,
  })),
};
writeFileSync(auditPath, `${JSON.stringify(audit, null, 2)}\n`);

console.log(JSON.stringify(audit.meta, null, 2));
if (missing.length) console.log(`Missing unit mappings: ${missing.length}`);
if (failedModels.length) console.log(`Failed source models: ${failedModels.length}`);
