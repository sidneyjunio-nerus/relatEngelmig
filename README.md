# relatEngelmig

Base inicial da gambiarra para gerar orçamento moderno com imagem a partir de TXT/PRN do NW.

## Como rodar

1. Copie `.env.example` para `.env` e ajuste os valores.
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

1. **Importar o modelo formatado no cliente/base local**  
   Use o arquivo `modelo-orcamento-formatado.txt` como base do layout de orçamento no cliente.

2. **Configurar ambiente para rodar com imagem `latest`**  
   - Copie `.env.example` para `.env`.  
   - Ajuste o `GHCR_IMAGE` para a tag `latest` (ex.: `ghcr.io/sidneyjunio-nerus/relatengelmig:latest`).  
   - Configure `CLIENT_PRINT_ROOT` para a pasta onde o NW salva os arquivos de orçamento (`.txt/.prn`).

3. Faça login no GHCR no servidor do cliente:
   - `echo <GH_TOKEN> | docker login ghcr.io -u <GITHUB_USER> --password-stdin`
4. Suba com Docker Compose:
   - `docker-compose up`

O volume de arquivos TXT/PRN do cliente é montado via:

- `${CLIENT_PRINT_ROOT}:/v/saci/print`

e o app lê por `PRINT_ROOT=/v/saci/print`.

> **Importante (porta no cliente):**
> - A porta **interna do container** é `3210`.
> - No cliente, use uma **porta de host livre** (a da esquerda no mapeamento).
> - Para evitar conflito entre variável de ambiente e mapeamento, prefira:
>
> ```yml
> ports:
>   - "${HOST_PORT:-3210}:3210"
> ```
>
> E no `.env`:
>
> ```env
> HOST_PORT=4321
> PORT=3210
> ```

5. **Gerar orçamento no PDV após configurar diretório de PRN**  
   Depois que o diretório dos PRNs estiver correto e o container em execução, realize um orçamento no PDV para gerar o arquivo e permitir a consulta no sistema.