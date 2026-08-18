---
tags: [busca, arquivos, performance]
---

# Busca de Arquivo TXT/PRN

Relacionada a [[00-Fluxo-Orcamento]] e [[03-Parser-e-EANs]].

## Objetivo

Localizar no volume `/u/saci/print` o arquivo que contenha loja + pedido no conteúdo.

## Arquivo técnico

- `src/services/fileSearch.js`

## Estratégia

- varredura recursiva
- leitura por stream (chunks)
- parada na primeira correspondência
