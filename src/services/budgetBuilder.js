function buildBudgetViewModel({ parsed, products, store, customer, defaultPhoto, foundPath, metrics }) {
  const byCodigo = new Map(products.map((item) => [String(item.codigo || ""), item]));
  const byCodigoEan = new Map(
    products.map((item) => [`${String(item.codigo || "")}|${String(item.barcode || "")}`, item])
  );

  const parsedItems = parsed.items || [];
  const hasParsedItems = parsedItems.length > 0;

  const items = (hasParsedItems ? parsedItems : parsed.eans.map((ean) => ({ codigo: ean, descricao: "" }))).map((item) => {
    const ean = String(item.codigo || "").replace(/\D/g, "");
    const codeKey = String(item.codigo || "");
    const barcodeKey = String(item.barcode || "");
    const fromDb = byCodigoEan.get(`${codeKey}|${barcodeKey}`) || byCodigo.get(codeKey);
    const gradeRaw = String(item.grade || "").trim();
    const gradeFriendly = String(fromDb?.gradeName || "").trim();
    const gradeDisplay = gradeFriendly
      ? gradeRaw && gradeRaw !== gradeFriendly
        ? `${gradeFriendly} (${gradeRaw})`
        : gradeFriendly
      : gradeRaw;
    const categoria = String(item.categoria || item.ambi || "").trim();

    const fotoUrl = fromDb?.fotoUrl || defaultPhoto;
    const hasFoto = Boolean(fromDb?.fotoUrl);

    return {
      codigo: item.codigo || ean,
      categoria,
      ambi: categoria,
      grade: gradeDisplay || "",
      unidade: item.unidade || "",
      ean: fromDb?.barcode || item.barcode || null,
      sku: fromDb?.prdno || item.codigo || null,
      nome: fromDb?.nome || item.descricao || "Produto sem nome (pendente de mapeamento)",
      fotoUrl,
      hasFoto,
      quantidade: item.quantidade ?? null,
      quantidadeRaw: item.quantidadeRaw || "",
      valorUnitario: item.valorUnitario ?? null,
      valorUnitarioRaw: item.valorUnitarioRaw || "",
      totalLinha: item.totalLinha ?? null,
      totalLinhaRaw: item.totalLinhaRaw || ""
    };
  });

  const groupedItems = [];
  const groupedIndex = new Map();
  for (const item of items) {
    const categoryKey = String(item.categoria || "").trim();
    if (!groupedIndex.has(categoryKey)) {
      groupedIndex.set(categoryKey, groupedItems.length);
      groupedItems.push({
        categoria: categoryKey,
        items: []
      });
    }
    groupedItems[groupedIndex.get(categoryKey)].items.push(item);
  }

  return {
    loja: parsed.loja,
    storeName: store?.name || parsed.fields?.LJNA || parsed.loja,
    storeNo: store?.no || parsed.fields?.LJNO || parsed.loja,
    pedido: parsed.pedido,
    fields: parsed.fields || {},
    totals: parsed.totals || {},
    customer: customer || null,
    arquivoBase: foundPath,
    totalItens: items.length,
    metrics,
    groupedItems,
    items
  };
}

module.exports = {
  buildBudgetViewModel
};
