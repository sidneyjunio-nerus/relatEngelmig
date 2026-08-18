const path = require("node:path");
const express = require("express");
const { config } = require("./config");
const { findBudgetFileByNeedles } = require("./services/fileSearch");
const { readAndParseBudgetFile } = require("./services/txtParser");
const { createProductsRepo } = require("./services/productsRepo");
const { buildBudgetViewModel } = require("./services/budgetBuilder");

const app = express();
const productsRepo = createProductsRepo(config.mysql);

function detectImageMime(buffer) {
  if (!buffer || buffer.length < 4) return "application/octet-stream";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return "image/bmp";
  return "application/octet-stream";
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.urlencoded({ extended: true }));
app.use("/static", express.static(path.join(__dirname, "..", "public")));

function normalizeCompare(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function isStoreCompatible({ expectedStoreName, parsedStoreName }) {
  const expected = normalizeCompare(expectedStoreName);
  const parsed = normalizeCompare(parsedStoreName);
  if (!expected || !parsed) return true;
  return expected.includes(parsed) || parsed.includes(expected);
}

app.get("/", (_req, res) => {
  res.render("index", {
    error: null,
    warning: null,
    budget: null,
    baseInfo: { printRoot: config.printRoot, usedPath: null },
    form: { loja: "", pedido: "" }
  });
});

app.get("/produto-foto/:seqno", async (req, res) => {
  try {
    const photo = await productsRepo.getPictureBySeqno(req.params.seqno);
    if (!photo) return res.status(404).end();
    res.setHeader("Content-Type", detectImageMime(photo));
    return res.send(photo);
  } catch (error) {
    return res.status(500).send(`Falha ao carregar foto: ${error.message}`);
  }
});

app.post("/orcamento", async (req, res) => {
  const loja = String(req.body.loja || "").trim();
  const pedido = String(req.body.pedido || "").trim();

  if (!loja || !pedido) {
    return res.status(400).render("index", {
      error: "Informe loja e pedido.",
      warning: null,
      budget: null,
      baseInfo: { printRoot: config.printRoot, usedPath: null },
      form: { loja, pedido }
    });
  }

  try {
    const store = await productsRepo.getStoreByNo(loja);
    const storeName = store?.name || "";
    let usedPath = "";
    let searchMetrics = { scannedFiles: 0, elapsedMs: 0 };
    let parsed;

    const strictNeedles = [pedido, storeName || loja];
    const strictSearch = await findBudgetFileByNeedles({
      rootDir: config.printRoot,
      needles: strictNeedles
    });

    if (strictSearch.foundPath) {
      parsed = await readAndParseBudgetFile(strictSearch.foundPath, { loja, pedido });
      const isCompatible = isStoreCompatible({
        expectedStoreName: storeName,
        parsedStoreName: parsed.fields.LJNA
      });
      if (isCompatible) {
        usedPath = strictSearch.foundPath;
        searchMetrics = strictSearch;
      }
    }

    if (!usedPath) {
      return res.status(404).render("index", {
        error: `Pedido "${pedido}" da loja "${storeName || loja}" não foi encontrado no diretório ${config.printRoot}.`,
        warning: null,
        budget: null,
        baseInfo: { printRoot: config.printRoot, usedPath: null },
        form: { loja, pedido }
      });
    }

    const parsedBudget = parsed || (await readAndParseBudgetFile(usedPath, { loja, pedido }));
    const products = await productsRepo.getProductsByBudgetItems({ items: parsedBudget.items });

    const budget = buildBudgetViewModel({
      parsed: parsedBudget,
      products,
      store,
      defaultPhoto: config.defaultPhoto,
      foundPath: usedPath,
      metrics: {
        scannedFiles: searchMetrics.scannedFiles || 0,
        elapsedMs: searchMetrics.elapsedMs || 0
      }
    });

    return res.render("index", {
      error: null,
      warning: null,
      budget,
      baseInfo: { printRoot: config.printRoot, usedPath },
      form: { loja, pedido }
    });
  } catch (error) {
    return res.status(500).render("index", {
      error: `Falha ao processar orçamento: ${error.message}`,
      warning: null,
      budget: null,
      baseInfo: { printRoot: config.printRoot, usedPath: null },
      form: { loja, pedido }
    });
  }
});

app.listen(config.port, () => {
  console.log(`relatEngelmig rodando em http://localhost:${config.port}`);
});
