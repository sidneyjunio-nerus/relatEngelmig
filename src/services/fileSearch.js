const fs = require("node:fs");
const path = require("node:path");

const TEXT_EXTENSIONS = new Set([".txt", ".prn"]);

function normalizeNeedles(needles = []) {
  return needles
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

async function fileContainsNeedles(filePath, needles) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf8", highWaterMark: 128 * 1024 });
    let cache = "";
    let found = false;

    stream.on("data", (chunk) => {
      if (found) return;
      const text = (cache + chunk).toLowerCase();
      found = needles.every((needle) => text.includes(needle));
      cache = text.slice(-2048);
      if (found) stream.destroy();
    });

    stream.on("close", () => resolve(found));
    stream.on("error", reject);
  });
}

async function findFirstTextFileContainingAll({ rootDir, needles }) {
  const normalizedNeedles = normalizeNeedles(needles);
  if (!normalizedNeedles.length) {
    return { foundPath: null, scannedFiles: 0, elapsedMs: 0 };
  }

  const startedAt = Date.now();
  const dirs = [rootDir];
  let scannedFiles = 0;

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
      if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      scannedFiles += 1;
      const contains = await fileContainsNeedles(fullPath, normalizedNeedles);
      if (contains) {
        return { foundPath: fullPath, scannedFiles, elapsedMs: Date.now() - startedAt };
      }
    }
  }

  return { foundPath: null, scannedFiles, elapsedMs: Date.now() - startedAt };
}

async function findBudgetFile({ rootDir, loja, pedido, extraNeedles = [] }) {
  const needles = [String(loja || "").trim(), String(pedido || "").trim(), ...extraNeedles].filter(Boolean);
  const strictResult = await findFirstTextFileContainingAll({ rootDir, needles });
  if (strictResult.foundPath) return strictResult;

  // Evita falso negativo quando o número da loja é curto e o arquivo referencia o nome da loja.
  return findFirstTextFileContainingAll({
    rootDir,
    needles: [String(pedido || "").trim(), ...extraNeedles].filter(Boolean)
  });
}

async function findBudgetFileByPedido({ rootDir, pedido }) {
  return findFirstTextFileContainingAll({ rootDir, needles: [pedido] });
}

async function findBudgetFileByNeedles({ rootDir, needles }) {
  return findFirstTextFileContainingAll({ rootDir, needles });
}

module.exports = {
  findBudgetFile,
  findBudgetFileByPedido,
  findBudgetFileByNeedles
};
