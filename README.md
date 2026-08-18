# relatEngelmig

Base inicial da gambiarra para gerar orçamento moderno com imagem a partir de TXT/PRN do NW.

## Como rodar

1. Copie `.env.example` para `.env` e ajuste credenciais MySQL.
2. Instale dependências:
   - `npm install`
3. Inicie:
   - `npm start`
4. Acesse:
   - `http://localhost:3210`

## Docker (cliente / VPN interna)

### 1) Publicação da imagem no GHCR

O workflow `.github/workflows/ghcr-publish.yml` publica a imagem em:

- `ghcr.io/<owner>/<repo>:latest` (push na `main`)
- `ghcr.io/<owner>/<repo>:vX.Y.Z` (tags `v*`)
- `ghcr.io/<owner>/<repo>:sha-...`

### 2) Execução no cliente puxando do GHCR

1. Copie `.env.client.example` para `.env.client` e ajuste valores.
2. Faça login no GHCR no servidor do cliente:
   - `echo <GH_TOKEN> | docker login ghcr.io -u <GITHUB_USER> --password-stdin`
3. Suba com compose:
   - `docker compose -f docker-compose.client.yml up -d`

O volume de arquivos TXT/PRN do cliente é montado via:

- `${CLIENT_PRINT_ROOT}:/data/print:ro`

e o app lê por `PRINT_ROOT=/data/print`.

### 3) CI para PR

O workflow `.github/workflows/docker-ci.yml` valida build de imagem em pull request (sem push).

## Estrutura

- `src/services/fileSearch.js`: busca otimizada no diretório `/u/saci/print`
- `src/services/txtParser.js`: parser do layout TXT de orçamento (cabeçalho, itens, totais e EANs)
- `src/services/productsRepo.js`: consultas MySQL nas tabelas `prd`, `prdbar` e `prdpicture`
- `views/index.ejs`: tela com formulário e layout do orçamento
- `pendencias.md`: pontos a fechar para versão final
