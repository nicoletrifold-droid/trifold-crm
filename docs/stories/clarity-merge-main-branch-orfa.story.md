# Story (Hotfix/Infra) — Resgatar Microsoft Clarity da branch órfã e trazer pra `main`

**Status:** Ready for Review
**Tipo:** Hotfix / Git hygiene / Infra-Deploy
**Epic:** N/A (avulsa — achado operacional do @devops durante deploy da Story 90-1, não é trabalho de SEO)
**Complexidade:** XS (nenhuma lógica nova — reconstituir 3 trechos já conhecidos e comprovadamente em produção; o trabalho real é git hygiene, não desenvolvimento)

## Executor Assignment
```
executor: "@dev"
quality_gate: "@qa"
quality_gate_tools: ["build/preview do trifold-design-system", "diff review contra produção (curl)", "validação de CSP header nas 4 rotas afetadas"]
```
Push, abertura de PR, merge em `main`, deploy e deleção da branch órfã são exclusivos do **@devops** (Regra Zero — git push/PR nunca fora de `@devops`).

## Contexto

O site institucional `trifold.eng.br` (código em `landing-pages/trifold-design-system/`) está rodando o
**Microsoft Clarity** (analytics/heatmap, projeto `y0vgmebu2t`) **ao vivo em produção agora** — confirmado
via `curl` na Home, em `/vindresidence/` e no header `Content-Security-Policy` das rotas afetadas.

O problema: esse trabalho **nunca foi mergeado em `main`**. Os 2 commits que o introduzem estão presos na
ponta da branch `feat/86-12-yarden-conteudo-definitivo` — uma branch da Story 86-12 (Yarden: conteúdo,
Pixel/CAPI) cujo trabalho principal **já foi mergeado em `main` há tempos**, em duas PRs distintas
(`#512` e `#553`, ambas squash-merged). Depois desses merges, em **2026-09-01**, dois commits novos foram
adicionados **direto na ponta dessa mesma branch já mergeada**, sem PR:

| Commit | Data | O que faz |
|--------|------|-----------|
| `8cf64d90` | 2026-09-01 17:02:59 -0300 | `feat(landing): instala Microsoft Clarity na Home e na landing Vind Residence` — injeta o snippet do Clarity no `<head>` de `Home.dc.html` e de `landing-pages/vind-residence/index.html`; libera `www.clarity.ms` na CSP (`script-src`/`connect-src`) do `vercel.json`. |
| `b4e7c8d3` | 2026-09-01 17:20:28 -0300 | `fix(landing): corrige CSP do Microsoft Clarity para *.clarity.ms` — o Clarity real carrega de `scripts.clarity.ms`, envia dados a `h.clarity.ms` e usa pixel em `c.clarity.ms`; troca `www.clarity.ms` por wildcard `https://*.clarity.ms` em `script-src`/`connect-src` e acrescenta em `img-src`, nos 4 blocos de CSP afetados (as 3 rotas `/vindresidence*` + o bloco catch-all que cobre Home/Sobre Nós/Empreendimentos/Corporativas/Blog). Yarden é explicitamente excluído do catch-all e não ganha Clarity. |

Nenhum PR foi aberto pra esses 2 commits (`gh pr list --head feat/86-12-yarden-conteudo-definitivo` não
retorna nada). A branch está **pushed em `origin`**, mas `main` não tem ideia de que o Clarity existe.

**Risco concreto, já confirmado pelo @devops:** ao fazer o deploy da Story 90-1, o @devops quase publicou uma
versão de `main` que **removeria o Clarity de produção sem avisar** (porque `main` nunca recebeu essas
mudanças). Ele evitou isso na hora usando a árvore de trabalho que já tinha o Clarity, em vez de uma cópia
limpa de `main` — mas isso **não é sustentável**: qualquer próximo deploy do site institucional feito a
partir de uma branch/worktree limpa de `main` vai apagar o Clarity de produção de novo, silenciosamente,
até esse trabalho ser mergeado como deveria.

## Investigação já feita (SM, 2026-09-03)

1. **Commits identificados e datados** — ver tabela acima. Ambos em `feat/86-12-yarden-conteudo-definitivo`,
   autor `lucaspradog`.
