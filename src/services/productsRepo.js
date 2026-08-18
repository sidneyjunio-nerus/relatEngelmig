const mysql = require("mysql2/promise");

function createProductsRepo(mysqlConfig) {
  const pool = mysql.createPool({
    ...mysqlConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  function normalizeCode(raw) {
    return String(raw || "").trim();
  }

  function extractCodes(items = []) {
    const codes = new Set();
    for (const item of items) {
      const values = [item?.codigo, item?.barcode];
      for (const raw of values) {
        const code = normalizeCode(raw);
        if (!code) continue;
        codes.add(code);
        const digits = code.replace(/\D/g, "");
        if (digits) codes.add(digits);
      }
    }
    return [...codes];
  }

  function scoreCandidate(item, row) {
    const rawValues = [item?.codigo, item?.barcode];
    const normalizedValues = rawValues
      .map((value) => normalizeCode(value))
      .filter(Boolean);
    if (!normalizedValues.length) return 0;

    const prdno = normalizeCode(row.prdno);
    const prdnoDigits = prdno.replace(/\D/g, "");
    const barcode = normalizeCode(row.barcode);
    const barcodeDigits = barcode.replace(/\D/g, "");

    let score = 0;
    for (const code of normalizedValues) {
      const codeDigits = code.replace(/\D/g, "");
      if (code === prdno) score += 120;
      if (code === barcode) score += 110;
      if (codeDigits && codeDigits === prdnoDigits) score += 80;
      if (codeDigits && codeDigits === barcodeDigits) score += 70;
    }

    if (row.hasPicture) score += 20;
    if (row.hasPictureUrl) score += 10;

    return score;
  }

  function buildPhotoUrl(row) {
    if (row.urlImagem) return row.urlImagem;
    if (row.seqno) return `/produto-foto/${row.seqno}`;
    return null;
  }

  async function getProductsByBudgetItems({ items }) {
    const codes = extractCodes(items);
    if (!codes.length) return [];

    const query = `
      SELECT
        TRIM(p.no) AS prdno,
        TRIM(p.name) AS nome,
        TRIM(pb.barcode) AS barcode_grade,
        TRIM(p.barcode) AS barcode_prd,
        pp.seqno AS seqno,
        TRIM(COALESCE(pp.urlImagem, '')) AS urlImagem,
        pp.foto IS NOT NULL AS hasPicture
      FROM prd p
      LEFT JOIN prdbar pb
        ON pb.prdno = p.no
      LEFT JOIN prdpicture pp
        ON pp.prdno = p.no
       AND (pp.grade = pb.grade OR pp.grade = '' OR pp.grade IS NULL)
      WHERE (
        TRIM(p.no) IN (?)
        OR TRIM(pb.barcode) IN (?)
        OR TRIM(p.barcode) IN (?)
      )
    `;

    const [rows] = await pool.query(query, [codes, codes, codes]);

    const candidates = rows.map((row) => ({
      prdno: normalizeCode(row.prdno),
      nome: normalizeCode(row.nome),
      barcode: normalizeCode(row.barcode_grade || row.barcode_prd),
      seqno: row.seqno ? Number(row.seqno) : null,
      urlImagem: normalizeCode(row.urlImagem),
      hasPicture: Boolean(row.hasPicture),
      hasPictureUrl: Boolean(normalizeCode(row.urlImagem))
    }));

    const chosenByCode = new Map();
    for (const item of items) {
      const code = normalizeCode(item?.codigo);
      const barcode = normalizeCode(item?.barcode);
      const itemKey = `${code}|${barcode}`;
      if (!code || chosenByCode.has(itemKey)) continue;

      let best = null;
      let bestScore = -1;
      for (const candidate of candidates) {
        const score = scoreCandidate(item, candidate);
        if (score > bestScore) {
          best = candidate;
          bestScore = score;
        }
      }

      if (best && bestScore > 0) {
        chosenByCode.set(itemKey, {
          codigo: code,
          prdno: best.prdno,
          barcode: best.barcode,
          nome: best.nome || "Produto sem nome",
          fotoUrl: buildPhotoUrl(best)
        });
      }
    }

    return [...chosenByCode.values()];
  }

  async function getPictureBySeqno(seqno) {
    const number = Number.parseInt(String(seqno || "").trim(), 10);
    if (!Number.isFinite(number) || number <= 0) return null;

    const query = `
      SELECT foto
      FROM prdpicture
      WHERE seqno = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [number]);
    const row = rows[0];
    if (!row?.foto) return null;
    return row.foto;
  }

  async function getStoreByNo(storeNo) {
    const number = String(storeNo || "").trim();
    if (!number) return null;

    const query = `
      SELECT
        TRIM(no) AS no,
        TRIM(name) AS name
      FROM store
      WHERE TRIM(no) = ?
      LIMIT 1
    `;
    const [rows] = await pool.query(query, [number]);
    const row = rows[0];
    if (!row) return null;

    return {
      no: normalizeCode(row.no),
      name: normalizeCode(row.name)
    };
  }

  return {
    getProductsByBudgetItems,
    getPictureBySeqno,
    getStoreByNo
  };
}

module.exports = {
  createProductsRepo
};
