# Sienge API — Overview, Autenticação e Rate Limits

## Autenticação

**Tipo:** HTTP Basic Auth

**Como obter credenciais:**
1. Acessa Sienge → **Integrações > APIs > Usuários de APIs** (requer admin)
2. Cria usuário técnico (separado do login humano)
3. Libera os recursos necessários por recurso (princípio de menor privilégio)
4. Marcar "senha nunca expira" para evitar quebra silenciosa da integração

**Header:**
```
Authorization: Basic <base64(username:password)>
```

**Exemplo Node.js:**
```typescript
const credentials = Buffer.from(`${username}:${password}`).toString('base64')

const response = await fetch(url, {
  headers: {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  }
})
```

## Base URLs

```
REST:  https://api.sienge.com.br/{subdomain}/public/api/v1/{recurso}
BULK:  https://api.sienge.com.br/{subdomain}/public/api/bulk-data/v1/{recurso}
```

**subdomain** = parte antes de `.sienge.com.br` na URL do cliente
- Ex: cliente acessa `https://construtora.sienge.com.br` → subdomain = `construtora`

**Exemplo completo:**
```
GET https://api.sienge.com.br/construtora/public/api/v1/customers
```

## Rate Limits

| API | Limite | Ação ao exceder |
|-----|--------|----------------|
| REST | **200 req/min** | HTTP 429 |
| BULK | **20 req/min** | HTTP 429 |

**CRÍTICO:** O rate limit é **por subdomain (tenant)**, não por integração. Se o cliente Sienge já usa CV CRM, BI tools ou outras integrações, TODAS disputam o mesmo pool de 200 req/min.

**Paginação REST:** máximo 200 registros por request.

## Quotas Diárias por Plano

| Plano | REST/dia | Bulk/dia |
|-------|----------|----------|
| Free | 100 | 10 |
| Start | ~1.000 | — |
| Ultimate | até 75.000 | até 28.800 |

Bulk Data só disponível no plano **Ultimate**.

## Backoff Exponencial (implementar sempre)

```typescript
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options)

    if (response.status === 429) {
      if (attempt === maxRetries) throw new Error('Rate limit exceeded after retries')
      const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay))
      continue
    }

    return response
  }
}
```

## Erros Comuns

| Status | Causa | Solução |
|--------|-------|---------|
| 401 | Senha expirada ou usuário desativado | Recriar credenciais no portal Sienge |
| 403 | Recurso não liberado para o usuário de API | Admin Sienge libera o recurso específico |
| 404 | Recurso não existe ou subdomain errado | Verificar subdomain e ID do recurso |
| 429 | Rate limit atingido | Backoff exponencial + queue |
| 5xx | Instabilidade Sienge | Retry com backoff + alertar |

## Sem Sandbox

Sienge não tem ambiente de staging documentado. Testes devem ser feitos em produção do cliente usando empreendimentos/unidades prefixados com `ZZZ-TEST` para fácil identificação e limpeza posterior.
