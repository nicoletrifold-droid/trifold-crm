# Story 31.2 — API: Upload com Pendência + Aprovação + Notificações por Email

## Status: Done

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run lint", "npm run type-check", "curl API tests"]

## Story

**Como** usuário com perfil `obras`,
**Quero** que meus uploads de fotos e documentos entrem em fila de aprovação,
**Para que** administradores e supervisores validem o conteúdo antes de qualquer publicação.

## Contexto

Segunda story do Epic 31. Depende da migration `033_obra_upload_aprovacoes.sql` (Story 31.1 — Done).

Hoje, quando qualquer role faz upload, o arquivo vai direto para `obra_fotos` ou `obra_documentos` e é publicado imediatamente. Esta story bifurca esse fluxo:

- **Role `obras`**: upload salvo no Storage → registro em `obra_upload_aprovacoes` com `status = 'pendente'` → email disparado para todos os admins/supervisors da org
- **Role `admin` ou `supervisor`**: comportamento atual mantido (publicação direta)

Após a revisão (aprovação ou rejeição):
- **Aprovado**: dados migrados de `obra_upload_aprovacoes` para `obra_fotos`/`obra_documentos` → email de confirmação ao usuário obras
- **Rejeitado**: arquivo removido do Storage + motivo registrado → email de rejeição ao usuário obras

A Story 31.3 cria a UI que consome estas rotas.

## Acceptance Criteria

- [ ] AC1: `POST /api/admin/obras/[obra_id]/fotos` — se `appUser.role === 'obras'`, NÃO insere em `obra_fotos`; insere em `obra_upload_aprovacoes` com `tipo='foto'`, `status='pendente'`, `enviado_por=appUser.id`, `metadata={caption, fase_id, taken_at}`. Retorna `{ aprovacao: { id, status: 'pendente' } }` com status HTTP 201.
- [ ] AC2: `POST /api/admin/obras/[obra_id]/documentos` — se `appUser.role === 'obras'`, NÃO insere em `obra_documentos`; insere em `obra_upload_aprovacoes` com `tipo='documento'`, `status='pendente'`, `metadata={name, filename, category, file_size_bytes}`. Retorna `{ aprovacao: { id, status: 'pendente' } }` com status HTTP 201.
- [ ] AC3: Upload por `admin` ou `supervisor` nas mesmas rotas continua com comportamento original (inserção direta em `obra_fotos`/`obra_documentos`). Zero regressão.
- [ ] AC4: Após inserção em `obra_upload_aprovacoes` (role `obras`), disparar email **fire-and-forget** para todos os usuários `admin` e `supervisor` da mesma org. Query: `SELECT u.name, u.email FROM users u WHERE u.org_id = $orgId AND u.role IN ('admin', 'supervisor') AND u.email IS NOT NULL`. Email via `sendEmail()` de `@web/lib/email`.
- [ ] AC5: Template do email para admin/supervisor:
  - **Assunto:** `[Trifold] Nova pendência de aprovação — {obra_name}`
  - **Corpo:** Nome do usuário obras que enviou, tipo (foto/documento), nome da obra, link direto para a aba de aprovações: `/dashboard/obras/{obra_id}?tab=aprovacoes`
  - HTML simples (sem usar `sendTemplateEmail` — usar `sendEmail` direto com HTML inline para não criar dependência de template no banco)
