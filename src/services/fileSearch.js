const fs = require("node:fs");
const path = require("node:path");

const TEXT_EXTENSIONS = new Set([".txt", ".prn"]);
const BLOCKED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".zip", ".rar", ".7z"]);

function normalizeNeedles(needles = []) {
  return needles
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildExactNeedleRegex(needle) {
  if (/^\d+$/.test(needle)) {
    const normalizedNumber = needle.replace(/^0+(?=\d)/, "") || "0";
    return new RegExp(`(^|\\D)0*${escapeRegex(normalizedNumber)}(\\D|$)`);
  }
  return new RegExp(`(^|[^a-z0-9])${escapeRegex(needle)}([^a-z0-9]|$)`);
}

function isSearchableBudgetFile(fileName) {
  const lowerName = String(fileName || "").toLowerCase();
  const ext = path.extname(lowerName);
  if (BLOCKED_EXTENSIONS.has(ext)) return false;
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (!ext) return true;
  if (lowerName.startsWith("prn") && /^\.\d+$/.test(ext)) return true;
  return false;
}

async function fileContainsNeedles(filePath, needles, exactNeedles) {
  const exactNeedleRegexes = exactNeedles.map((needle) => buildExactNeedleRegex(needle));

  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf8", highWaterMark: 128 * 1024 });
    let cache = "";
    let found = false;
    let isBinary = false;

    stream.on("data", (chunk) => {
      if (found || isBinary) return;
      if (chunk.includes("\u0000")) {
        isBinary = true;
        stream.destroy();
        return;
      }
      const text = (cache + chunk).toLowerCase();
      const containsAllNeedles = needles.every((needle) => text.includes(needle));
      const containsAllExactNeedles = exactNeedleRegexes.every((regex) => regex.test(text));
      found = containsAllNeedles && containsAllExactNeedles;
      cache = text.slice(-4096);
      if (found) stream.destroy();
    });

    stream.on("close", () => resolve(found && !isBinary));
    stream.on("error", reject);
  });
}

async function findFirstTextFileContainingAll({ rootDir, needles, exactNeedles = [], maxResults = 1 }) {
  const normalizedNeedles = normalizeNeedles(needles);
  const normalizedExactNeedles = normalizeNeedles(exactNeedles);

  if (!normalizedNeedles.length && !normalizedExactNeedles.length) {
    return { foundPath: null, foundPaths: [], scannedFiles: 0, elapsedMs: 0 };
  }

  const startedAt = Date.now();
  const dirs = [rootDir];
  let scannedFiles = 0;
  const foundPaths = [];

  while (dirs.length) {
    const current = dirs.pop();
    let dirHandle;
    try {
      dirHandle = await fs.promises.opendir(current);
    } catch {
      continue;
    }

    for await (const entry of dirHandle) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        dirs.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!isSearchableBudgetFile(entry.name)) continue;

      scannedFiles += 1;
      const contains = await fileContainsNeedles(fullPath, normalizedNeedles, normalizedExactNeedles);
      if (contains) {
        foundPaths.push(fullPath);
        if (foundPaths.length >= maxResults) {
          return {
            foundPath: foundPaths[0] || null,
            foundPaths,
            scannedFiles,
            elapsedMs: Date.now() - startedAt
          };
        }
      }
    }
  }

  return {
    foundPath: foundPaths[0] || null,
    foundPaths,
    scannedFiles,
    elapsedMs: Date.now() - startedAt
  };
}

async function findBudgetFile({ rootDir, loja, pedido, extraNeedles = [] }) {
  const needles = [String(loja || "").trim(), String(pedido || "").trim(), ...extraNeedles].filter(Boolean);
  const strictResult = await findFirstTextFileContainingAll({
    rootDir,
    needles,
    exactNeedles: [String(loja || "").trim(), String(pedido || "").trim()],
    maxResults: 1
  });
  if (strictResult.foundPath) return strictResult;

  // Evita falso negativo quando o número da loja é curto e o arquivo referencia o nome da loja.
  return findFirstTextFileContainingAll({
    rootDir,
    needles: [String(pedido || "").trim(), ...extraNeedles].filter(Boolean),
    exactNeedles: [String(pedido || "").trim()],
    maxResults: 1
  });
}

async function findBudgetFileByPedido({ rootDir, pedido }) {
  return findFirstTextFileContainingAll({ rootDir, needles: [pedido], exactNeedles: [pedido], maxResults: 1 });
}

async function findBudgetFileByNeedles({ rootDir, needles = [], exactNeedles = [], maxResults = 1 }) {
  return findFirstTextFileContainingAll({ rootDir, needles, exactNeedles, maxResults });
}

module.exports = {
  findBudgetFile,
  findBudgetFileByPedido,
  findBudgetFileByNeedles
};
