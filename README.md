# bcb-indices-proxy

Proxy serverless para buscar indices do Banco Central do Brasil (API SGS), pronto para deploy na Vercel.

## Como funciona

O endpoint `/api/bcb-indices` recebe requisicoes GET e consulta a API SGS do Banco Central, retornando os dados em JSON com cabecalhos CORS liberados.

## Parametros da query string

- `codigo` (obrigatorio): codigo da serie temporal do SGS. Exemplo: 433 para IPCA.
- `dataInicial` (opcional): data inicial no formato DD/MM/AAAA.
- `dataFinal` (opcional): data final no formato DD/MM/AAAA.

## Exemplo de uso

```
/api/bcb-indices?codigo=433&dataInicial=01/01/2024&dataFinal=31/12/2024
```

## Deploy na Vercel

1. Importe este repositorio na Vercel.
2. Nao ha variaveis de ambiente obrigatorias.
3. Apos o deploy, o endpoint ficara disponivel em `https://SEU-PROJETO.vercel.app/api/bcb-indices`.

## Licenca

MIT
