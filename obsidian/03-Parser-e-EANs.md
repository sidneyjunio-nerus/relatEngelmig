---
tags: [parser, ean, txt]
---

# Parser e Extração de EANs

Relacionada a [[02-Busca-Arquivo-TXT-PRN]] e [[04-Consulta-MySQL-Produtos]].

## Objetivo

Ler TXT/PRN e extrair:
- cabeçalho do orçamento (dados loja/cliente/vendedor)
- itens (código, descrição, quantidade, unitário e total)
- totais (subtotal, acréscimo, desconto e total final)
- EANs para enriquecimento no banco

## Arquivo técnico

- `src/services/txtParser.js`

## Observação

Layout base de orçamento já foi mapeado; manter validação contínua para variações reais (ver [[07-Pendencias-e-Decisoes]]).