- [ ] AC6: Nova rota `GET /api/admin/obras/[obra_id]/aprovacoes` — retorna todos os registros de `obra_upload_aprovacoes` da obra, ordenados por `created_at DESC`. Restrita a `admin` e `supervisor`. Inclui signed URL para preview (bucket `obra-fotos` ou `obra-docs`) via `createSignedUrl` com expiração de 3600s.
- [ ] AC7: Nova rota `PATCH /api/admin/obras/[obra_id]/aprovacoes/[id]` — aceita body `{ acao: 'aprovar' | 'rejeitar', motivo_rejeicao?: string }`. Restrita a `admin` e `supervisor`. Valida que `motivo_rejeicao` é obrigatório quando `acao === 'rejeitar'`.
- [ ] AC8: Lógica de aprovação (AC7, `acao === 'aprovar'`):
  1. Busca registro em `obra_upload_aprovacoes`
  2. Se `tipo === 'foto'`: insere em `obra_fotos` com os dados do `metadata` + `storage_path` + `uploaded_by = enviado_por`
  3. Se `tipo === 'documento'`: insere em `obra_documentos` com os dados do `metadata` + `storage_path` + `uploaded_by = enviado_por`
  4. Atualiza `obra_upload_aprovacoes` SET `status='aprovado'`, `aprovado_por=appUser.id`, `reviewed_at=now()`
  5. Retorna `{ ok: true, status: 'aprovado' }`
- [ ] AC9: Lógica de rejeição (AC7, `acao === 'rejeitar'`):
  1. Busca registro em `obra_upload_aprovacoes`
  2. Remove arquivo do Supabase Storage: `supabase.storage.from(storage_bucket).remove([storage_path])`
  3. Atualiza `obra_upload_aprovacoes` SET `status='rejeitado'`, `aprovado_por=appUser.id`, `reviewed_at=now()`, `motivo_rejeicao=motivo`
  4. Retorna `{ ok: true, status: 'rejeitado' }`
- [ ] AC10: Após aprovação ou rejeição (AC8/AC9), disparar email **fire-and-forget** para o usuário obras que enviou (`enviado_por`). Query: `SELECT u.name, u.email FROM users u WHERE u.id = $enviado_por AND u.email IS NOT NULL`.
- [ ] AC11: Template do email de resultado para usuário obras:
  - **Aprovado** — Assunto: `[Trifold] Seu upload foi aprovado — {obra_name}` / Corpo: confirmação de que o arquivo foi publicado
  - **Rejeitado** — Assunto: `[Trifold] Seu upload foi rejeitado — {obra_name}` / Corpo: motivo da rejeição informado pelo revisor
- [ ] AC12: Nova rota `GET /api/admin/obras/aprovacoes/pendentes` — retorna `{ total: number }` com a contagem de registros `status='pendente'` em toda a org do usuário autenticado. Restrita a `admin` e `supervisor`. Usada pelo badge na sidebar (Story 31.3).
- [ ] AC13: `logAudit()` chamado nas ações de aprovação e rejeição com `action: 'aprovacao.aprovar'` ou `'aprovacao.rejeitar'` e `entity_type: 'obra_upload_aprovacao'`.
- [ ] AC14: Nenhuma das rotas novas/modificadas retorna dados de outras orgs (isolamento por `org_id` em todas as queries).

## Escopo

**IN:**
- Modificação das rotas POST de fotos e documentos (bifurcação por role)
- 3 novas rotas: GET aprovacoes por obra, PATCH review, GET pendentes globais
- Emails de notificação (fire-and-forget via Resend)
- Audit log nas ações de aprovação/rejeição

**OUT:**
- UI (Story 31.3)
- Push notifications (fora do escopo deste epic)
- Workflow de aprovação para mensagens de obras
- Alteração do comportamento de upload do portal do cliente

## Dependências

- **Requer:** Story 31.1 Done — tabela `obra_upload_aprovacoes` existente no banco
- **Bloqueia:** Story 31.3 (UI consome estas rotas)
- **Libs utilizadas:** `@web/lib/email` (`sendEmail`), `@web/lib/audit` (`logAudit`), `@web/lib/api-auth` (`requireAuth`)

## Dev Notes

### Bifurcação nas rotas existentes

