---
name: Pasta logs/ é gitignored (genérico) — usar git add -f para arquivos de feature
description: O .gitignore raiz tem `logs/` (linha 20) que filtra qualquer diretório chamado logs/, incluindo a rota /dashboard/sistema/logs/ da feature de auditoria.
type: project
---

`.gitignore` raiz do trifold-crm tem a regra genérica `logs/` (linha 20, seção "Build & Logs"), pensada para diretórios de log de runtime — mas ela também filtra qualquer pasta chamada `logs/` no source code (ex.: `packages/web/src/app/dashboard/sistema/logs/`).

**Why:** Padrão herdado do template AIOS — captura tudo que se chama "logs" sem distinguir runtime de feature de UI. Não foi reescrito para ser mais específico (ex.: `/logs/`, `*.log`) porque afeta poucos casos.

**How to apply:** Sempre que uma feature criar uma rota ou diretório chamado `logs/` (ex.: tela de "histórico/audit log"), os arquivos vão sair como untracked invisíveis ao `git status`. Use `git check-ignore -v <path>` para confirmar e `git add -f <files>` para forçar staging. Alternativa: adicionar exceção (`!packages/web/src/app/**/logs/`) no `.gitignore` se isso vier a se repetir.