2. **Diff exato contra `origin/main` (estado atual, já com as Stories 90-1/90-6 mergeadas) é limpo** — para
   os 3 arquivos afetados (`Home.dc.html`, `vercel.json`, `landing-pages/vind-residence/index.html`), o
   `git diff origin/main feat/86-12-yarden-conteudo-definitivo -- <esses 3 arquivos>` mostra **somente** o
   snippet do Clarity + os acréscimos de CSP — nada mais. O commit `8cf64d90` originalmente mencionava ter
   "carregado" hunks pré-existentes da Epic 90 (URLs limpas) que estavam no working tree na hora — mas como
   essas mudanças da Epic 90 já foram mergeadas em `main` por outro caminho (Story 90-6), elas **não aparecem
   mais no diff** contra o `main` atual. Ou seja: hoje, o diff relevante é 100% Clarity, sem resíduo.
3. **Nenhum lixo não relacionado seria arrastado** — a branch inteira (`feat/86-12-yarden-conteudo-definitivo`)
   tem só 13 commits únicos que não estão em `origin/main`; os outros 11 (fora os 2 do Clarity) são todo o
   histórico granular da Story 86-12 (conteúdo Yarden, CodeRabbit fixes, checkbox de privacidade etc.) —
   conteúdo que **já está em `main`**, só que via squash-merge (PRs `#512` e `#553`), então os SHAs não batem
   mas o conteúdo já está lá. Confirmado comparando `docs/stories/86-12-pixel-capi-landing-yarden.story.md`
   e os arquivos de `landing-pages/yarden/` — já presentes em `origin/main`.
4. **Produção bate exatamente com os commits da branch — sem divergência manual.** `curl` na Home, em
   `/vindresidence/` e nos headers CSP de `/`, `/vindresidence/` e `/y/` (rota legada, ver
   `project_yarden_landing_gap` na memória — cai no bloco catch-all) confirma que o snippet ao vivo e a CSP
   ao vivo são **idênticos** ao que os 2 commits produzem. Ou seja, a branch é fonte de verdade confiável —
   não houve edição manual em produção depois do deploy desses commits.
5. **Achado esperado, não uma surpresa nova:** o bloco catch-all (`/((?!vindresidence|yarden).*)`, que cobre
   Home/Sobre Nós/Empreendimentos/Corporativas/Blog) também ganhou o wildcard do Clarity — é o que o commit
   chama de "Home" nos "4 blocos afetados". `/yarden` e `/yarden/` foram deliberadamente excluídos (CSP sem
   `clarity.ms`), consistente com a mensagem de commit "Yarden não é afetado".

## Decisão técnica (AUTO-DECISION)