```typescript
// packages/web/src/app/api/admin/obras/[obra_id]/fotos/route.ts — POST
// Após validação e upload para o Storage (lógica atual permanece):

if (appUser.role === "obras") {
  // Inserir em obra_upload_aprovacoes em vez de obra_fotos
  const { data: aprovacao, error: insertError } = await supabase
    .from("obra_upload_aprovacoes")
    .insert({
      org_id: appUser.org_id,
      obra_id,
      tipo: "foto",
      storage_path: storagePath,
      storage_bucket: "obra-fotos",
      metadata: { caption, fase_id: faseId, taken_at: takenAt },
      enviado_por: appUser.id,
    })
    .select("id, status")
    .single()

  if (insertError) {
    await supabase.storage.from("obra-fotos").remove([storagePath])
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Fire-and-forget: notificar admins/supervisors
  notificarAdminsNovoUpload({ supabase, orgId: appUser.org_id, obraName: obra.name, obraId: obra_id, tipoUpload: "foto", nomeEnviador: appUser.name, obraUploadId: aprovacao.id }).catch(() => {})

  return NextResponse.json({ aprovacao }, { status: 201 })
}

// Role admin/supervisor: comportamento original abaixo
```

### Nova rota de revisão

```
PATCH /api/admin/obras/[obra_id]/aprovacoes/[id]
Body: { acao: "aprovar" | "rejeitar", motivo_rejeicao?: string }
```

Criar em: `packages/web/src/app/api/admin/obras/[obra_id]/aprovacoes/[id]/route.ts`

### Rota global de pendentes

```
GET /api/admin/obras/aprovacoes/pendentes
Response: { total: number }
```

Criar em: `packages/web/src/app/api/admin/obras/aprovacoes/pendentes/route.ts`

### Helper de email (extrair função separada no próprio arquivo da rota)

```typescript
async function notificarAdminsNovoUpload(params: {
  supabase: SupabaseClient,
  orgId: string,
  obraName: string,
  obraId: string,
  tipoUpload: "foto" | "documento",
  nomeEnviador: string,
  obraUploadId: string,
}) {
  const { data: admins } = await params.supabase
    .from("users")
    .select("name, email")
    .eq("org_id", params.orgId)
    .in("role", ["admin", "supervisor"])
    .not("email", "is", null)

  if (!admins?.length) return

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/obras/${params.obraId}?tab=aprovacoes`

  await Promise.allSettled(
    admins.map((u) =>
      sendEmail({
        to: u.email!,
        subject: `[Trifold] Nova pendência de aprovação — ${params.obraName}`,
        html: `<p>Olá ${u.name},</p>
               <p><strong>${params.nomeEnviador}</strong> enviou ${params.tipoUpload === "foto" ? "uma foto" : "um documento"} para a obra <strong>${params.obraName}</strong> aguardando sua aprovação.</p>
               <p><a href="${link}">Clique aqui para revisar</a></p>`,
      })
    )
  )
}
```

### Lógica de aprovação — inserção em obra_fotos

```typescript
// Ao aprovar, buscar dados da aprovacao e inserir na tabela correta:
if (aprovacao.tipo === "foto") {
  await supabase.from("obra_fotos").insert({
    obra_id: aprovacao.obra_id,
    org_id: aprovacao.org_id,
    uploaded_by: aprovacao.enviado_por,
    storage_path: aprovacao.storage_path,
    caption: aprovacao.metadata?.caption ?? null,
    fase_id: aprovacao.metadata?.fase_id ?? null,
    taken_at: aprovacao.metadata?.taken_at ?? null,
  })
} else {
  await supabase.from("obra_documentos").insert({
    obra_id: aprovacao.obra_id,
    org_id: aprovacao.org_id,
    uploaded_by: aprovacao.enviado_por,
    storage_path: aprovacao.storage_path,
    name: aprovacao.metadata.name,
    filename: aprovacao.metadata.filename,
    category: aprovacao.metadata.category,
    file_size_bytes: aprovacao.metadata.file_size_bytes,
  })
}
```

### Signed URL para preview (AC6)

```typescript
const { data: signedUrl } = await supabase.storage
  .from(aprovacao.storage_bucket)
  .createSignedUrl(aprovacao.storage_path, 3600)
