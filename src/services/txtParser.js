const fs = require("node:fs/promises");

function normalizeEan(raw) {
  const value = String(raw || "").replace(/\D/g, "");
  if (value.length < 8 || value.length > 14) return null;
  return value;
}

function parseBrazilianNumber(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const normalized = value
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanLine(rawLine) {
  return String(rawLine || "")
    .replace(/\^[A-Z]/gi, "")
    .replace(/#0/g, "")
    .trimEnd();
}

function stripCodePrefix(raw) {
  return String(raw || "")
    .replace(/^\s*\d+\s*-\s*/i, "")
    .trim();
}

function extractEans(content) {
  const eans = new Set();
  const regex = /\b\d{8,14}\b/g;
  let match = regex.exec(content);
  while (match) {
    const ean = normalizeEan(match[0]);
    if (ean) eans.add(ean);
    match = regex.exec(content);
  }
  return [...eans];
}

function parseHeaderFields(lines) {
  const fields = {
    LJNA: "",
    LJNO: "",
    LJEN: "",
    LJBA: "",
    LJCD: "",
    LJUF: "",
    LJTL: "",
    DATA: "",
    PDNO: "",
    PGTO: "",
    CTNO: "",
    CTNA: "",
    CTED: "",
    CTBA: "",
    CTCD: "",
    CTTL: "",
    SPNO: "",
    SPAP: ""
  };

  for (const line of lines) {
    const value = cleanLine(line).trim();
    if (!value) continue;

    if (
      !fields.LJNA &&
      /^[A-ZÀ-Ú0-9][A-ZÀ-Ú0-9\s.&/-]{2,40}$/i.test(value) &&
      !/^\*{3}/.test(value) &&
      value.split(/\s+/).length > 1 &&
      !/^(DATA|CLIENTE|END|BAIRRO|CIDADE|VENDEDOR|TEL|Codigo|SubTotal|Acrescimo|Desconto|Total)/i.test(value)
    ) {
      fields.LJNA = value;
    }

    let match = value.match(/^(DATA\.*:)\s*(.+)$/i);
    if (match) {
      const rawDataLine = match[2].trim();
      const numeroInline = rawDataLine.match(/\bNumero:\s*([^\s]+)/i);
      const lojaInline = rawDataLine.match(/\bLoja:\s*([^\s]+)/i);
      fields.DATA = rawDataLine
        .replace(/\bNumero:\s*[^\s]+/i, "")
        .replace(/\bLoja:\s*[^\s]+/i, "")
        .trim();
      if (numeroInline && !fields.PDNO) fields.PDNO = numeroInline[1].trim();
      if (lojaInline && !fields.LJNO) fields.LJNO = lojaInline[1].trim();
      continue;
    }

    match = value.match(/^Numero:\s*([^\s]+)(?:\s+Loja:\s*([^\s]+))?/i);
    if (match) {
      if (!fields.PDNO) fields.PDNO = match[1].trim();
      if (match[2] && !fields.LJNO) fields.LJNO = match[2].trim();
      continue;
    }

    match = value.match(/^CLIENTE\.*:\s*([^\-]+)\s*-\s*(.+)$/i);
    if (match) {
      fields.CTNO = match[1].trim();
      fields.CTNA = match[2].trim();
      continue;
    }

    match = value.match(/^END\.*:\s*(.+)$/i);
    if (match) {
      fields.CTED = match[1].trim();
      continue;
    }

    match = value.match(/^BAIRRO\.*:\s*(.+)$/i);
    if (match) {
      fields.CTBA = match[1].trim();
      continue;
    }

    match = value.match(/^CIDADE\.*:\s*(.+)$/i);
    if (match) {
      const cityLine = match[1].trim();
      const foneMatch = cityLine.match(/(.+?)\s+Fone:\s*(.+)$/i);
      if (foneMatch) {
        fields.CTCD = foneMatch[1].trim();
        fields.CTTL = foneMatch[2].trim();
      } else {
        fields.CTCD = cityLine;
      }
      continue;
    }

    match = value.match(/^VENDEDOR\.*:\s*([^\-]+)\s*-\s*(.+)$/i);
    if (match) {
      fields.SPNO = match[1].trim();
      fields.SPAP = match[2].trim();
      continue;
    }

    match = value.match(/^(?:TEL(?:EFONE)?\.*:?)\s*(.+)$/i);
    if (match) {
      fields.LJTL = match[1].trim();
      continue;
    }

    match = value.match(/^(.+?)\s*\/\s*([A-Za-z]{2})$/);
    if (match && !fields.LJCD) {
      fields.LJCD = match[1].trim();
      fields.LJUF = match[2].toUpperCase();
      continue;
    }

    match = value.match(/^(.+?)\s+-\s+BAIRRO\s+(.+)$/i);
    if (match && !fields.LJEN) {
      fields.LJEN = match[1].trim();
      fields.LJBA = match[2].trim();
      continue;
    }

    match = value.match(/^(.+?)\s*-\s*(.+?)\s*-\s*(.+?)\s*\/\s*([A-Za-z]{2})$/);
    if (match && !fields.LJEN) {
      fields.LJEN = match[1].trim();
      fields.LJBA = match[2].trim();
      fields.LJCD = match[3].trim();
      fields.LJUF = match[4].toUpperCase();
      continue;
    }

    match = value.match(/^(.+?)\s+Orcamento\s*-\s*(.+)$/i);
    if (match) {
      fields.LJNA = match[1].trim();
      fields.PDNO = match[2].trim();
      fields.PDNO = fields.PDNO.replace(/\s+Loja\s*:.+$/i, "").trim();
      const lojaMatch = match[2].match(/\bLoja:\s*([^\s]+)/i);
      if (lojaMatch && !fields.LJNO) fields.LJNO = lojaMatch[1].trim();
    }
  }

  return fields;
}

function parseItems(lines) {
  const items = [];
  let inItems = false;
  let hasGradeColumn = false;
  let hasBarcodeColumn = false;
  let quantityOnlyLayout = false;
  let reachedFooter = false;

  for (const originalLine of lines) {
    if (reachedFooter) break;
    const line = cleanLine(originalLine);
    const value = line.trim();
    if (!value) continue;

    if (/^Codigo\s+Descricao/i.test(value)) {
      hasGradeColumn = /\bGrade\b|\bGrad\b/i.test(value);
      hasBarcodeColumn = /EAN|Barcode/i.test(value);
      quantityOnlyLayout = /\bQuantidade\b/i.test(value) && !/\bV\.Unit\.|\bTotal\b/i.test(value);
      inItems = true;
      continue;
    }

    if (!inItems) continue;
    if (/^_{5,}$/.test(value)) break;
    if (/^(SubTotal\.|Acrescimo:|Desconto\.|Total\.*:)/i.test(value)) break;
    if (/^-+\s*Condicao Pagamento:/i.test(value)) {
      reachedFooter = true;
      break;
    }
    if (/^-+\s*(VALIDADE|NAO TROCAMOS|SEGUINDO ORIENTACAO|CONFIRA A QUANTIDADE)/i.test(value)) {
      reachedFooter = true;
      break;
    }
    if (/^\*{3}\s*ATENCAO\s*\*{3}$/i.test(value)) {
      reachedFooter = true;
      break;
    }

    const columns = line.trim().split(/\s{2,}/).filter(Boolean);
    if (columns.length < 2) continue;

    const codigo = columns[0].trim();
    if (!/^\d{1,18}$/.test(codigo)) continue;
    let descricao = "";
    let grade = "";
    let barcode = "";
    let unidade = "";
    let quantidadeRaw = "";
    let valorUnitarioRaw = "";
    let totalLinhaRaw = "";

    if (quantityOnlyLayout) {
      if (columns.length < 3) continue;
      quantidadeRaw = columns[columns.length - 1].trim();
      const payloadColumnsLegacy = columns.slice(1, -1);

      const maybeUnit = payloadColumnsLegacy[payloadColumnsLegacy.length - 1] || "";
      const maybeGrade = payloadColumnsLegacy[payloadColumnsLegacy.length - 2] || "";
      const unitLike = /^[A-Z]{1,4}$/i.test(maybeUnit.trim());
      if (unitLike && payloadColumnsLegacy.length >= 2) {
        unidade = maybeUnit.trim();
        if (payloadColumnsLegacy.length >= 3) {
          grade = payloadColumnsLegacy[payloadColumnsLegacy.length - 2].trim();
          descricao = payloadColumnsLegacy.slice(0, -2).join(" ").trim();
        } else {
          descricao = payloadColumnsLegacy[0].trim();
        }
      } else {
        descricao = payloadColumnsLegacy.join(" ").trim();
      }
    } else {
      if (columns.length < 5) continue;
      quantidadeRaw = columns[columns.length - 3].trim();
      valorUnitarioRaw = columns[columns.length - 2].trim();
      totalLinhaRaw = columns[columns.length - 1].trim();
      const payloadColumns = columns.slice(1, -3);

      if (hasGradeColumn && hasBarcodeColumn && payloadColumns.length >= 3) {
        barcode = payloadColumns[payloadColumns.length - 1].trim();
        grade = payloadColumns[payloadColumns.length - 2].trim();
        descricao = payloadColumns.slice(0, -2).join(" ").trim();
      } else if (hasGradeColumn && !hasBarcodeColumn && payloadColumns.length >= 2) {
        grade = payloadColumns[payloadColumns.length - 1].trim();
        descricao = payloadColumns.slice(0, -1).join(" ").trim();
      } else if (hasBarcodeColumn && payloadColumns.length >= 2) {
        barcode = payloadColumns[payloadColumns.length - 1].trim();
        descricao = payloadColumns.slice(0, -1).join(" ").trim();
      } else if (payloadColumns.length >= 3) {
        const maybeBarcode = payloadColumns[payloadColumns.length - 1].trim();
        const maybeGrade = payloadColumns[payloadColumns.length - 2].trim();
        const maybeBarcodeDigits = maybeBarcode.replace(/\D/g, "");

        if (maybeBarcodeDigits.length >= 8 && maybeBarcodeDigits.length <= 14) {
          barcode = maybeBarcode;
          grade = maybeGrade;
          descricao = payloadColumns.slice(0, -2).join(" ").trim();
        } else {
          descricao = payloadColumns.join(" ").trim();
        }
      } else if (payloadColumns.length === 2) {
        descricao = payloadColumns[0].trim();
        const maybeSecond = payloadColumns[1].trim();
        const maybeDigits = maybeSecond.replace(/\D/g, "");
        if (maybeDigits.length >= 8 && maybeDigits.length <= 14) {
          barcode = maybeSecond;
        } else {
          grade = maybeSecond;
        }
      } else {
        descricao = payloadColumns.join(" ").trim();
      }
    }

    if (!codigo && !descricao) continue;

    items.push({
      codigo,
      descricao,
      grade,
      barcode,
      unidade,
      quantidadeRaw,
      valorUnitarioRaw,
      totalLinhaRaw,
      quantidade: parseBrazilianNumber(quantidadeRaw),
      valorUnitario: parseBrazilianNumber(valorUnitarioRaw),
      totalLinha: parseBrazilianNumber(totalLinhaRaw)
    });
  }

  return items;
}

function parseTotals(lines) {
  const totals = {
    SUBT: "",
    ACPO: "",
    DESC: "",
    TDAC: "",
    PAGC: "",
    subtotal: null,
    acrescimo: null,
    desconto: null,
    totalFinal: null
  };

  for (const line of lines) {
    const value = cleanLine(line).trim();
    if (!value) continue;

    let match = value.match(/^SubTotal\.\s*:\s*(.+)$/i);
    if (match) {
      totals.SUBT = match[1].trim();
      totals.subtotal = parseBrazilianNumber(match[1]);
      continue;
    }

    match = value.match(/^Acrescimo:\s*(.+)$/i);
    if (match) {
      totals.ACPO = match[1].trim();
      totals.acrescimo = parseBrazilianNumber(match[1]);
      continue;
    }

    match = value.match(/^Desconto\.\s*:\s*(.+)$/i);
    if (match) {
      totals.DESC = match[1].trim();
      totals.desconto = parseBrazilianNumber(match[1]);
      continue;
    }

    match = value.match(/^Total\.*:\s*(.+)$/i);
    if (match) {
      totals.TDAC = match[1].trim();
      totals.totalFinal = parseBrazilianNumber(match[1]);
      continue;
    }

    match = value.match(/^-\s*Condicao Pagamento:\s*(.+?)\s+TOTAL:\s*(.+)$/i);
    if (match) {
      totals.PAGC = stripCodePrefix(match[1]);
      totals.TDAC = match[2].trim();
      totals.totalFinal = parseBrazilianNumber(match[2]);
    }
  }

  return totals;
}

function parseBudgetTxt(content, { loja, pedido }) {
  const lines = String(content || "").split(/\r?\n/);
  const fields = parseHeaderFields(lines);
  const items = parseItems(lines);
  const totals = parseTotals(lines);

  const itemEans = items
    .map((item) => normalizeEan(item.barcode || item.codigo))
    .filter(Boolean);

  const eans = [...new Set([...itemEans, ...extractEans(content)])];

  return {
    loja,
    pedido,
    eans,
    fields,
    items,
    totals,
    rawContent: content
  };
}

async function readAndParseBudgetFile(filePath, context) {
  const content = await fs.readFile(filePath, "utf8");
  return parseBudgetTxt(content, context);
}

module.exports = {
  readAndParseBudgetFile,
  parseBudgetTxt
};
