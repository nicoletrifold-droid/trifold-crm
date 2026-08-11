# Validação @po — Story 87-1 (governança do painel de `agent_prompts`)

**Validado por:** @po (Pax) em 2026-08-10
**Epic:** 87 v0.7 — Nicole: Confiabilidade de Contexto, Estado e Enforcement
**Story:** `docs/stories/87-1-governanca-painel-agent-prompts.story.md` (nunca validada; nasceu no
corte da 87-0 em 05/08 e ficou parada 5 dias)
**Método:** leitura do código em `HEAD`, execução do `--check` contra produção
(`dsopqkqjkmhytudaaolv`), consultas **somente SELECT** ao banco, e `grep` sobre `packages/` +
`scripts/` + `supabase/migrations/`.

| Veredito | Score | Status |
|---|---|---|
| **GO condicionado** — 10 emendas aplicadas por mim, nenhuma volta ao @sm | **7/10** | `Draft` → **`Ready`** |

> As emendas **já estão no arquivo da story**. AC é seção do @po (regra de propriedade); as três
> ACs novas (**AC2-b**, **AC6**, **AC7**) são de minha autoria e minha responsabilidade.

---

## 0. O que eu medi antes de decidir

| # | Medição | Resultado |
|---|---|---|
| **M1** | `npx tsx scripts/dump-agent-prompts.ts --check` | ❌ **exit 1 — 3 de 7 slugs divergentes**, 3 dias após o snapshot ser commitado |
| **M2** | `### YARDEN RESIDENCE` no repo × prod | Prod **corrigido** (`### YARDEN — como posicionar`); **repo ainda tem o erro** em `_production/property-presentation.txt:22` |
| **M3** | Colunas de `agent_prompts` em prod | `id, org_id, name, slug, content, type, is_active, created_at, updated_at` — **não existe `updated_by`** |
| **M4** | `updated_at` dos 7 slugs | **todos hoje, 2026-08-10, entre 13:50:52 e 13:51:00 UTC** (o experimento de sentinela) |
| **M5** | Superfícies de escrita | **5**, não 3. A 4ª é `scripts/run-seed.ts` / **`npm run seed`** |
| **M6** | AC12 da 87-0 (gate no `seed-prompts.ts`) | **não implementada** — nenhum gate no arquivo |
| **M7** | Quem roda o `--check` | **ninguém**: sem `.github/workflows`, sem npm script, D5 aberta |

### M1 — o snapshot apodreceu em 72 horas

```
❌ agent_prompts DIVERGE do snapshot (3 problema(s)):
   • guardrails            snapshot sha 3c2daa66 · banco sha 1eb1d414
       L20 snapshot: "...memorial completo fica disponivel la no stand de vendas!..."
       L20 banco:    "...memorial completo fica disponivel la na sede da Trifold!..."
   • property-presentation snapshot 3905 chars · banco 4525 chars
       L5  banco:    "REGRA DE OURO DESTA SECAO: status, endereco, previsao de entrega, metragem..."
   • system-personality    snapshot sha 2e5cefe0 · banco sha c24c5713
       L19 snapshot: "...queira VISITAR o stand de vendas"
       L19 banco:    "...queira VISITAR a sede da Trifold"
```