```

## Tasks / Subtasks

- [x] Task 1 (AC1, AC3): Modificar `POST /api/admin/obras/[obra_id]/fotos/route.ts` — bifurcar por role, inserir em `obra_upload_aprovacoes` se `obras`, manter fluxo atual para `admin`/`supervisor`
- [x] Task 2 (AC2, AC3): Modificar `POST /api/admin/obras/[obra_id]/documentos/route.ts` — mesma bifurcação
- [x] Task 3 (AC4, AC5): Implementar helper `notificarAdminsNovoUpload` e chamar fire-and-forget nas duas rotas modificadas
- [x] Task 4 (AC6): Criar `GET /api/admin/obras/[obra_id]/aprovacoes/route.ts` com signed URLs
- [x] Task 5 (AC7, AC8, AC9): Criar `PATCH /api/admin/obras/[obra_id]/aprovacoes/[id]/route.ts` com lógica de aprovação e rejeição
- [x] Task 6 (AC10, AC11): Implementar emails de resultado (aprovado/rejeitado) no handler de review
- [x] Task 7 (AC12): Criar `GET /api/admin/obras/aprovacoes/pendentes/route.ts`
- [x] Task 8 (AC13): Adicionar `logAudit` nas ações de aprovação e rejeição
- [x] Task 9 (AC14): Revisar isolamento de org_id em todas as queries novas/modificadas

## Checklist Pré-Commit

- [ ] Role `obras` não consegue chamar o endpoint de review (PATCH) — retorna 403
- [ ] Upload de admin/supervisor nas rotas existentes continua publicando diretamente (sem regressão)
- [ ] Emails disparados de forma fire-and-forget (não bloqueiam a resposta HTTP)
- [ ] Storage rollback em caso de falha na inserção do banco (padrão já existente nas rotas)
- [ ] `org_id` validado em todas as queries
- [ ] `npm run lint` e `npm run type-check` passando

## 🤖 CodeRabbit Integration

**Story Type Analysis:**
- Primary Type: API/Backend
- Secondary Type(s): Email notifications
- Complexity: High (bifurcação de fluxo existente + novas rotas + emails)

**Specialized Agent Assignment:**
- Primary Agents: @dev
- Supporting Agents: N/A

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Testar bifurcação de role manualmente via curl ou Postman
- [ ] Pre-PR (@devops): Confirmar que lint e type-check passam

**CodeRabbit Focus Areas:**
- Isolamento de org_id em todas as queries novas
- Regressão no upload de admin/supervisor (comportamento original preservado)
- Fire-and-forget correto (não bloqueia resposta)
- Rollback de storage em caso de erro

**Self-Healing Configuration:**
- Primary Agent: @dev (light mode)
- Max Iterations: 2
- Severity Filter: CRITICAL, HIGH

## File List

- `packages/web/src/app/api/admin/obras/[obra_id]/fotos/route.ts` — modificado: bifurcação por role, helper email, rollback
- `packages/web/src/app/api/admin/obras/[obra_id]/documentos/route.ts` — modificado: bifurcação por role, helper email, rollback
- `packages/web/src/app/api/admin/obras/[obra_id]/aprovacoes/route.ts` — criado: GET lista pendentes com signed URLs
- `packages/web/src/app/api/admin/obras/[obra_id]/aprovacoes/[id]/route.ts` — criado: PATCH aprovar/rejeitar + emails + audit
- `packages/web/src/app/api/admin/obras/aprovacoes/pendentes/route.ts` — criado: GET contagem global de pendentes

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-05-25 | @sm (River) | Story criada — Draft |
| 2026-05-25 | @po (Pax) | Validação 10-pt: 8/10 GO — confirmado campo `users.id` correto para `enviado_por`; status → Ready |
| 2026-05-25 | @dev (Dex) | Implementação completa — 5 arquivos (2 modificados, 3 criados) — status → Ready for Review |
