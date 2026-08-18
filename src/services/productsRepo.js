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
    const itemGrade = normalizeCode(item?.grade);
    const rowGrade = normalizeCode(row.gradeCode);

    let score = 0;
    for (const code of normalizedValues) {
      const codeDigits = code.replace(/\D/g, "");
      if (code === prdno) score += 120;
      if (code === barcode) score += 110;
      if (codeDigits && codeDigits === prdnoDigits) score += 80;
      if (codeDigits && codeDigits === barcodeDigits) score += 70;
    }

    if (itemGrade && rowGrade) {
      if (itemGrade === rowGrade) {
        score += 95;
      } else if (itemGrade.slice(0, 4) && rowGrade.startsWith(itemGrade.slice(0, 4))) {
        score += 35;
      }
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
        TRIM(pb.grade) AS grade_code,
        TRIM(COALESCE(gn.name, '')) AS grade_name,
        pp.seqno AS seqno,
        TRIM(COALESCE(pp.urlImagem, '')) AS urlImagem,
        pp.foto IS NOT NULL AS hasPicture
      FROM prd p
      LEFT JOIN prdbar pb
        ON pb.prdno = p.no
      LEFT JOIN grdnam gn
        ON TRIM(gn.valno) = LEFT(TRIM(pb.grade), 4)
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
      gradeCode: normalizeCode(row.grade_code),
      gradeName: normalizeCode(row.grade_name),
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
          gradeCode: best.gradeCode,
          gradeName: best.gradeName,
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

  async function getCustomerByNo(customerNo) {
    const number = Number.parseInt(String(customerNo || "").trim(), 10);
    if (!Number.isFinite(number) || number <= 0) return null;

    const query = `
      SELECT
        c.no AS codigo,
        TRIM(c.name) AS nome,
        TRIM(c.cpf_cgc) AS cpf,
        c.birthday AS birthdayRaw,
        CASE
          WHEN c.birthday > 0
            THEN DATE_FORMAT(STR_TO_DATE(CAST(c.birthday AS CHAR), '%Y%m%d'), '%d/%m/%Y')
          ELSE NULL
        END AS nascimento,
        TRIM(COALESCE(c.email, '')) AS email,
        TRIM(COALESCE(c.ddd, '')) AS ddd,
        TRIM(COALESCE(c.tel, '')) AS tel,
        TRIM(COALESCE(c.celular, '')) AS celular,
        TRIM(COALESCE(c.add1, '')) AS endereco,
        TRIM(COALESCE(c.number1, '')) AS numero,
        TRIM(COALESCE(c.addComplemento, '')) AS complemento,
        TRIM(COALESCE(c.nei1, '')) AS bairro,
        TRIM(COALESCE(c.city1, '')) AS cidade,
        TRIM(COALESCE(c.state1, '')) AS uf,
        TRIM(COALESCE(c.zip, '')) AS cep
      FROM custp c
      WHERE c.no = ?
      LIMIT 1
    `;

    const [rows] = await pool.query(query, [number]);
    const row = rows?.[0];
    if (!row) return null;

    return {
      codigo: String(row.codigo || "").trim(),
      nome: normalizeCode(row.nome),
      cpf: normalizeCode(row.cpf),
      nascimento: normalizeCode(row.nascimento),
      email: normalizeCode(row.email),
      ddd: normalizeCode(row.ddd),
      tel: normalizeCode(row.tel),
      celular: normalizeCode(row.celular),
      endereco: normalizeCode(row.endereco),
      numero: normalizeCode(row.numero),
      complemento: normalizeCode(row.complemento),
      bairro: normalizeCode(row.bairro),
      cidade: normalizeCode(row.cidade),
      uf: normalizeCode(row.uf),
      cep: normalizeCode(row.cep)
    };
  }

  return {
    getProductsByBudgetItems,
    getPictureBySeqno,
    getStoreByNo,
    getCustomerByNo
  };
}

module.exports = {
  createProductsRepo
};