**[AUTO-DECISION] Cherry-pick dos 2 commits vs. reconstituir como diff novo e limpo contra `main` atual →
reconstituir como diff novo (reason: a branch `feat/86-12-yarden-conteudo-definitivo` está muito divergida
de `main` no todo — `git rev-list --left-right --count origin/main...feat/86-12-yarden-conteudo-definitivo`
retorna `54  13` (medido em 2026-09-03; o número da esquerda sobe conforme `main` avança — não é essencial
recontar antes de implementar), ou seja, `main` tem dezenas de commits que a branch não tem (incluindo toda a Epic 900 de
multi-tenant) e a árvore inteira diverge em ~370 arquivos. Cherry-pick de commits antigos de uma branch tão
desatualizada aumenta o risco de conflito de 3-way merge mesmo em arquivos "limpos" isoladamente, e carrega
a mensagem original do commit `8cf64d90` que documenta ter sido feito em cima de um working tree "com
carona" de outra história (Epic 90) — bagagem que não faz sentido preservar no histórico de `main`. Como o
diff dos 3 arquivos afetados contra `origin/main` já está confirmado limpo e mínimo (achado #2 acima), é
mais seguro para o @dev abrir uma branch nova a partir do `main` atual e aplicar manualmente o mesmo
conteúdo — snippet do Clarity + acréscimos de CSP — como um commit novo, do zero, sem tocar em mais nada.
Resultado final em produção é idêntico; o histórico de `main` fica limpo).**

## Convenção de Deploy — DOIS alvos independentes (achado do @po, NO-GO 6/10)

**Esta story mexe em dois projetos Vercel separados, sem relação de deploy entre si — cada um precisa do
seu próprio passo de publicação e da sua própria validação independente:**

| Alvo | Projeto Vercel | Arquivo(s) tocados | Comando de deploy | Onde validar (SEM proxy) |
|------|-----------------|---------------------|--------------------|----------------------------|
| **1. `trifold-design-system`** | `trifold-s-projects/trifold-design-system` | `Home.dc.html`, `vercel.json` | `cd landing-pages/trifold-design-system && ./deploy.sh` (dry-run: `./deploy.sh --dry-run`, roda passos 1–3 sem publicar) | `https://trifold.eng.br/` (Home) e headers CSP de `/`, `/vindresidence/`, `/y/`, `/yarden/` |
| **2. `vind-residence`** | `trifold-s-projects/vind-residence` | `landing-pages/vind-residence/index.html` | `cd landing-pages/vind-residence && vercel deploy --prod --yes --scope trifold-s-projects` (projeto já linkado via `.vercel/project.json`; sem build step, "framework None") | **`https://vind-residence.vercel.app/` direto** |

**Por que isso é crítico (achado do @po):** `landing-pages/vind-residence/` é um projeto Vercel próprio,
sem integração com GitHub (deploy é sempre manual, `vercel deploy --prod` de dentro da pasta — ver memória
`project_vercel_landing_pages_projects`). Mergear o PR em `main` **não publica nada nele** — é um passo
separado. E o proxy `https://trifold.eng.br/vindresidence/` (rewrite do `trifold-design-system` pro
`vind-residence.vercel.app`) responde 200 **mesmo se o projeto `vind-residence` de verdade nunca for
republicado** — ele só mostra o que já está lá, seja o deployment antigo ou o novo. Testar via `/vindresidence/`
daria **falso positivo**: mostraria o Clarity do deployment ANTIGO (o que já está ao vivo hoje, comprovado
por `curl` direto em `vind-residence.vercel.app`), escondendo se o merge/deploy de `main` de fato chegou lá.
**Validação de cada alvo tem que ser feita direto na URL própria dele, nunca através do proxy.**

## Acceptance Criteria

1. **AC1** — Uma branch nova é criada a partir do `main` atual (pós Stories 90-1/90-6) contendo **apenas** a
   reconstituição das mudanças de Clarity: snippet no `<head>` de `Home.dc.html`, snippet no `<head>` de
   `landing-pages/vind-residence/index.html`, e os acréscimos de CSP em `vercel.json` (wildcard
   `https://*.clarity.ms` em `script-src`, `img-src` e `connect-src`, nos 4 blocos afetados: as 3 rotas
   `/vindresidence*` + o bloco catch-all). **Não** é um cherry-pick da branch órfã — é um diff novo,
   reconstituído a partir do conteúdo já confirmado em produção (ver seção "Decisão técnica").
2. **AC2** — O comportamento em produção **não muda**: mesmo `projectId` (`y0vgmebu2t`), mesma CSP wildcard,
   mesmas rotas afetadas (Home + `/vindresidence*`), mesma exclusão explícita do Yarden (`/yarden` e
   `/yarden/` continuam sem Clarity — confirmar com um grep/assert que nenhum dos 3 blocos `/yarden*` no
   `vercel.json` final contém a string `clarity`). Validado comparando o resultado do deploy de preview
   contra o `curl` de produção já capturado nesta story.
3. **AC3** — Nenhuma mudança não relacionada ao Clarity é trazida — nem conteúdo antigo da Story 86-12 (já
   mergeado via PR #512/#553), nem qualquer outro resíduo da branch órfã.
4. **AC4** — PR aberto e mergeado em `main` por `@devops`. Após confirmar o merge, `@devops` avalia se a
   branch `feat/86-12-yarden-conteudo-definitivo` (local e remota) pode ser deletada — checar antes se não
   há mais nada pendente nela além do que este PR já capturou (o histórico granular da 86-12 já está
   squash-merged; o Clarity é a última coisa pendente).
5. **AC5** — Após o merge em `main`, `@devops` publica e valida **os dois alvos de deploy, cada um em
   separado** (ver seção "Convenção de Deploy" acima):
   - **5a. `trifold-design-system`** — publicar com `cd landing-pages/trifold-design-system && ./deploy.sh`
     a partir de um checkout limpo de `main` pós-merge; confirmar Clarity ativo direto em
     `https://trifold.eng.br/` e nos headers CSP de `/`, `/vindresidence/`, `/y/` (com o wildcard) e de
     `/yarden/` (sem clarity, inalterado).
   - **5b. `vind-residence`** — publicar com
     `cd landing-pages/vind-residence && vercel deploy --prod --yes --scope trifold-s-projects` a partir do
     mesmo checkout limpo pós-merge; confirmar Clarity ativo direto em **`https://vind-residence.vercel.app/`**
     (NUNCA via `https://trifold.eng.br/vindresidence/` — o proxy mascara o resultado, ver "Convenção de
     Deploy").
   - Este é o teste de regressão que motivou a story inteira: confirmar que o cenário que quase aconteceu
     no deploy da 90-1 não se repete, **nos dois projetos**, não só no institucional.

## Tasks / Subtasks

- [x] **Task 1 (AC1, AC3)** — `@dev`: criar branch nova a partir de `main` atual; aplicar manualmente o
  snippet do Clarity em `Home.dc.html` e em `landing-pages/vind-residence/index.html`; aplicar os 4
  acréscimos de CSP em `vercel.json` (usar o diff já capturado nesta story como referência exata de
  conteúdo — não reinventar).
- [x] **Task 2 (AC2)** — `@dev`: rodar `cd landing-pages/trifold-design-system && ./deploy.sh --dry-run`
  (monta e valida `dist/` sem publicar) e comparar snippet + headers CSP do `vercel.json` resultante contra
  os valores literais documentados nesta story (Dev Notes) e contra o `curl` de produção já capturado
  (Home, `/vindresidence/`, `/y/`, `/yarden/`). Conferir também o snippet em
  `landing-pages/vind-residence/index.html` (sem dry-run equivalente nesse projeto — conferência é leitura
  do arquivo).
- [ ] **Task 3 (AC4)** — `@qa`: gate leve (não há lógica de aplicação, é config estática) — revisar que o
  diff final bate exatamente com o que está documentado nesta story, sem excesso, e que os 3 blocos
  `/yarden*` do `vercel.json` seguem sem `clarity` na CSP.
- [ ] **Task 4 (AC4, AC5)** — `@devops`: abrir PR e mergear em `main`. Depois, publicar e validar **os dois
  alvos em separado** a partir de um checkout limpo pós-merge:
  - **4a.** `trifold-design-system` via `./deploy.sh` — validar direto em `https://trifold.eng.br/`.
  - **4b.** `vind-residence` via `vercel deploy --prod --yes --scope trifold-s-projects` (de dentro de
    `landing-pages/vind-residence/`) — validar direto em `https://vind-residence.vercel.app/`, nunca via
    `/vindresidence/`.
  - Avaliar deleção da branch órfã `feat/86-12-yarden-conteudo-definitivo` só depois de 4a e 4b confirmados.

## Out of Scope

- Qualquer outra diferença entre a branch órfã e `main` — já confirmado que não há nenhuma (achado #3):
  todo o resto do conteúdo da 86-12 já está em `main` via squash-merge.
- Débito de persistência de consentimento (cookie banner) mencionado no commit `f2ad92e9` da Story 86-12 —
  não relacionado ao Clarity, não faz parte desta story.
- Adicionar Clarity ao Yarden — decisão deliberada de excluí-lo, preservada como está.
- Revisar/trocar a estratégia de deploy do site institucional (worktree vs. checkout limpo) — fora do escopo
  desta story pontual; se o @devops achar que o processo de deploy em si precisa de guard-rail permanente
  (ex: checklist ou script que detecta branches órfãs com commits não mergeados antes de deploy), isso é
  uma sugestão de story separada, não parte desta.
- **Observação de backlog (não resolver nesta story):** `scripts/prerender.mjs` do `trifold-design-system`
  roda um Playwright headless contra as páginas reais pra gerar o snapshot do `./deploy.sh`. Depois que o
  Clarity for mergeado, todo `./deploy.sh` (inclusive `--dry-run`, se ele chegar a abrir a página) vai
  gravar uma "sessão de bot" no projeto `y0vgmebu2t` — poluindo o heatmap/gravações do Clarity com tráfego
  de build, não de usuário real. Correção futura: bloquear a rota `*.clarity.ms` no contexto/página do
  Playwright dentro de `scripts/prerender.mjs` (ex: `page.route('**/*.clarity.ms/**', route => route.abort())`
  ou equivalente). Registrar como story separada de hardening do pipeline de prerender, não bloqueia este
  merge.

## Dev Notes

### Conteúdo exato a reconstituir

**`Home.dc.html`** (dentro de `<head>`, após o bloco de preload/support.js):
```html
<!-- Microsoft Clarity (project y0vgmebu2t) -->
<script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "y0vgmebu2t");
</script>
```

**`landing-pages/vind-residence/index.html`** — mesmo snippet, inserido logo após o bloco de init do
Facebook Pixel (`fbq('init', ...)`).

**`vercel.json`** — valores finais literais dos 4 blocos afetados (extraídos de
`git show b4e7c8d3:landing-pages/trifold-design-system/vercel.json`, já com o wildcard `*.clarity.ms`
correto — não usar `www.clarity.ms`, foi corrigido pelo próprio `b4e7c8d3`). Colar exatamente estes valores
no campo `Content-Security-Policy` de cada `source` correspondente:

- `source: "/vindresidence"`, `"/vindresidence/"` e `"/vindresidence/:path*"` (os 3 usam o **mesmo** valor):
  ```
  default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://*.clarity.ms; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://img.youtube.com https://www.facebook.com https://*.clarity.ms; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://vind-residence.vercel.app https://connect.facebook.net https://www.facebook.com https://*.clarity.ms; frame-src https://www.youtube.com https://www.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'
  ```
- `source: "/((?!vindresidence|yarden).*)"` (catch-all — Home, Sobre Nós, Empreendimentos, Corporativas, Blog):
  ```
  default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://*.clarity.ms; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://*.clarity.ms; font-src 'self'; connect-src 'self' https://*.clarity.ms; frame-src https://www.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'
  ```

Os 3 blocos `/yarden`, `/yarden/` e `/yarden/:path*` **não** devem ser tocados — permanecem exatamente como
estão hoje (sem `clarity.ms` em nenhuma diretiva):
```
default-src 'self'; script-src 'self' 'unsafe-inline' https://connect.facebook.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://img.youtube.com https://www.facebook.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://yarden.vercel.app https://connect.facebook.net https://www.facebook.com; frame-src https://www.youtube.com https://www.google.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'
```

### Testing

- Sem testes automatizados aplicáveis (projeto estático, sem bundler/test runner declarado — ver histórico
  da Story 86-11 em memória: "Este projeto Vercel não tem bundler nem dependências declaradas").
- Validação é por inspeção: `curl` no preview vs. `curl` em produção (snippet idêntico, header CSP idêntico),
  feita **em separado para os dois alvos de deploy** (ver seção "Convenção de Deploy") — nunca via
  `/vindresidence/` (proxy mascara qual deployment do `vind-residence` está realmente no ar).
- Assert obrigatório de não-regressão do Yarden: depois de montar/editar o `vercel.json` final, confirmar
  que nenhum dos 3 blocos `/yarden*` ganhou `clarity` na CSP, por exemplo:
  ```bash
  node -e '
    const d = require("./landing-pages/trifold-design-system/vercel.json");
    const maus = d.headers
      .filter(h => h.source.startsWith("/yarden") &&
        h.headers.some(k => k.key === "Content-Security-Policy" && /clarity/i.test(k.value)))
      .map(h => h.source);
    if (maus.length) { console.error("✖ clarity vazou para: " + maus.join(", ")); process.exit(1); }
    console.log("✓ nenhum bloco /yarden* tem clarity");
  '
  ```
  (assert estrutural em Node — sai `0` com o arquivo correto, sai `1` nomeando o bloco culpado se a
  regressão acontecer. Substitui um `grep -A2` que não alcançava a linha da CSP no `vercel.json` real —
  o `"source"` do bloco `/yarden/:path*` fica 7 linhas antes do `"value"` da CSP, fora do alcance de `-A2`;
  achado do @po, confirmado injetando a regressão de verdade).
- Fonte de verdade para conferência: valores já capturados nesta story em 2026-09-03 (ver seção
  "Investigação já feita", achado #4, e os valores literais de CSP colados acima).

## 🤖 CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI is not enabled em `core-config.yaml` (sem chave `coderabbit_integration`).
> Quality validation vai usar processo de revisão manual (@qa) apenas.

## Change Log
| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-09-03 | 1.0 | Story criada a partir de achado do @devops durante deploy da Story 90-1: Clarity + CSP presos numa branch órfã (`feat/86-12-yarden-conteudo-definitivo`), nunca mergeados em `main`. Investigação de commits, diff e produção documentada. Status: Draft. | @sm (River) |
| 2026-09-03 | 1.1 | NO-GO do @po (6/10) endereçado: story tratava `trifold-design-system` e `vind-residence` como um deploy só — reescritos AC5/Task 4 com os dois alvos explícitos, comando e validação independentes (nunca via `/vindresidence/`, que mascara qual deployment do vind-residence está no ar). Nova seção "Convenção de Deploy". AC5/Task 2 agora citam `./deploy.sh` / `./deploy.sh --dry-run` explicitamente. Dev Notes ganharam os 4 valores literais de CSP (extraídos de `git show b4e7c8d3`) no lugar da instrução em prosa. Testing ganhou assert de grep confirmando ausência de `clarity` nos blocos `/yarden*`. Out of Scope ganhou nota de backlog sobre o Playwright do `scripts/prerender.mjs` gravando sessão de bot no Clarity a cada build. Nit: contagem `rev-list` atualizada de 46/13 para 54/13. Status: Draft, volta pro @po só para confirmar AC5/Task 4. | @sm (River) |
| 2026-09-04 | 1.3 | Implementação do @dev: Clarity reconstituído como diff novo (3 arquivos, +21/-4) na branch `fix/clarity-merge-main-branch-orfa`, criada a partir de `origin/main` (19843658). Tasks 1 e 2 concluídas. Validado: literais de CSP da story == blob de `b4e7c8d3` **e** == `origin/main` + token do Clarity (16/16 checks — nenhuma evolução de CSP de `main` foi revertida); `./deploy.sh --dry-run` verde (5/5 páginas pré-renderizadas, gate aprovado); `dist/vercel.json` e snippets **byte a byte idênticos ao curl de produção** nas 4 rotas (22/22 checks); assert de não-regressão do Yarden verde na fonte e no `dist/`, com contraprova de falha. Status: Ready → Ready for Review (Task 3 = @qa, Task 4 = @devops). | @dev (Dex) |
| 2026-09-03 | 1.2 | Fix final do @po: assert de não-regressão do Yarden na seção Testing trocado de `grep -A2` (não alcançava a linha da CSP no `vercel.json` real — `source` do bloco `/yarden/:path*` fica 7 linhas antes do `value`, fora do alcance de `-A2`) para um assert estrutural em Node que parseia o JSON e falha nomeando o bloco culpado. Comando comprovado pelo @po nos dois sentidos (injeção de regressão). GO do @po confirmado, condicionado só a este fix — sem nova revalidação necessária. Status: Draft → **Ready**. | @sm (River) |

## Dev Agent Record

### Agent Model Used
Opus 5 (claude-opus-5[1m]) — @dev (Dex)

### Branch / Base
- **Branch criada:** `fix/clarity-merge-main-branch-orfa`
- **Base:** `origin/main` @ `19843658` (pós Stories 90-1 / 90-6 / Epic 900) — **não** é cherry-pick da branch órfã, conforme a "Decisão técnica" da story.
- **Worktree isolado:** `.claude/worktrees/clarity-merge-main` (ver nota em Completion Notes)

### Debug Log References
Nenhum bloqueio. Validações executadas (todas verdes):

1. **Paridade dos literais de CSP (16/16 PASS)** — antes de editar qualquer coisa, comparei os 4 valores literais das Dev Notes contra (a) `git show b4e7c8d3:.../vercel.json` e (b) `origin/main` + token do Clarity aplicado em `script-src`/`img-src`/`connect-src`. Os dois lados batem, e os 3 blocos `/yarden*` de `origin/main` já eram idênticos ao literal "não tocar" da story.
2. **`./deploy.sh --dry-run` (passos 1–3) — verde:** `5/5 páginas pré-renderizadas`, `gate pré-deploy aprovado`. Confirma que o `<script>` novo no `<head>` não quebra o pipeline de prerender da 90-1.
3. **Paridade com produção (22/22 PASS)** — `dist/vercel.json` (o artefato que sobe) vs `curl -I` ao vivo: CSP idêntica em `/`, `/y/`, `/vindresidence/` e `/yarden/`; snippet do Clarity idêntico byte a byte em `trifold.eng.br/` e em **`vind-residence.vercel.app/` (direto, sem proxy)**.
4. **Assert de não-regressão do Yarden** — o assert em Node da seção Testing rodou verde na fonte **e** no `dist/`; contraprova injetando a regressão retorna exit 1 nomeando `/yarden/:path*`.
5. **Escopo (AC3)** — `git diff origin/main --stat` = exatamente 3 arquivos, `+21/-4`, 100% Clarity. Zero resíduo da Story 86-12 ou da branch órfã.

### Completion Notes List

- **AC1 — feito.** Snippet do Clarity (`y0vgmebu2t`) no `<head>` de `Home.dc.html` (logo após `<script src="./support.js" defer></script>`) e de `landing-pages/vind-residence/index.html` (logo após o bloco de init do `fbq`, com a indentação de 2 espaços do arquivo); wildcard `https://*.clarity.ms` em `script-src`/`img-src`/`connect-src` nos 4 blocos de CSP (3× `/vindresidence*` + catch-all).
- **Reconstituição fiel, provada por hash de blob.** O `git diff` da minha branch mostra `landing-pages/vind-residence/index.html index adc56147..6e222413` — **exatamente** os mesmos hashes pré/pós do commit órfão `8cf64d90`. Ou seja: o arquivo reconstituído é byte a byte o da branch órfã, sem cherry-pick.
- **A CSP foi aplicada como acréscimo de token, não como colagem do literal.** Colar o literal inteiro teria sido suficiente aqui (verificado: bate com `origin/main`), mas reverteria em silêncio qualquer evolução futura de CSP em `main`. O script de aplicação aborta se o valor de origem não for exatamente o esperado, se o bloco `/vindresidence*` não aparecer 3× ou se o arquivo já contiver `clarity`.
- **AC2 — feito e provado nos dois alvos.** Mesmo `projectId`, mesma CSP wildcard, mesmas rotas. `/y/` cai no catch-all e ganha Clarity (achado #5 da story, confirmado contra produção). Os 3 blocos `/yarden*` seguem sem `clarity` em nenhuma diretiva.
- **AC3 — feito.** Diff mínimo: 3 arquivos, `+21/-4`, nada além de Clarity.
- **Snippet não duplica no build.** Risco real do pipeline da 90-1 (prerender aditivo): `grep -c 'clarity.ms/tag' dist/Home.dc.html` = **1**. As outras 7 páginas `.dc.html` seguem com 0 — o Clarity está só na Home, como em produção.
- **Wildcard cobre o que o Clarity realmente usa.** `www.clarity.ms/tag/` (snippet) → `scripts.clarity.ms` (bootstrap, `script-src`) → `h.clarity.ms`/`f.clarity.ms` (`connect-src`) → `c.clarity.ms/c.gif` (`img-src`). Em CSP o wildcard cobre subdomínio mas **não** o apex `https://clarity.ms` — que o Clarity não usa. Nenhuma diretiva `unsafe-*` nova foi introduzida; o `'unsafe-inline'` que o snippet inline exige já existia nos 4 blocos.
- **`npm run lint` / `npm run type-check` não alcançam estes arquivos — por construção, não por omissão.** `pnpm-workspace.yaml` declara só `packages/*`; `landing-pages/vind-residence/package.json` tem `scripts: {}` e `landing-pages/trifold-design-system/` **não tem `package.json`**. Logo `turbo lint`/`turbo type-check` (e o `ci.yml`, que roda exatamente esses dois) não enxergam nenhum dos 3 arquivos. Como o diff não toca **nada** em `packages/*`, o resultado desses gates na branch é idêntico ao de `origin/main` por construção. Rodá-los no worktree (sem `node_modules`, com symlinks de workspace apontando para a checkout principal) só produziria vermelhos-fantasma sem relação com o diff. O gate que de fato se aplica a estes arquivos é o `./deploy.sh` (passos 1–3), executado e verde.
- **[AUTO-DECISION] Worktree isolado vs. branch na checkout principal → worktree isolado** (reason: a checkout principal está com `HEAD` na própria branch órfã `feat/86-12-yarden-conteudo-definitivo` e ~30 arquivos modificados + dezenas de untracked de outras stories/Epic 90. `git checkout -b` a partir de `origin/main` ali abortaria por conflito ou arrastaria trabalho alheio para o commit. O worktree garante que o diff da branch seja exatamente os 3 arquivos).
- **[AUTO-DECISION] Nome da branch → `fix/clarity-merge-main-branch-orfa`** (reason: a story não especifica; segue o slug do arquivo da story e o padrão `fix/` do repo, já que o tipo declarado é Hotfix).
- **[AUTO-DECISION] `assets/`/`uploads/`/`.vercel/project.json` copiados para o worktree** (reason: são ~77 MB gitignored, pré-condição dos passos 1–2 do `deploy.sh`. Sem eles o dry-run aborta antes de montar o `dist/`. Confirmado que seguem ignorados — o `git status` do worktree mostra só os 3 arquivos).
- **Observações para o @qa (não acionadas, fora de escopo desta story):**
  - O `--dry-run` **de fato grava sessão de bot** no projeto `y0vgmebu2t`: o Playwright do `scripts/prerender.mjs` carrega a Home real e o snippet executa. É exatamente o débito previsto em Out of Scope; esta execução adicionou ~1 sessão de bot ao Clarity. Não bloqueia o merge, mas confirma o débito como real, não hipotético.
  - O débito de persistência de consentimento (cookie banner, commit `f2ad92e9`) segue aberto e agora tem peso maior, já que o Clarity grava session replay/heatmap. Explicitamente fora de escopo aqui.

### Handoff para @devops (Task 4)
A branch está **commitada localmente e não pushada** (`git push` é exclusivo do @devops).
Os dois alvos de deploy do AC5 continuam pendentes e **independentes** — o `dist/` montado no worktree é de dry-run e **não** foi publicado:
- **4a.** `cd landing-pages/trifold-design-system && ./deploy.sh` → validar em `https://trifold.eng.br/`
- **4b.** `cd landing-pages/vind-residence && vercel deploy --prod --yes --scope trifold-s-projects` → validar em `https://vind-residence.vercel.app/` (**nunca** via `/vindresidence/`)

### File List
| Arquivo | Ação |
|---------|------|
| `landing-pages/trifold-design-system/Home.dc.html` | modificado — snippet do Clarity no `<head>` (+8) |
| `landing-pages/trifold-design-system/vercel.json` | modificado — `https://*.clarity.ms` em `script-src`/`img-src`/`connect-src` nos 4 blocos afetados (+4/-4) |
| `landing-pages/vind-residence/index.html` | modificado — snippet do Clarity no `<head>`, após o init do `fbq` (+9) |
| `docs/stories/clarity-merge-main-branch-orfa.story.md` | adicionado à branch — a story era untracked em `main`; entra no PR junto com a implementação |

_Artefatos locais não versionados e não incluídos no commit: `landing-pages/trifold-design-system/dist/`, `assets/`, `uploads/`, `.vercel/`, `.seo-metrics/` (todos gitignored)._

## QA Results
_(a preencher pelo @qa)_
