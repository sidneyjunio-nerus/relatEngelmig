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

    return {
      codigo: item.codigo || ean,
      grade: gradeDisplay || "",
      unidade: item.unidade || "",
      ean: fromDb?.barcode || item.barcode || null,
      sku: fromDb?.prdno || item.codigo || null,
      nome: fromDb?.nome || item.descricao || "Produto sem nome (pendente de mapeamento)",
      fotoUrl: fromDb?.fotoUrl || defaultPhoto,
      quantidade: item.quantidade ?? null,
      quantidadeRaw: item.quantidadeRaw || "",
      valorUnitario: item.valorUnitario ?? null,
      valorUnitarioRaw: item.valorUnitarioRaw || "",
      totalLinha: item.totalLinha ?? null,
      totalLinhaRaw: item.totalLinhaRaw || ""
    };
  });

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
    items
  };
}

module.exports = {
  buildBudgetViewModel
};
