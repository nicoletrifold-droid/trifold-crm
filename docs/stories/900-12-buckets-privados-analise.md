
---

## Adendo de 2026-08-23 — dois achados do preparo da `900-12a`

### 1. O flip é mais seguro do que parecia

Três verificações que removem os riscos que eu supunha:

| Risco suposto | Verificado |
|---|---|
| banco guarda URL completa → flip quebra tudo | ❌ guarda **path** (`obras/{obra_id}/fotos/{arquivo}`); a URL é montada em runtime |
| URLs de foto já enviadas em e-mail/notificação | ❌ nenhuma — `grep` por `obra-fotos` em templates de e-mail volta vazio |
| cliente do portal sem `org_id` perderia acesso | ❌ **os 82 usuários `role='cliente'` têm `org_id`**, e `user_org_id()` resolve por `auth_id`, funcionando para qualquer role |

Restam **3 pontos de montagem de URL** (`obra-detail-tabs.tsx:812`, `fotos-grid.tsx:49`,
`cliente/[obra_id]/fotos/page.tsx:168`), todos usando concatenação de string.

### 2. ⚠️ A policy protege cross-TENANT, não cross-OBRA

`org_read_obra_fotos` (Story 900-11) exige que a obra pertença à org do chamador:

```sql
EXISTS (select 1 from obras b where b.id::text = (storage.foldername(name))[2]
        and b.org_id = public.user_org_id())
```

Isso fecha o vazamento entre empresas. **Mas não separa clientes dentro da mesma empresa:** um
cliente autenticado que descubra o path de uma obra alheia da mesma org consegue ler a foto — e,
depois do flip, conseguiria assinar a URL, porque é a policy que o Storage consulta antes de
assinar.

Hoje isso é irrelevante (o bucket é público, todo mundo lê tudo mesmo). **Depois do flip, passa a
ser o furo restante** — e seria fácil concluir que "as fotos estão protegidas" sem notar.

Existe `cliente_obra_ids()` no schema, feita exatamente para isso. A policy correta para este
bucket é condicional ao papel:

- **staff** (`obras.fotos_ver` ou equivalente): obras da própria org — o predicado atual;
- **cliente**: apenas as obras vinculadas a ele, via `cliente_obra_ids()`.

**Isto deve entrar na `900-12a`, não depois.** Flipar o bucket e deixar o refinamento para uma
story futura significa declarar "fotos protegidas" com um furo conhecido em aberto — e a diferença
entre cross-tenant e cross-obra é exatamente o tipo de nuance que some do relato quando o PR fecha.
