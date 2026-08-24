---
name: project-vercel-prod-quebrada-schema-snapshot
description: Desde 2026-08-23 (Story 900-14) TODO deploy Vercel de trifold-crm falha — packages/web importa docs/audits/schema-snapshot.json, que o .vercelignore exclui
metadata:
  type: project
---

Todos os deploys da Vercel (Preview **e** Production) de `trifold-crm` falham desde o merge da Story 900-14 (`bb7f240e`, PR #489, 2026-08-23 14:59 -03) com:

```
@trifold/web:build: Type error: Cannot find module '../../../../../docs/audits/schema-snapshot.json'
```

`packages/web/src/lib/supabase/org-scoped-admin.ts:33` faz `import schemaSnapshot from "../../../../../docs/audits/schema-snapshot.json"`, mas `packages/web/.vercelignore` lista `docs` — o arquivo não sobe para o build.

**Why:** É a interação entre o `rootDirectory: packages/web` (ver [[project-vercel-setup]]) e um import estático que sai do pacote. Local, `pnpm build` passa 5/5 porque `docs/` existe no working tree; na Vercel o upload não tem `docs/`. Consequência que ninguém notou por ~1 dia: **nada de `main` chegou a produção desde a 900-14** (Story 75-366, 900-11, 900-14 incluídas) — os checks vermelhos da Vercel nos PRs #489-#492 são todos esta mesma causa, e os PRs foram mergeados com o check vermelho.

**How to apply:**
- Ao abrir/mergear PR neste repo, NÃO trate o check `Vercel – trifold-crm` vermelho como problema do PR sem antes conferir a mensagem: se for este `Cannot find module`, é dívida da `main`.
- **Verifique se ainda vale** antes de citar: `npx vercel ls trifold-crm --scope trifold-s-projects` (Production `● Ready` = já foi corrigido, apague esta memória) e `grep -rn schema-snapshot packages/web/src`.
- Correção pertence ao Epic 900 / @dev, não ao @devops: tirar `docs` do `packages/web/.vercelignore`, mover o snapshot para dentro de `packages/web`, ou carregá-lo só no script/gate sem `import` estático no código de aplicação.
- Existem DOIS times Vercel conectados ao repo (`trifold-s-projects` e `freelans-projects-d9ab20e0`); o CLI local só autentica no primeiro. Deployment id do outro time não é inspecionável daqui.

Reforça [[feedback-quality-gate-signals]]: `pnpm build` local verde não garante deploy verde quando o import atravessa a fronteira do pacote.