O snapshot subiu em **07/08** (PR #377, `17e9a8dc`). Em **10/08** já são 3 divergências. Uma delas
é a reescrita legítima do `property-presentation` (06/08, Tarefa 2 da 87-0, feita à mão em prod e
nunca devolvida ao repo). **As outras duas — `stand de vendas` → `sede da Trifold` em dois slugs —
não têm story, não têm commit e não têm autor.** É o mecanismo do `visit-scheduling` de 04/08
reincidindo, com a rede de proteção já instalada e ninguém olhando para ela.

Isto responde à pergunta 3 do briefing com um número: **o `--check` funciona, e a ausência de dono
custou 2 edições invisíveis em 3 dias.**

### M4 — o dano que a story previne aconteceu enquanto ela esperava validação

Os 7 slugs foram escritos hoje numa janela de 8 segundos. Foi o experimento de sentinela — legítimo,
reversível, e restaurado. **Mas do banco isso é indistinguível de 14 escritas descontroladas em
produção.** Não há autor, não há motivo, não há "isto era um teste".

E há um efeito colateral que vale registrar: o `updated_at` de `visit-scheduling` marcava
**2026-08-04 17:28 UTC** — a última pista física do mistério que a 87-0 documenta ("não se sabe quem
o editou"). Esse valor **foi sobrescrito hoje**. Sobreviveu por acidente no `manifest.json` do
snapshot (que registra `2026-08-05T20:58:13`, já pós-reconciliação — a pista de 04/08 se perdeu de
vez). Nenhuma culpa: é exatamente o comportamento de um sistema sem histórico.

### M5 — a quarta superfície, e por que ela é a pior

```
scripts/run-seed.ts:71-77
  { slug: "system-personality",    content: "[placeholder — Story 3.1]" },
  { slug: "qualification-flow",    content: "[placeholder — Story 3.4]" },
  ... (os 7)
  await supabase.from("agent_prompts").upsert({ ...prompt, org_id: ORG_ID },
                                              { onConflict: "org_id,slug" })

package.json:10
  "seed": "tsx scripts/run-seed.ts && tsx scripts/seed-properties.ts"
```

`seed-prompts.ts` (a superfície nº 3, a que a story conhecia) ao menos grava as **constantes do
código** — ruim, mas recuperável. `run-seed.ts` grava **`[placeholder — Story 3.x]`**, é o comando
`npm run seed` documentado, e não aparece em nenhuma story do epic. Com `.env.local` apontando para
produção — o estado padrão deste repositório, por CLAUDE.md — um `npm run seed` deixa a Nicole sem
prompt nenhum.

**Resposta direta à pergunta 2 do briefing:** a story mirava os 3 caminhos certos para *atribuição*,
mas a porta dos fundos que importa não é de atribuição, é de **destruição** — e a maior delas não
estava mapeada. Daí a **AC2-b**.

---

## 1. As 5 ACs cobrem o que os dois episódios expuseram? — **Não. Faltavam duas coisas.**

| O briefing pedia | Coberto no draft? | Onde ficou |
|---|---|---|
| Motivo obrigatório no save | ✅ sim | AC2 |
| Histórico de versão | ✅ sim | AC1 (trigger) + AC3 (tela) |
| Snapshot versionado no repo | ✅ já existe (87-0), e a story acerta ao **não** duplicar | Dev Notes |
| **Aviso de divergência painel × repositório** | ❌ **ausente** | 🆕 **AC6** |
| **Quem roda o `--check` e quando** | ❌ **ausente** | 🆕 **AC7** |
| **Fechar os scripts destrutivos** | ⚠️ afirmado como já resolvido, e não está (M6) | 🆕 **AC2-b** |

### Por que a AC6 é a que faltava, e não é "nice to have"

Rodei o episódio do Marcos contra as ACs do draft, uma a uma. **Nenhuma delas teria encurtado os
4 dias.** Histórico e motivo respondem *quem editou e por quê* — perguntas que só se faz **depois**
de alguém desconfiar. Ninguém desconfiou, porque nada sinalizou. O que fecha a distância entre
"editei" e "a lead recebeu" é **alguém ver o diff**.

A AC6 é a versão barata disso e funciona **sem CI**, que é a situação real (M7 + D5 aberta): o
painel calcula o `sha256` do `content` normalizado e compara com o `manifest.json` commitado,
mostrando ⚠️ por slug. É verificável hoje com um número: **exatamente 3 dos 7 devem nascer
vermelhos**, os mesmos da M1, por caminho de código independente do script.

Não a confundo com a CI: **a AC6 avisa quem já está olhando a tela; a CI avisa quem não está.** A
D5 continua necessária. Registrei isso na própria AC para que ninguém use a AC6 como argumento para
fechar a D5.

### Ressalva incorporada — o limite honesto

A story agora carrega, escrito: o inventário 5/7 prova que **o texto chega**, não que **ela
obedece**. O caso Ronaldo (09/08) é o contraexemplo medido. Governança de prompt é condição
necessária do enforcement, nunca suficiente — enforcement é Onda 3.

Registrei também que **o 5/7 já é teste automatizado no repo** (`config-surfaces.test.ts`, entregue
pela 87-0/AC13). Ninguém precisa refazer a injeção de sentinela à mão para "confirmar": refazê-la
custa 14 escritas não rastreadas em produção, que é literalmente a M4.

---

## 2. Escopo e regra de corte — **cabe onde está**

**Regra de corte da Onda 1** (epic §7.2: "nenhuma story pode adicionar um novo caminho de decisão
da Nicole"): ✅ **cumprida.** Verifiquei o raio de impacto das 7 ACs — migration + trigger,
`personalidade/page.tsx`, `api/admin/agent-prompts/[slug]/route.ts`, dois scripts de seed,
`package.json`. **Nenhum arquivo de `packages/ai/src/chat/` é tocado.** O `pipeline.ts` de 1843
linhas (R-H) não entra no raio. É adição de processo, exatamente como o briefing enquadrou.

**Não virou "o painel inteiro":** ✅. A story protege o **texto** (`agent_prompts`). O que ficou
explicitamente fora, e eu confirmei que continua fora: `agent_config` (destino é a 87-2), workflow
de aprovação de duas pessoas (contraria a D-87-0-a), job de CI (D5), e **o switch por
empreendimento** — o episódio Japurá/Solum. Confirmei o paliativo em prod:

```
Japura           status=planning  is_active=false  upd=2026-08-10T13:45:54Z
Solum            status=planning  is_active=false  upd=2026-08-10T13:45:54Z
Vind Residence   status=selling   is_active=true
Yarden           status=selling   is_active=true
```

Contido. É cadastro, não texto — story do @sm, e acrescentei a fronteira em "Fora de escopo" para
que ninguém a puxe para cá no meio da implementação.

**Dependência de 87-0 reclassificada.** O draft dizia "depende das Tarefas 1 e 2". Tarefa 1 está em
produção (#377). Tarefa 2 foi feita à mão em prod em 06/08 e **não voltou ao repo** — é a M1. Isso
**não bloqueia** esta story; é a evidência que a justifica. Corrigi o cabeçalho.

---

## 3. Defeitos técnicos que eu não deixaria chegar ao @dev

| # | Achado | Severidade |
|---|---|---|
| **D1** | **A mitigação do Risco 1 estava tecnicamente errada.** "Trigger só grava histórico, nunca valida" **não** impede o bloqueio: o trigger roda na mesma transação, e um `INSERT` que falhe por RLS, `NOT NULL` ou tipo **aborta o `UPDATE` do prompt**. Exigi `EXCEPTION WHEN OTHERS THEN RETURN NEW` + `SECURITY DEFINER` + nenhuma coluna `NOT NULL` sem default | 🔴 Alta — era o risco "ninguém consegue corrigir a Nicole no próximo incidente" |
| **D2** | **O motivo não tem como chegar ao trigger.** Um trigger de linha só vê `NEW`/`OLD`, e `motivo` não é coluna. AC1 e AC2 eram inimplementáveis juntas como escritas. Documentei as duas opções (coluna `last_change_reason` × `set_config` numa RPC) e a restrição inegociável: **`UPDATE` sem motivo ainda grava histórico** | 🔴 Alta — bloquearia o @dev no dia 1 |
| **D3** | **Colisão de nome de trigger.** `001_base_schema.sql:295` já cria `set_updated_at BEFORE UPDATE ON agent_prompts`. O novo precisa de outro nome e deve ser `AFTER UPDATE` | 🟠 Média |
| **D4** | **Prefixo de migration velho.** A story dizia 215; existem 216, 217 e 218 (e o 218 foi renumerado hoje). Próximo livre: **219**, reconferir no momento. ⚠️ **A reconferência pegou:** o `219` foi consumido pela `main` em 11/08 (`219_fvs_fundacao.sql`, PR #392) e o arquivo foi renumerado para **`222`** pelo @devops na revisão do PR #391 | 🟠 Média |
| **D5** | **Referência errada.** A RLS admin-only é a migration **`098`**, não a `096` (que é `crm_pipeline_readonly_layer`). O erro está na story **e** no comentário de `page.tsx:15` | 🟡 Baixa, mas é o tipo de citação que vira arqueologia |
| **D6** | **AC6 quebraria na Vercel se implementada do jeito óbvio.** `readSnapshotManifest()` chama `findRepoRoot()` (`snapshot.ts:104`), que sobe o filesystem a partir de `process.cwd()` — **lança exceção em serverless**. O selo precisa importar o `manifest.json` estaticamente; `sha256` e `normalizePromptContent` são puros e podem ser reusados | 🟠 Média — descoberto ao escrever a AC, não depois |
| **D7** | **`savePromptAction` retorna `void` em toda rejeição.** Um `return` novo para "sem motivo" seria indistinguível de sucesso. A AC2 agora exige mensagem visível | 🟠 Média — é o mesmo defeito de UX que já mordeu este projeto |
| **D8** | **O alvo do rollback está contaminado.** Restaurar `property-presentation` pelo snapshot commitado reintroduz `### YARDEN RESIDENCE` **e** os fatos que a Tarefa 2 removeu. A AC4 ganhou passo obrigatório de revisão do conteúdo antes de escrever | 🔴 Alta — "voltar atrás" para um estado que ninguém olhou é o mesmo incidente com outro sinal |

---

## 4. Riscos que eu acrescentei

**Risco 4 — a fricção empurra a edição para fora do painel.** Motivo obrigatório + selo vermelho
tornam o painel mais caro que um `UPDATE` por Management API. A governança produziria exatamente a
superfície 5 que queria eliminar. Mitigação: o trigger cobre o caminho de fuga (registra com autor
`system`), e a fricção fica mínima — um campo de uma linha, **sem** workflow de aprovação. A fuga
fica visível, não invisível.

**Risco 5 — o selo nasce vermelho e vira ruído.** 3 de 7 já divergem (M1). Um indicador que nasce
permanentemente vermelho não é indicador. Mitigação normativa: **a primeira tarefa do @dev é zerar
a dívida** (`--write` + commit do snapshot reconciliado, no PR desta story), antes de a AC6 subir.

---

## 5. Score

| # | Critério | Nota | Nota |
|---|---|---|---|
| 1 | Título claro | ✅ | — |
| 2 | Descrição completa | ✅ | Uma das melhores do epic — o "para que" é operacional, não abstrato |
| 3 | ACs testáveis | ⚠️ | Eram; **D2** as tornava inimplementáveis juntas. Corrigido |
| 4 | Escopo definido | ✅ | "Fora de escopo" é exemplar, e a exclusão do workflow de aprovação está justificada pela D-87-0-a |
| 5 | Dependências mapeadas | ⚠️ | Afirmava um fato falso (AC12 já neutralizou o seed) e classificava mal a 87-0. Corrigido |
| 6 | Estimativa | ❌ | Ausente. Acrescentei **M** |
| 7 | Valor de negócio | ✅ | Dois incidentes reais, medidos |
| 8 | Riscos | ⚠️ | 3 riscos, um com mitigação tecnicamente errada (**D1**). Corrigido + 2 novos |
| 9 | DoD | ✅ | Reescrito para AC1–AC7 |
| 10 | Alinhamento com o epic | ✅ | W0-0 derivado; R-D, R-F e D5 casam |

**7/10 → GO condicionado.** As condições estão todas aplicadas no arquivo; nada volta ao @sm.

---

## 6. O que o @dev precisa saber antes de abrir o editor

1. **Ordem importa:** `--write` + commit do snapshot **primeiro** (Risco 5), depois a AC6.
2. **Decida a D2 no dia 1** (como o motivo chega ao trigger) e escreva a decisão na story antes de
   codar — as duas opções mudam a migration.
3. **Teste o trigger por SQL cru antes** de o painel depender dele (**D1**). Se o trigger puder
   abortar um `UPDATE`, ele é pior que não existir.
4. **Não refaça a injeção de sentinela em produção.** Rode
   `npx vitest run packages/ai/src/config-surfaces.test.ts`.
5. **Esta story absorve a AC12 da 87-0.** Não implemente o gate do seed duas vezes.

---

## 7. Reconciliação de status pendente (não é desta story, mas segue registrado)

A **87-0** consta como `Ready` no epic, mas a Tarefa 1 está em produção desde 07/08 (#377) e a
Tarefa 2 foi executada à mão em 06/08. Restam a **AC12** (absorvida aqui) e o fechamento formal.
Como já registrei em 10/08, `Done` é transição de @qa/@devops — apenas sinalizo que a 87-0 está
mais perto do fim do que o mapa sugere, e que sua AC12 agora tem dono nesta story.

---

*— Pax, equilibrando prioridades 🎯*
