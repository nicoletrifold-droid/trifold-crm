---
name: Sienge API — fontes oficiais de documentação
description: Pontos canônicos para consultar autenticação, criação de usuário API, liberação de recursos e webhooks no Sienge
type: reference
---

Fontes oficiais para integração Sienge (uso recorrente em pesquisas sobre a integração Sienge no projeto):

- **Docs API (atualizado diariamente):** https://api.sienge.com.br/docs/
- **Como criar usuários de API:** https://ajuda.sienge.com.br/support/solutions/articles/153000200929
- **Como liberar recursos para usuários de API:** https://ajuda.sienge.com.br/support/solutions/articles/153000200930
- **Como entender a documentação das APIs (BaseURL, tenant):** https://ajuda.sienge.com.br/support/solutions/articles/153000200931
- **APIs REST, BULK e Webhooks:** https://ajuda.sienge.com.br/support/solutions/articles/153000200932
- **Como configurar uma API:** https://ajuda.sienge.com.br/support/solutions/articles/153000200928
- **Weni — Geração de Token Basic para Webhook Sienge:** https://comunidade.weni.ai/t/autenticacao-da-api-do-sienge-geracao-do-token-basic-para-webhook/98

Pontos-chave a lembrar:
- BaseURL Sienge usa tenant como subdomínio (ex.: `https://api.sienge.com.br/{tenant}/public/api/v1/...` — tenant = subdomínio do cliente em `*.sienge.com.br`).
- Autenticação é **HTTP Basic Auth** (`Authorization: Basic base64(user:password)`), NÃO usa o login da plataforma.
- Username de API começa com domínio da base + hífen (ex.: `construtoralegal-meuusuario`).
- Senha é mostrada uma única vez na criação, não é resetável (apenas regerável).
- Webhooks Sienge têm timeout de resposta de 2.5s — retry automático se exceder.
- Headers de webhook: `x-sienge-tenant`, `x-sienge-event`, `x-sienge-hook-id`, `x-sienge-id`.
