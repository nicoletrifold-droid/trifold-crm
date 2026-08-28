---
paths:
  - ".aios-core/**"
  - "tests/**"
  - "packages/**"
  - "bin/**"
---

# CodeRabbit Integration — Detailed Rules

## Self-Healing Configuration

### Dev Phase (@dev — Story Development Cycle Phase 3)

```yaml
mode: light
max_iterations: 2
timeout_minutes: 30
severity_filter: [CRITICAL, HIGH]
behavior:
  CRITICAL: auto_fix
  HIGH: auto_fix (iteration < 2) else document_as_debt
  MEDIUM: document_as_debt
  LOW: ignore
```

**Flow:**
```
RUN CodeRabbit → CRITICAL found?
  YES → auto-fix (iteration < 2) → Re-run
  NO → Document HIGH as debt, proceed
After 2 iterations with CRITICAL → HALT, manual intervention
```

### QA Phase (@qa — QA Loop Pre-Review)

```yaml
mode: full
max_iterations: 3
timeout_minutes: 30
severity_filter: [CRITICAL, HIGH]
behavior:
  CRITICAL: auto_fix
  HIGH: auto_fix
  MEDIUM: document_as_debt
  LOW: ignore
```

**Flow:**
1. Pre-commit review scan
2. Self-healing loop (max 3 iterations)
3. Manual QA analysis (architectural, traceability, NFR)
4. Gate decision (verdict)

## Severity Handling Summary

| Severity | Dev Phase | QA Phase |
|----------|-----------|----------|
| CRITICAL | auto_fix, block if persists | auto_fix, block if persists |
| HIGH | auto_fix, document if fails | auto_fix, document if fails |
| MEDIUM | document_as_tech_debt | document_as_tech_debt |
| LOW | ignore | ignore |

## Gatilho PRIMÁRIO — GitHub App (automático, independe de máquina)

**O review automatizado deste repo é o GitHub App do CodeRabbit**, não o CLI. Ele
dispara sozinho quando um PR é aberto contra `main`, roda no servidor do CodeRabbit e
comenta no PR — sem depender do SO de quem desenvolveu.

- Config versionada: **`.coderabbit.yaml`** na raiz (`reviews.auto_review.enabled: true`,
  `base_branches: [main]`, `drafts: false`). As `path_instructions` cobrem
  `.aios-core/**`, `supabase/migrations/**`, os webhooks, `packages/ai/**`,
  `packages/web/src/lib/**` e `**/*.test.ts`.
- Requisito único: o **App instalado no repositório** (github.com/apps/coderabbitai).
  Sem a instalação, o `.coderabbit.yaml` é inerte — nenhum yaml supre isso.
- Como conferir se está ativo: abra um PR e veja se `coderabbitai` comenta/revisa.
  `gh pr view <n> --json reviews,comments` mostra os autores.

## CLI local (opcional, pré-commit)

O CLI é complemento — feedback antes de abrir PR — e é **por máquina**. NÃO é o gatilho.

⚠️ **O comando depende da plataforma.** A config histórica dos agentes assume WSL
(`installation_mode: wsl`), o que faz o CLI simplesmente não existir no macOS/Linux —
e, na prática, o CodeRabbit não rodou em nenhuma etapa das stories desenvolvidas em Mac
(constatado na Story 90-1). Detecte a plataforma antes de invocar:

```bash
# Descobrir a plataforma e o binário disponível
uname -s                 # Darwin = macOS | Linux | MINGW/MSYS = Git Bash no Windows
command -v coderabbit    # binário no PATH?
ls ~/.local/bin/coderabbit 2>/dev/null

# macOS / Linux — chamada direta (SEM wrapper wsl)
coderabbit review --uncommitted          # staged + edições locais
coderabbit review --committed --base main
coderabbit review --base-commit <sha>    # diff contra commit da branch atual
coderabbit review --agent                # findings estruturados p/ agente

# Windows — via WSL
wsl bash -c "cd \"$(wslpath -a \"$(pwd)\")\" && ~/.local/bin/coderabbit review --uncommitted"
```

**Se o binário não existir na máquina:** registrar "CodeRabbit não executado — binário
ausente nesta plataforma" no gate/story e seguir. **Nunca** reportar como executado, e
nunca reportar como "passou". Instalação do CLI é decisão do dono da máquina.

⚠️ **Flags:** `--prompt-only` e `-t <escopo>` **não existem** no CLI (verificado no 0.7.5). Eram
herança da config do AIOS. As flags reais estão acima; confirme com `coderabbit review --help`.
Não combine `--committed` com `--base-commit` — resolve para diff vazio e o review nunca completa.

⚠️ **Estado nesta máquina (2026-08-27):** CLI 0.7.5 instalado em `~/.local/bin/coderabbit` e
autenticado. Um review retroativo falhou com `Connection failed: WebSocket closed` após 60 min e
**não foi investigado** — o gatilho que vale é o App. Se o CLI falhar assim, registre "não
executado" e siga; não gaste a sessão nisso.

⚠️ **Nota sobre `timeout`:** `timeout` NÃO existe no macOS por padrão (é do coreutils do
GNU). `timeout 900 <cmd> | grep -c erro` retorna 0 porque o comando nem executa — falso
verde já registrado na Story 90-1. Confira o exit code de cada comando isoladamente em
vez de contar linhas de saída.

## Integration Points

| Workflow | Phase | Trigger | Agent |
|----------|-------|---------|-------|
| Story Development Cycle | 3 (Implement) | After task completion | @dev |
| QA Loop | 1 (Review) | At review start | @qa |
| Standalone | Any | `*coderabbit-review` command | Any |
| **Pull Request** | **Pós-push** | **Automático via GitHub App (gatilho principal)** | **— (bot)** |

## Focus Areas by Story Type

| Story Type | Primary Focus |
|-----------|--------------|
| Feature | Code patterns, test coverage, API design |
| Bug Fix | Regression risk, root cause coverage |
| Refactor | Breaking changes, interface stability |
| Documentation | Markdown quality, reference validity |
| Database | SQL injection, RLS coverage, migration safety |

## Report Location

CodeRabbit reports saved to: `docs/qa/coderabbit-reports/`

## Configuration Reference

| O quê | Onde | Observação |
|---|---|---|
| Config do **App** (o gatilho) | `.coderabbit.yaml` (raiz) | Versionada; é o que vale para o review automático |
| Config do **CLI** por agente | `.aios-core/development/agents/{dev,qa,devops}.md` → `coderabbit_integration` | L2 (extend-only); assume `installation_mode: wsl` |

⚠️ A versão anterior desta rule apontava para `.aios-core/core-config.yaml` na seção
`coderabbit_integration` — **essa chave não existe nesse arquivo** (verificado). A config
do CLI vive nas definições de agente; a do App, no `.coderabbit.yaml`.
