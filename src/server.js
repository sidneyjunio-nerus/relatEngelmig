const path = require("node:path");
const express = require("express");
const { config } = require("./config");
const { findBudgetFileByNeedles } = require("./services/fileSearch");
const { readAndParseBudgetFile } = require("./services/txtParser");
const { createProductsRepo } = require("./services/productsRepo");
const { buildBudgetViewModel } = require("./services/budgetBuilder");

const app = express();
const productsRepo = createProductsRepo(config.mysql);
const MAX_SEARCH_CANDIDATES = 50;

function normalizeToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d+$/.test(raw)) return raw.replace(/^0+(?=\d)/, "") || "0";
  return raw.toLowerCase();
}

function isExactBudgetMatch(parsedBudget, loja, pedido) {
  const parsedPedido = normalizeToken(parsedBudget?.fields?.PDNO);
  const parsedLoja = normalizeToken(parsedBudget?.fields?.LJNO);
  const requestedPedido = normalizeToken(pedido);
  const requestedLoja = normalizeToken(loja);
  return parsedPedido === requestedPedido && parsedLoja === requestedLoja;
}

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
    console.info(`[BUSCA] Iniciando busca de orçamento | loja="${loja}" pedido="${pedido}" root="${config.printRoot}"`);

    const searchResult = await findBudgetFileByNeedles({
      rootDir: config.printRoot,
      exactNeedles: [loja, pedido],
      maxResults: MAX_SEARCH_CANDIDATES
    });

    if (!searchResult.foundPath) {
      console.warn(
        `[BUSCA] Pedido não encontrado | loja="${loja}" pedido="${pedido}" scannedFiles=${searchResult.scannedFiles} elapsedMs=${searchResult.elapsedMs}`
      );
      return res.status(404).render("index", {
        error: `Pedido "${pedido}" da loja "${loja}" não foi encontrado no diretório ${config.printRoot}.`,
        warning: null,
        budget: null,
        baseInfo: { printRoot: config.printRoot, usedPath: null },
        form: { loja, pedido }
      });
    }

    let parsedBudget = null;
    let matchedPath = null;
    const candidates = searchResult.foundPaths || (searchResult.foundPath ? [searchResult.foundPath] : []);

    for (const candidatePath of candidates) {
      const candidateParsed = await readAndParseBudgetFile(candidatePath, { loja, pedido });
      console.info(
        `[PARSER] Parse candidato | path="${candidatePath}" ljna="${candidateParsed.fields?.LJNA || ""}" ljno="${candidateParsed.fields?.LJNO || ""}" pdno="${candidateParsed.fields?.PDNO || ""}" itens=${candidateParsed.items?.length || 0}`
      );
      if (isExactBudgetMatch(candidateParsed, loja, pedido)) {
        parsedBudget = candidateParsed;
        matchedPath = candidatePath;
        break;
      }
      console.warn(
        `[BUSCA] Candidato ignorado por divergência | pedidoSolicitado="${pedido}" lojaSolicitada="${loja}" pedidoArquivo="${candidateParsed.fields?.PDNO || ""}" lojaArquivo="${candidateParsed.fields?.LJNO || ""}" path="${candidatePath}"`
      );
    }

    if (!parsedBudget || !matchedPath) {
      console.warn(
        `[BUSCA] Nenhum arquivo válido após validação | loja="${loja}" pedido="${pedido}" candidatos=${candidates.length} scannedFiles=${searchResult.scannedFiles} elapsedMs=${searchResult.elapsedMs}`
      );
      return res.status(404).render("index", {
        error: `Pedido "${pedido}" da loja "${loja}" não foi encontrado no diretório ${config.printRoot}.`,
        warning: null,
        budget: null,
        baseInfo: { printRoot: config.printRoot, usedPath: null },
        form: { loja, pedido }
      });
    }

    console.info(
      `[BUSCA] Arquivo validado | path="${matchedPath}" scannedFiles=${searchResult.scannedFiles} elapsedMs=${searchResult.elapsedMs}`
    );

    const products = await productsRepo.getProductsByBudgetItems({ items: parsedBudget.items });
    console.info(`[MYSQL] Produtos carregados | encontrados=${products.length}`);
    const customer = await productsRepo.getCustomerByNo(parsedBudget.fields?.CTNO);
    console.info(
      `[MYSQL] Cliente carregado | ctno="${parsedBudget.fields?.CTNO || ""}" encontrado=${Boolean(customer)}`
    );

    const budget = buildBudgetViewModel({
      parsed: parsedBudget,
      products,
      store: null,
      customer,
      defaultPhoto: config.defaultPhoto,
      foundPath: matchedPath,
      metrics: {
        scannedFiles: searchResult.scannedFiles || 0,
        elapsedMs: searchResult.elapsedMs || 0
      }
    });

    console.info(`[ORCAMENTO] Render pronto | loja="${loja}" pedido="${pedido}" totalItens=${budget.totalItens}`);

    return res.render("index", {
      error: null,
      warning: null,
      budget,
      baseInfo: { printRoot: config.printRoot, usedPath: matchedPath },
      form: { loja, pedido }
    });
  } catch (error) {
    console.error(`[ORCAMENTO] Erro no processamento | loja="${loja}" pedido="${pedido}"`, error);
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
