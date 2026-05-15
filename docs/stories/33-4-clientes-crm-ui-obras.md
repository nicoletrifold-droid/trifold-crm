# Story 33.4 — UI Obras: Integração CRM na ClientesTab

## Status: Ready for Review

## Executor Assignment
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["npm run typecheck", "npm run lint", "browser test"]

## Story

**Como** administrador do Trifold CRM,
**Quero** que ao vincular um usuário a uma obra pelo email, o sistema verifique automaticamente se esse email existe no cadastro CRM,
**Para que** eu tenha visibilidade imediata do histórico CRM do comprador antes de criar o acesso ao portal.

## Contexto

Depende da Story 33.2 (API — em especial `GET /api/admin/clientes/search?email=...`).

**Arquivo a modificar:** `packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx`

Esta story NÃO remove nem altera o fluxo atual de vinculação de portal-users (`users.role = 'cliente'` + `cliente_obras`). Apenas acrescenta um enriquecimento de informação: quando o usuário busca por email para vincular ao portal, o sistema faz um lookup paralelo no CRM para exibir informação contextual.

**Fluxo atual (não alterar):**
1. Formulário A: criar novo usuário (nome + email + senha temporária) → cria `user` + `cliente_obras`
2. Formulário B: vincular por email → busca `user` existente com `role = 'cliente'` → cria `cliente_obras`

**Adição desta story:** inserir lookup CRM antes do passo de busca do formulário B.

## Acceptance Criteria

- [x] AC1: No formulário B (vincular por email), ao sair do campo de email (onBlur) OU ao clicar em "Buscar", o sistema faz `GET /api/admin/clientes/search?email={email}` de forma assíncrona (não bloqueia o fluxo existente)
- [x] AC2: Se encontrar cliente CRM com o email: exibe banner laranja informativo abaixo do campo de email com texto "✓ Cliente CRM encontrado: {nome} — {obra_nome} {numero_unidade}" (se tiver vínculo com obras) ou "✓ Cliente CRM encontrado: {nome} — sem obras vinculadas" (sem vínculos)
- [x] AC3: Se o cliente CRM tiver múltiplas obras vinculadas, o banner exibe: "✓ Cliente CRM encontrado: {nome} — {N} obras vinculadas" (evitar banner muito longo)
- [x] AC4: Se não encontrar cliente CRM: nenhum banner exibido (silêncio — não interferir no fluxo atual)
- [x] AC5: Se a chamada à API falhar (erro de rede, 500, etc.): nenhum banner exibido e nenhum erro visível ao usuário (graceful degradation — o fluxo de vinculação de portal continua normalmente)
- [x] AC6: O banner CRM é exibido como informação complementar; não bloqueia nem altera o fluxo de criação de `user` ou `cliente_obras`
- [x] AC7: Se o formulário A (criar novo usuário) estiver vazio e o banner CRM exibir nome do cliente, o campo "Nome" do formulário A é pré-preenchido com o nome do cliente CRM via botão "Usar nome" (sugestão não obrigatória — usuário pode sobrescrever)
- [x] AC8: Banner CRM desaparece se o campo de email for limpo

## Escopo

**IN:**
- Modificação de `packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx`
- Adição de lookup assíncrono ao CRM no onBlur do campo email (formulário B)
- Exibição de banner informativo quando cliente CRM encontrado

**OUT:**
- Alteração no fluxo de criação de `user` ou `cliente_obras` (não alterar)
- Criação automática de vínculo CRM ao vincular portal-user (fora do escopo)
- Modificação em qualquer outra página ou componente
- Exibição de todos os dados do cliente CRM (apenas nome + obras para o banner)

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| Race condition: usuário altera email antes do response CRM chegar | Baixa | Cancelar request anterior com AbortController ou ignorar response se email mudou |
| Chamada CRM adicionando latência perceptível ao fluxo | Baixa | Chamada assíncrona não bloqueia o UI; banner aparece quando chega (pode ser após 200-500ms) |
| `clientes-tab.tsx` é server component — lookup CRM requer estado | Média | Verificar se é server ou client component; se for server, extrair a parte de busca CRM para sub-componente client |

## Dev Notes

### Arquivo alvo

```
packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx
```

Verificar se este arquivo é um client component (`"use client"`) ou server component antes de implementar. O lookup CRM requer `useState` e `fetch` no cliente, portanto o componente deve ser client component ou ter um sub-componente client.

### Lógica do lookup CRM

```typescript
// Estado para o banner CRM
const [clienteCRM, setClienteCRM] = useState<{
  id: string
  nome: string
  obras: { obra_id: string; obra_nome: string; numero_unidade: string | null }[]
} | null>(null)
const [emailBuscado, setEmailBuscado] = useState("")

// Handler do onBlur no campo email do formulário B
const handleEmailBlur = async (email: string) => {
  if (!email || email === emailBuscado) return
  setEmailBuscado(email)
  
  try {
    const res = await fetch(`/api/admin/clientes/search?email=${encodeURIComponent(email)}`)
    if (!res.ok) return // graceful degradation — AC5
    const { data } = await res.json()
    setClienteCRM(data?.[0] ?? null) // primeiro resultado da busca exata por email
  } catch {
    // Silêncio — AC5
  }
}

// Limpar banner se email for apagado — AC8
const handleEmailChange = (email: string) => {
  if (!email) {
    setClienteCRM(null)
    setEmailBuscado("")
  }
}
```

### Renderização do banner CRM (AC2, AC3)

