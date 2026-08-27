---
name: coderabbit-review
description: |
  Execução unificada do CodeRabbit CLI (macOS, Linux e Windows/WSL) com self-healing loop.
  Use ao rodar review automatizado antes de commits, PRs ou quality gates.
  Detecta plataforma e binário, filtra severidade e itera auto-fix.
  NÃO é o gatilho de review do repo — esse é o GitHub App (ver .claude/rules/coderabbit-integration.md).
user-invocable: true
argument-hint: "[scope: uncommitted|committed|base]"
---

# CodeRabbit Review

Execução centralizada do CodeRabbit **CLI** — feedback local antes de abrir PR.

> ⚠️ **Isto não é o gatilho de review do repositório.** O review automático dos PRs é o
> **GitHub App** (`.coderabbit.yaml` + instalação no repo), que roda no servidor e independe
> do SO. Esta skill é o complemento local, e é **por máquina**.
> Ver `.claude/rules/coderabbit-integration.md`.

## Passo 0 — Detectar plataforma e binário (SEMPRE primeiro)

A versão anterior desta skill assumia WSL e trazia um caminho absoluto de outra máquina e
de outro projeto. Em macOS/Linux ela falhava sempre, e na prática o CodeRabbit não rodou em
nenhuma etapa das stories desenvolvidas em Mac (constatado na Story 90-1).

```bash
uname -s                        # Darwin | Linux | MINGW*/MSYS* (Git Bash no Windows)
command -v coderabbit           # binário no PATH?
ls ~/.local/bin/coderabbit 2>/dev/null
```

| Resultado | O que fazer |
|---|---|
| `Darwin` ou `Linux` + binário encontrado | Chamada **direta**, sem wrapper `wsl` |
| `MINGW`/`MSYS` (Windows) + WSL disponível | Wrapper `wsl bash -c` |
| Binário **não** encontrado | **PARE.** Registre "CodeRabbit não executado — binário ausente nesta plataforma" no gate/story e siga. NUNCA reporte como executado nem como "passou". Instalar o CLI é decisão do dono da máquina. |

**Autenticação** (só quando o binário existe): `coderabbit auth status` — ou, no Windows,
`wsl bash -c '~/.local/bin/coderabbit auth status'`.

⚠️ **Não use `timeout`.** Ele não existe no macOS por padrão, e
`timeout 900 <cmd> | grep -c erro` retorna 0 porque o comando nem executa — falso verde já
registrado na Story 90-1. Use o parâmetro `timeout` do Bash tool e confira o exit code.

## Execution

### 1. Determine Scope

Parse `$ARGUMENTS` to determine review scope:

| Argument | Command | Use Case |
|----------|---------|----------|
| `uncommitted` (default) | `--prompt-only -t uncommitted` | Pre-commit review |
| `committed` | `--prompt-only -t committed --base main` | QA story review |
| `base {branch}` | `--prompt-only --base {branch}` | Pre-PR review against specific base |

### 2. Montar o comando conforme o Passo 0

O diretório é **a raiz do repositório atual** — nunca um caminho absoluto hardcoded.

```bash
# macOS / Linux (binário no PATH)
coderabbit {flags}

# macOS / Linux (binário em ~/.local/bin, fora do PATH)
~/.local/bin/coderabbit {flags}

# Windows — via WSL, convertendo o caminho do repo
wsl bash -c "cd \"$(wslpath -a "$(pwd)")\" && ~/.local/bin/coderabbit {flags}"
```

**Timeout:** 15 minutos (900000 ms) no parâmetro do Bash tool — reviews levam 7-30 min.
Não envolva o comando em `timeout`.

### 3. Execute Review

Run the command via Bash tool with appropriate timeout.

### 4. Parse Results

Classify findings by severity:

| Severity | Action |
|----------|--------|
| **CRITICAL** | Must fix immediately — blocks completion |
| **HIGH** | Recommend fix before merge |
| **MEDIUM** | Document as technical debt |
| **LOW** | Optional improvement, note only |

### 5. Self-Healing Loop (if CRITICAL found)

```
iteration = 0
max_iterations = agent-specific (dev: 2, qa: 3, devops: 2)

WHILE iteration < max_iterations AND critical_issues_remain:
  1. Attempt auto-fix for each CRITICAL issue
  2. Re-run CodeRabbit review
  3. iteration++

IF critical_issues_remain after max_iterations:
  HALT and report to user
```

### 6. Report

Output a summary table:

```markdown
## CodeRabbit Review Results

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | N | Fixed/Remaining |
| HIGH | N | Documented |
| MEDIUM | N | Tech debt |
| LOW | N | Noted |

**Decision:** PASS / FAIL
```

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `coderabbit: command not found` | Binário ausente nesta plataforma | Registrar "não executado" e seguir. Instalação é decisão do dono da máquina (`curl -fsSL https://cli.coderabbit.ai/install.sh \| sh` em macOS/Linux) |
| Timeout (>15 min) | Large review | Increase timeout, review is still processing |
| `not authenticated` | Auth expirada | `coderabbit auth status` (macOS/Linux) ou via `wsl bash -c` no Windows |

## Agent-Specific Configuration

| Agent | Max Iterations | Severity Filter | Trigger |
|-------|---------------|-----------------|---------|
| @dev | 2 | CRITICAL only | Pre-commit (story completion) |
| @qa | 3 | CRITICAL + HIGH | Story review start |
| @devops | 2 | CRITICAL + HIGH | Pre-push / Pre-PR |

## Report Location

Save reports to: `docs/qa/coderabbit-reports/`
