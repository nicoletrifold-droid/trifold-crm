# Story 75-329 — Checagem de drift: produção está servindo o commit da `main`?

**Story ID:** 75-329 · **Status:** InReview · **Estimativa:** XS (~1 pt)
**Fluxo:** @sm → @po GO → @dev → @qa → @devops · **Pedido do Marcos (17/08)**

## O relato e o diagnóstico

Em 17/08/2026, três merges seguidos (#432, #433, #434) **não geraram deploy de produção**.
O CRM continuou servindo o build da véspera. Nada falhou de forma visível: nenhum erro,
nenhum build vermelho, nenhum alerta. Marcos só descobriu porque estranhou um número no
Analytics — o funil mostrava `7` (código antigo) onde deveria mostrar `16`.

**A causa não era a integração**, como eu havia concluído no começo (e recomendado
reconectar — errado). Era um **incidente do GitHub**: `githubstatus.com` registrou
"Incident with GitHub.com" (critical) começando às **13:40 UTC / 10:40 BRT**, com
**Webhooks em `partial_outage`**. Os merges foram 10:46 e 11:15 BRT, dentro da janela.
Sendo *partial*, alguns previews da mesma tarde subiram normalmente — o que faz o defeito
parecer configuração quando é indisponibilidade.

Conferido e descartado do nosso lado: `link` do projeto íntegro (repoId, credencial,
`productionBranch: main`), sem *Ignored Build Step*, projeto não pausado, `vercel.json`
sem `git.deploymentEnabled` desligado.

O que a story fecha não é a causa (que é externa e vai se repetir): é o **silêncio**.

## O que mudou

`scripts/check-deploy-drift.sh` (+ `npm run deploy:check` / `deploy:fix`) compara o commit
que a produção está servindo com o `HEAD` da `main`:

- **Não usa a API do GitHub, de propósito** — o cenário que ele existe para detectar é
  justamente o GitHub indisponível. O lado do git vem de `git fetch` (git-over-https, que
  sobreviveu ao incidente); o lado da produção, da API da Vercel.
- Compara com o deploy **`state=READY` + `target=production`**, não com o último criado:
  um build em andamento ou com erro não é quem responde ao usuário.
- **Divergência só de documentação não alerta.** Commit de story Done, memória ou script
  SQL não muda o que a Vercel serve; alertar neles treinaria o leitor a ignorar o alerta,
  que é como um alarme morre. Classifica por caminho (`docs/`, `.claude/`, `scripts/`,
  `*.md`, `*.sql`) e diz quantos arquivos de app ficaram fora do ar.
- `--fix` dispara o deploy de produção a partir do SHA da `main`, pelo mesmo caminho que a
  integração usaria (`gitSource`, não upload local — que ignoraria o monorepo/rootDirectory).
- Sem credencial ou sem remoto acessível, sai com **código 2 e sem veredito**, em vez de
  fingir que está tudo bem.

Códigos de saída: `0` em dia (ou drift só de doc) · `1` divergiu · `2` não deu para checar.

## Escopo: o que NÃO entrou

Uma checagem **desassistida** (que avise sozinha, sem alguém rodar) precisaria de um dos
dois, e nenhum era possível fechar hoje com o GitHub fora:

1. GitHub Action pós-merge que confere e se auto-corrige — precisa de um secret
   `VERCEL_TOKEN` no repo (a API do GitHub estava devolvendo 503).
2. Cron no app (`/api/cron/deploy-drift`) no padrão do `webhook-health`, com
   `sendTelegramAdminAlert` — precisa de um token do GitHub nas envs da Vercel para
   descobrir o `HEAD` da `main`.

Minha recomendação é a **(1)**: ela não só avisa, ela conserta. Fica para quando o GitHub
voltar.

## Evidências

Testado contra os dois cenários reais do dia:

| Intervalo | Arquivos | De app | Veredito |
|---|---|---|---|
| `d2984173..3fd967da` (código da 75-328) | 11 | 4 | **alerta** ✓ |
| `3fd967da..220f0231` (story Done) | 1 | 0 | silencioso ✓ |

Execução ao vivo detectou corretamente o estado atual do repo (produção em `3fd967da`,
`main` em `220f0231`, diferença só de documentação → `exit 0`).