```tsx
{clienteCRM && (
  <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm text-blue-800 dark:text-blue-300 mt-2">
    <span className="font-medium">Cliente encontrado no CRM:</span>{" "}
    {clienteCRM.nome}
    {clienteCRM.obras.length === 1 && (
      <> — {clienteCRM.obras[0].obra_nome}
        {clienteCRM.obras[0].numero_unidade && ` ${clienteCRM.obras[0].numero_unidade}`}
      </>
    )}
    {clienteCRM.obras.length > 1 && (
      <> — {clienteCRM.obras.length} obras vinculadas</>
    )}
  </div>
)}
```

### Pré-preenchimento do nome no formulário A (AC7)

Quando o banner CRM aparecer e o campo Nome do formulário A estiver vazio, chamar o setter do campo Nome:

```typescript
// Se formulário A tiver nome vazio, sugerir o nome do CRM
if (clienteCRM && !formANome) {
  setFormANome(clienteCRM.nome)
}
```

### Testing

```bash
npm run typecheck && npm run lint
# Browser: testar com email que existe no CRM, email que não existe, email inválido
# Verificar que fluxo de vinculação continua funcionando normalmente
```

## Tasks / Subtasks

- [x] Task 1: Analisar `clientes-tab.tsx` — verificar se é client component e identificar o campo email do formulário B (confirmado: `"use client"`)
- [x] Task 2: Adicionar estado `crmCliente` / `searchingCrm` / `emailBuscadoCrm` e handler `buscarClienteCrm` com lookup assíncrono à API CRM (AC1, AC4, AC5)
- [x] Task 3: Adicionar handler `handleEmailBChange` para limpar banner ao apagar email (AC8) — também invalida banner se usuário digitar email diferente do buscado
- [x] Task 4: Renderizar banner laranja suave abaixo do campo email quando `crmCliente` preenchido (AC2, AC3)
- [x] Task 5: Implementar pré-preenchimento do nome no formulário A via botão "Usar nome" (renderizado apenas se `nomeA` estiver vazio) (AC7)
- [x] Task 6: Verificar `npm run type-check && npm run lint` sem erros — 0 erros
- [ ] Task 7: Testar no browser (handoff @qa) — email com cliente CRM, email sem cliente, limpar campo, fluxo de vinculação intacto (AC6)

## File List

- `packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx` — modificado: adicionado enriquecimento CRM (state `crmCliente`/`searchingCrm`/`emailBuscadoCrm`, `crmAbortRef`, helper `isValidEmailFormat`, handlers `buscarClienteCrm`/`handleEmailBChange`/`handleUsarNomeCrm`, botão "Buscar no CRM" com ícone `Search` do lucide, banner laranja com botão "Usar nome", `onBlur` no campo email)

## Dev Agent Record

### Decisões de Implementação (YOLO)

- **Cor do banner:** Laranja suave (consistente com tema da página). Story original sugeria azul, mas user prompt direcionou para laranja/verde — escolhido laranja.
- **Race condition guard:** `AbortController` em `useRef` cancela request anterior em (1) nova busca, (2) email limpo, (3) usuário digita email diferente.
- **Validação de email:** Helper `isValidEmailFormat` exige >= 5 chars e contém `@` (formato `.+@.+`).
- **AC7 — pré-preenchimento:** Implementado como botão "Usar nome" (opt-in) ao invés de auto-fill. Renderizado condicionalmente apenas se `nomeA` estiver vazio — mantém o comportamento "não obrigatório, usuário pode sobrescrever".
- **Edge cases tratados:**
  - `obra_nome: null` da API (cliente CRM sem nome de obra) → exibe "obra sem nome"
  - `obras.length === 0` → exibe "sem obras vinculadas"
  - `res.ok === false` → silêncio (graceful degradation)
  - `AbortError` capturado pelo catch silencioso
- **IDS:** ADAPT in-place. Pesquisado em `configuracoes/clientes/_components/`, mas modal/lista não aplicável a banner inline. Single-file modification mantém escopo.

### Validação

```
npm run type-check  → 0 erros
npm run lint clientes-tab.tsx  → 0 erros
```

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> Quality validation usará processo de revisão manual.

### Story Type Analysis
- **Primary Type:** Frontend
- **Secondary Type:** Integration (consumo da rota 33.2)
- **Complexity:** Low (modificação pontual em componente existente, sem alteração de fluxo)

### Specialized Agent Assignment
- **Primary:** @dev
- **Supporting:** @qa (quality gate — verificar que fluxo existente não foi alterado)

### Quality Gate Tasks
- [ ] Pre-Commit (@dev): `npm run typecheck && npm run lint` sem erros
- [ ] Pre-Commit (@dev): Testar browser — fluxo de vinculação de portal-user funciona igual ao anterior
- [ ] Pre-PR (@devops): Revisar que nenhuma mudança breaking foi introduzida na ClientesTab

### CodeRabbit Focus Areas
- Graceful degradation: try/catch no fetch CRM; nenhum erro visível ao usuário se API falhar
- AC6: fluxo de criação de `user` e `cliente_obras` INALTERADO
- Race condition: verificar se email ainda é o mesmo quando response chega
- Dark mode: classes do banner com variantes `dark:`

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-05-15 | 1.0 | Story criada | @sm (River) |
| 2026-05-15 | 1.1 | Validada @po (GO 10/10). Status Draft → Ready. Arquivo `packages/web/src/app/dashboard/obras/[obra_id]/_components/clientes-tab.tsx` confirmado existe. AC6 preserva integralmente o fluxo de portal-users (critério "Zero regressão" do epic). | @po (Pax) |
| 2026-05-15 | 1.2 | Implementação YOLO concluída. Tasks 1-6 [x], todos AC1-AC8 atendidos. type-check + lint = 0 erros. Status Ready → Ready for Review (Task 7 browser test fica para @qa). | @dev (Dex) |
