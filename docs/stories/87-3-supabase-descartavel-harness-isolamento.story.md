# Story 87-3 — Projeto Supabase Descartável + Harness de Isolamento

## Metadata
- **Epic:** 87 — Trifold CRM → SaaS Multi-Tenant com Cobrança Modular
- **Onda:** 0 — Esteira e observabilidade (sem mudança funcional)
- **Story:** 87-3
- **Status:** Draft — **decisão deliberada do @po, não pendência de validação.** Validada com **GO condicional (8/10)** em `docs/qa/epic-87-po-validation.md`; permanece `Draft` porque a transição para `Ready` está amarrada à existência real de PRE-1 (não a mais revisão de conteúdo). Ver "Bloqueio explícito" abaixo — em especial o item 4, que resolve a ambiguidade entre "já validada" e "ainda em Draft".
- **Priority:** P0 — sem esta story, os testes cross-tenant da Onda 1 (que criam e apagam orgs) não têm onde rodar, e **o epic inteiro para no fim da Onda 1** (nas palavras da validação do @po). Não é um risco distante — é o próximo bloqueador depois de PRE-0.
- **Complexity:** M
- **Created:** 2026-08-02
- **Author:** @sm (River)

### Executor Assignment
- **Executor:** @devops (Gage)
- **Quality Gate:** @architect (Aria)
- **Quality Gate Tools:** `[supabase_project_review, ci_secrets_review, reset_script_review]`

---

## Bloqueio explícito — leia antes de tentar executar esta story

**PRE-1 não existe ainda.** O epic (`depends_on`, frontmatter) registra: *"projeto Supabase descartável criado (autorizado pelo dono do produto, ainda não existe). Bloqueia 87-3 e 87-17."* A validação do @po (rodada 3) é ainda mais direta: *"PRE-1 — o projeto Supabase descartável. Sem ele o epic para no fim da Onda 1, e essa parada chega antes do que parece."*

Isso significa, concretamente:

1. Esta story **já foi draftada, revisada e validada pelo @po** — GO condicional (8/10), registrado em `docs/qa/epic-87-po-validation.md` e no Change Log desta story. A validação de conteúdo **está feita**; nada aqui depende de mais revisão.
2. Esta story **não pode ser implementada** até o Gabriel autorizar/criar o projeto Supabase separado (a autorização em si — D6 — já existe; o que falta é o projeto **existir de fato**: uma conta/organização Supabase, um projeto novo provisionado, e as credenciais de acesso).
3. **Não confundir com o "Supabase de dev" que existe hoje** — a memória do projeto (`project_supabase_prod_only.md`) registra que o único Supabase de dev aponta para **produção**. O projeto descartável desta story é um **terceiro** ambiente, isolado, que **nunca** recebe dado de produção nem é usado para desenvolvimento diário — existe só para os testes cross-tenant que criam e apagam organizações (AC4).
4. **Por isso o `Status` fica em `Draft`, e não em `Ready`, mesmo com o GO já dado — decisão explícita do @po, não uma pendência esquecida.** Nas demais stories da Onda 0 (`87-1`, `87-2a`, `87-2b`, `87-2c`), GO do @po significa `Ready` imediatamente, porque nada mais as separa da implementação. Nesta story, GO **não** libera implementação — só libera o **conteúdo**. `Ready` neste projeto sinaliza "pode começar a ser implementada agora", e isso seria falso enquanto PRE-1 não existir. Ficar em `Draft` com o GO explicitamente registrado (em vez de inventar um status intermediário fora da máquina de estados `Draft → Ready → InProgress → InReview → Done`) é o jeito de não mentir sobre o que o status significa. **Quando PRE-1 existir**, a transição `Draft → Ready` acontece sem precisar de nova rodada de validação de conteúdo — é só a pré-condição externa sendo satisfeita.

---

## User Story

**Como** engenharia do Trifold CRM,
**Quero** um projeto Supabase separado e descartável, com os 222 arquivos de migration existentes (`001` a `199`, com 20 prefixos duplicados) aplicados do zero e um script de reset determinístico,
**Para que** os testes cross-tenant da Onda 1 (que criam e apagam organizações para provar isolamento) tenham um lugar seguro para rodar — algo que hoje não existe, porque o único "Supabase de dev" do projeto aponta para produção.

---

## Context

`docs/architecture/saas-multi-tenant.md` §8.3 é explícito sobre por que isso é um bloqueador, não um nice-to-have: os testes de isolamento cross-tenant (`setup: cria org A e org B... teardown: apaga as duas orgs`) **não podem rodar em produção**. Como não existe staging (CON-1 do epic — "o Supabase de dev aponta para produção"), rodar esses testes hoje significaria criar e apagar organizações de teste dentro do banco real que atende a Trifold Engenharia em produção. Isso é inaceitável mesmo com o máximo cuidado de isolamento no teste em si — o risco de um bug no próprio teardown do teste (ex.: um `DELETE` sem `WHERE` correto) apagar dado real é exatamente o tipo de risco que este épico existe para eliminar, não para introduzir.

**Por que "descartável" e não "staging permanente":** o projeto não precisa espelhar produção continuamente (isso seria staging de verdade, que o epic explicitamente não tem orçamento/necessidade para manter). Ele precisa apenas: (a) ter o **mesmo schema final** que produção teria após aplicar os 222 arquivos de migration existentes, e (b) poder ser **resetado deterministicamente** entre execuções de teste, para que um teste não vaze estado para o próximo.

**Efeito colateral que prova valor além do teste de isolamento:** aplicar os 222 arquivos de migration do zero, num projeto novo, é a única forma de provar que a sequência é **reproduzível** — algo que nunca foi testado, porque o "banco de dev" sempre foi o de produção, já com todo o histórico acumulado. **Números corrigidos e reconferidos nesta story** (a contagem original desta story estava errada, e o CLAUDE.md também estava incompleto): são **222 arquivos `.sql`** em `supabase/migrations/` (não 199 — 199 é só o maior *número*, não a contagem de arquivos), com **20 prefixos numéricos duplicados** — `021, 024, 025, 027, 028, 029, 031, 032, 033, 034, 036, 044, 048, 063, 066, 075, 102, 104, 164, 170` (verificado por `ls supabase/migrations/*.sql | xargs -n1 basename | sed -E 's/^([0-9]+).*/\1/' | sort | uniq -c` — confirma exatamente 20 prefixos com mais de um arquivo; a lista do `CLAUDE.md`, que cita só "021, 024, 025, 027, 031-034, 036, 044, 048, 063, 066, 075, 102, 104", está incompleta em 4 itens: faltam `028`, `029`, `164` e `170`). Se a aplicação do zero falhar em algum ponto, isso é um achado desta story, não um bug a esconder — e a causa mais provável já está nomeada no risco R2 (ver "Riscos").

---

## Scope

### IN (esta story entrega)
- Projeto Supabase novo, separado do projeto de produção (`dsopqkqjkmhytudaaolv`) e do "Supabase de dev" existente (que também aponta para produção — não reusar, não confundir).
- Os 222 arquivos de migration atuais (`supabase/migrations/*.sql`, de `001_base_schema.sql` até `199_hotfix_rls_org_scope.sql`, incluindo os 20 prefixos duplicados) aplicados do zero nesse projeto, na ordem que `supabase db push` de fato usa (lexicográfica por nome de arquivo — ver Dev Notes/R2, não necessariamente a ordem de criação histórica), sem erro.
- Credenciais do projeto (URL, anon key, service-role key, e o que for necessário para `SUPABASE_MANAGEMENT_PAT` se aplicável a este projeto também) gravadas como **secrets do GitHub Actions**, nunca commitadas em texto claro — via `gh secret set`, seguindo a mesma disciplina de nunca gravar valor vazio silenciosamente (NFR-10, adaptado do gotcha de `vercel env add`/stdin para o equivalente de `gh secret set` — ver Dev Notes).
- `scripts/reset-tenancy-testdb.ts` (ou `.sh` — decisão do executor), que restaura o projeto descartável a um estado limpo e conhecido de forma determinística (reaplica migrations do zero, ou trunca+re-seed, dependendo da estratégia mais rápida/confiável escolhida pelo @devops — documentar a escolha).
- Documentação explícita, no próprio repositório (README do diretório `scripts/` ou comentário no topo do script de reset), de que este projeto **nunca** recebe dado de produção — nem por engano, nem por conveniência de debug.

### OUT (não entra nesta story)
- Os próprios testes cross-tenant (`tests/tenancy/cross-tenant.spec.ts`) — isso é trabalho da Onda 1 (mencionado no epic como parte do critério de saída da Onda 1, não desta story). Esta story entrega o **harness** (onde os testes rodam), não os testes em si.
- Wiring do job de isolamento no `.github/workflows/ci.yml` como job **bloqueante** — nesta onda, mesmo depois que `87-3` existir, o job de isolamento (quando os testes da Onda 1 existirem) roda contra este projeto descartável mas **não trava PR** até a Onda 1 provar maturidade (mesma lógica de catraca não-bloqueante de `87-2c`, mas para um job diferente — decisão explícita de story futura, não desta).
- Qualquer alteração ao Supabase de produção ou ao Supabase de dev existentes.
- Automação de provisionamento do projeto Supabase em si (ex.: via Management API criando o projeto programaticamente) — esta story assume que o projeto é criado uma vez, manualmente ou via CLI, pelo @devops com as credenciais de conta do Gabriel/Trifold; não há indicação no epic de que a criação do projeto precise ser scriptada/repetível além do reset de schema.

---

## Acceptance Criteria

- [ ] **AC1 — Projeto separado provisionado:** existe um projeto Supabase distinto de produção (`dsopqkqjkmhytudaaolv`) e do Supabase de dev existente, criado sob a conta/organização autorizada pelo Gabriel (D6). Nome do projeto documentado no Dev Agent Record desta story (ex.: `trifold-crm-tenancy-test` ou equivalente — decisão do @devops no momento da criação). [Source: epic-87 §10, story 87-3, AC1; D6]

- [ ] **AC2 — 222 arquivos de migration aplicados do zero, sem erro:** `supabase db push` (ou Management API equivalente) contra o projeto novo aplica os 222 arquivos de `supabase/migrations/*.sql` (numeração `001` a `199`, com os 20 prefixos duplicados) na ordem em que a ferramenta de fato os aplica, sem falha. Qualquer erro de aplicação encontrado é documentado no Dev Agent Record — se algum erro for encontrado, ele é um achado real do projeto (prova que a sequência de migrations não é 100% reproduzível do zero) e deve ser reportado ao @architect/@data-engineer, não silenciosamente contornado dentro desta story. **Atenção especial ao risco R2** (ordem lexicográfica × numérica) — se a aplicação falhar, a primeira hipótese a checar é essa divergência de ordenação, não a integridade do conteúdo das migrations. [Source: epic-87 §10, story 87-3, AC1: "o que também prova que a sequência de migrations é reproduzível"]

- [ ] **AC3 — Credenciais como secrets de CI, gravadas corretamente:** URL, anon key e service-role key do projeto descartável gravados como secrets do repositório GitHub via `gh secret set` (nomes sugeridos: `TENANCY_TEST_SUPABASE_URL`, `TENANCY_TEST_SUPABASE_ANON_KEY`, `TENANCY_TEST_SUPABASE_SERVICE_ROLE_KEY` — confirmar convenção com @devops se já existir padrão de nomenclatura de secret no projeto). Verificação pós-gravação: `gh secret list` confirma a presença dos 3 secrets (o comando não revela o valor, mas confirma que não estão vazios/ausentes — o mesmo cuidado do gotcha de `vercel env add`/stdin, adaptado: `gh secret set` via `--body` ou arquivo, nunca via pipe que possa truncar). [Source: epic-87 §10, story 87-3, AC2; NFR-10]

- [ ] **AC4 — Script de reset determinístico:** `scripts/reset-tenancy-testdb.ts` (ou equivalente) existe e, ao rodar, deixa o projeto descartável num estado limpo e conhecido — verificável rodando o script duas vezes seguidas e confirmando que o schema/dado resultante é idêntico nas duas execuções (idempotência do reset, não da migration em si). [Source: epic-87 §10, story 87-3, AC3]

- [ ] **AC5 — Documentação de "nunca recebe dado de produção":** um comentário/README explícito, no próprio `scripts/reset-tenancy-testdb.ts` (topo do arquivo) ou em `scripts/README.md` (criar se não existir), declara em português claro que este projeto é exclusivo para testes cross-tenant automatizados, nunca recebe dump/cópia de produção, e não deve ser usado para debug manual de dados reais. [Source: epic-87 §10, story 87-3, AC4]

- [ ] **AC6 — Nenhuma credencial commitada em texto claro:** revisão do diff desta story confirma que nenhum valor de URL/key aparece hardcoded em nenhum arquivo versionado — só nomes de env var/secret. [Source: NFR-10; gotcha geral do projeto sobre segredos]

---

## Tasks / Subtasks

- [ ] **T0 — Confirmar desbloqueio (bloqueante, ver seção "Bloqueio explícito")**
  - [ ] T0.1 — Confirmar com o Gabriel que o projeto Supabase descartável foi criado (conta/organização, não só a autorização D6) antes de iniciar qualquer outra task
  - [ ] T0.2 — Se ainda não criado, **parar aqui** e escalar — não prosseguir com workarounds (ex.: usar um schema separado dentro do projeto de produção não cumpre o objetivo de isolamento físico que motiva esta story)

- [ ] **T1** — Aplicar os 222 arquivos de migration do zero (AC2)
  - [ ] T1.1 — Obter `SUPABASE_DB_URL` do projeto novo
  - [ ] T1.2 — **Antes de rodar `db push`:** listar os 20 prefixos numéricos duplicados (`021, 024, 025, 027, 028, 029, 031, 032, 033, 034, 036, 044, 048, 063, 066, 075, 102, 104, 164, 170`) e revisar manualmente (ainda que superficialmente) se algum par de arquivos do mesmo prefixo tem dependência de ordem que a ordenação lexicográfica de `db push` poderia quebrar (ver R2 — exemplo já identificado: `024b_mensagens_sender_display_name.sql`). Não é uma auditoria completa de 20 pares — é uma checagem de risco antes de gastar o tempo de rodar a aplicação completa.
  - [ ] T1.3 — Rodar `supabase db push --db-url <url-do-projeto-novo>` (reusar o padrão de `scripts/sync-schema.sh`, adaptado — ver Dev Notes) e capturar log completo
  - [ ] T1.4 — Se houver erro, documentar exatamente em qual migration e por quê, checando primeiro se é um caso de divergência de ordem (R2) antes de assumir outra causa; decidir se é escopo desta story corrigir ou só reportar

- [ ] **T2** — Gravar secrets de CI (AC3, AC6)
  - [ ] T2.1 — `gh secret set TENANCY_TEST_SUPABASE_URL --body "..."` (e equivalentes para as 2 outras chaves)
  - [ ] T2.2 — `gh secret list` para confirmar presença
  - [ ] T2.3 — Confirmar que nenhum valor foi gravado em arquivo versionado durante o processo (ex.: `.env` de teste local não commitado)

- [ ] **T3** — Escrever o script de reset (AC4)
  - [ ] T3.1 — Decidir estratégia: reaplicar os 222 arquivos de migration do zero a cada reset (mais lento, mais garantidamente limpo) vs. truncar tabelas + reseed mínimo (mais rápido, risco de deixar resíduo de schema alterado por teste) — documentar a escolha e o porquê
  - [ ] T3.2 — Implementar `scripts/reset-tenancy-testdb.ts`
  - [ ] T3.3 — Validar idempotência (rodar 2x, comparar estado)

- [ ] **T4** — Documentar (AC5)
  - [ ] T4.1 — Escrever o aviso de "nunca recebe dado de produção" no local escolhido
  - [ ] T4.2 — Registrar nome do projeto, org Supabase, e processo de acesso (quem tem permissão) no Dev Agent Record

---

## Dev Notes

### Arquivos a criar
- `scripts/reset-tenancy-testdb.ts` (ou `.sh`)
- `scripts/README.md` (se optar por documentar ali em vez de no topo do script)

### Contagem de migrations corrigida nesta story — 222 arquivos, 20 prefixos duplicados, ordem lexicográfica ≠ ordem de criação
A primeira versão desta story usava "199 migrations" ao longo do texto. **Está errado** — 199 é o maior *número* de prefixo (`199_hotfix_rls_org_scope.sql`), não a contagem de arquivos. Reconferido nesta correção: `ls supabase/migrations/*.sql | wc -l` → **222**. A diferença (222 − 199 = 23 arquivos "extras", refletindo 20 prefixos com mais de um arquivo, alguns com 3 variantes) vem de prefixos numéricos reaproveitados com sufixo de letra (`024`, `024b`, etc.) ou duplicados de outra forma. Lista completa dos 20 prefixos duplicados, reconferida por `ls supabase/migrations/*.sql | xargs -n1 basename | sed -E 's/^([0-9]+).*/\1/' | sort | uniq -c`: `021, 024, 025, 027, 028, 029, 031, 032, 033, 034, 036, 044, 048, 063, 066, 075, 102, 104, 164, 170`. **O `CLAUDE.md` do projeto cita uma lista incompleta** ("021, 024, 025, 027, 031-034, 036, 044, 048, 063, 066, 075, 102, 104" — faltam `028`, `029`, `164`, `170`); não é escopo desta story corrigir o `CLAUDE.md`, mas vale reportar ao @architect/@pm.

**Por que isso importa de verdade, não é só pedantismo de contagem:** `supabase db push` aplica os arquivos em **ordem lexicográfica de nome**, não em ordem de data de criação. Produção, ao longo de 216+ migrations reais, foi construída **incrementalmente** — cada migration aplicada no momento em que foi criada, o que **não é necessariamente** a mesma sequência que a ordenação lexicográfica produziria hoje, especialmente perto dos prefixos duplicados. Exemplo concreto: `024b_mensagens_sender_display_name.sql` — o sufixo `b` o coloca, na ordenação lexicográfica, imediatamente depois de `024_*.sql` e antes de `025_*.sql`; mas não há garantia de que ele tenha sido *criado e aplicado em produção* exatamente nessa posição relativa às migrations vizinhas por número (o sufixo de letra geralmente indica "adicionado depois, encaixado retroativamente no número"). Se `024b` (ou qualquer um dos outros 19 casos duplicados) depende de algo que uma migration de número mais alto criou primeiro em produção, a aplicação do zero — que segue estritamente a ordem lexicográfica — pode falhar num ponto que produção nunca passou, porque produção nunca aplicou nessa ordem. **Isto é exatamente o tipo de coisa que esta story existe para descobrir** (ver AC2, R2, T1.2).

### Reuso parcial de `scripts/sync-schema.sh`
Diferente da correção feita em `87-2a` (onde `sync-schema.sh` foi encontrado **não** fazer o que a arquitetura assumia — gerar snapshot), aqui o script **é** diretamente reaproveitável para o propósito real dele: `supabase db push --db-url <url>` contra um ambiente novo. `sync-schema.sh` já suporta `--env staging|prod|both` lendo `SUPABASE_DB_URL_STAGING`/`SUPABASE_DB_URL_PROD` de variável de ambiente. [AUTO-DECISION] Para esta story, ou (a) estender `sync-schema.sh` com um novo valor de `--env tenancy-test` lendo `SUPABASE_DB_URL_TENANCY_TEST`, ou (b) rodar `supabase db push --db-url` diretamente sem passar pelo script (mais simples, já que o projeto descartável não precisa do prompt de confirmação interativo que o script tem, pensado para staging/prod). Decisão do @devops na implementação — documentar qual foi escolhida.

### Relação com `87-2a`/`87-2c` — mesmo `SUPABASE_MANAGEMENT_PAT`?
O motor do gate de tenancy (`87-2a`) usa `SUPABASE_MANAGEMENT_PAT` contra **produção**. Este projeto descartável é um projeto **diferente**, então precisaria do seu próprio PAT/credenciais se algum dia o gate também rodasse introspecção contra ele — mas isso **não é AC desta story**: o gate de tenancy mede produção; o harness desta story serve aos **testes cross-tenant** (que usam client normal com anon key, não introspecção via Management API — ver `saas-multi-tenant.md` §8.3: "dois clients com ANON key (não service-role)"). Não confundir os dois mecanismos nem os dois conjuntos de credenciais.

### Estratégia de reset — trade-off a documentar, não a inventar como resolvido
O epic pede "reset determinístico" (AC3 original) sem prescrever o mecanismo. Duas opções razoáveis:
1. **Reaplicar os 222 arquivos de migration do zero a cada reset** — mais lento (pode levar minutos), mas garante que nenhum resíduo de um teste anterior sobrevive, e re-testa a reprodutibilidade a cada run.
2. **Truncar tabelas de aplicação (preservando schema) + reseed mínimo** — mais rápido, mas exige uma lista mantida de "quais tabelas truncar" que pode ficar desatualizada conforme novas tabelas nascem (risco de vazamento de estado entre testes se uma tabela nova for esquecida na lista de truncate).

[AUTO-DECISION] Recomendação do @sm (não vinculante — decisão final é do @devops que implementa): começar pela opção 1 (reaplicar do zero) nesta story, porque é mais simples de implementar corretamente e o volume de dado de teste é pequeno (só orgs de teste, criadas e apagadas por cada execução dos testes cross-tenant da Onda 1); otimizar para a opção 2 só se o tempo de reset se provar um gargalo real depois que os testes da Onda 1 existirem — não otimizar prematuramente para um problema de performance que ainda não existe.

### Testing Standards
- Não há suíte automatizada que testa "o script de reset funciona" além de rodá-lo e inspecionar o resultado manualmente (mesmo padrão de infraestrutura observado em `87-1`). A validação de idempotência (AC4) é um passo manual documentado no Dev Agent Record, não um teste Vitest.

---

## Testing

### Abordagem
Validação manual e documentada — esta é uma story de infraestrutura (provisionamento + script de reset), sem lógica de negócio a testar em Vitest.

### Cenários de teste
1. **Aplicação do zero:** os 222 arquivos de migration aplicam sem erro num projeto vazio, na ordem que `supabase db push` de fato usa.
2. **Secrets presentes:** `gh secret list` confirma os 3 secrets gravados, sem valor vazio (verificação indireta — o comando não expõe o valor, mas uma leitura de teste via workflow simples confirma que a env var chega não-vazia ao runner).
3. **Reset — idempotência:** rodar o script de reset 2x seguidas; confirmar que o estado resultante da 2ª run é equivalente ao da 1ª (mesmas tabelas, mesmo schema, nenhum dado residual de teste anterior).
4. **Isolamento de produção:** confirmar, por inspeção manual das credenciais gravadas, que nenhum secret desta story aponta para os projetos de produção (`dsopqkqjkmhytudaaolv`) ou de dev existente.

---

## Riscos

| ID | Risco | Severidade | Mitigação |
|----|-------|-----------|-----------|
| R1 | PRE-1 demora a ser resolvido e a Onda 1 chega ao fim sem lugar para rodar os testes cross-tenant, forçando o job de isolamento a ficar `continue-on-error` por mais tempo que o planejado — proteção mais fraca, registrada como risco aceito pelo próprio epic (R2) | **Alta** (fora do controle do @sm/@devops) | Escalar prioridade ao Gabriel explicitamente (já feito no relatório desta tarefa); não é mitigável por trabalho técnico adicional |
| R2 | **Causa provável, já identificada nesta story (não é mais hipotética):** a ordem em que `supabase db push` aplica os 222 arquivos é **lexicográfica por nome de arquivo**, e produção foi construída **incrementalmente, na ordem de criação histórica** — as duas ordens divergem sempre que existe sufixo de letra num prefixo duplicado. Exemplo concreto verificado: `024b_mensagens_sender_display_name.sql` cai em posição diferente na ordenação lexicográfica do que ocupou na aplicação incremental real. Se alguma migration mais nova depende implicitamente de estado que uma migration "posterior" (por número, mas aplicada antes por ordem de criação) deveria ter criado, a aplicação do zero falha exatamente nesse ponto — não por conteúdo de SQL errado, mas por **ordem**. | **Alta** — deixou de ser risco teórico, é a hipótese nº 1 a testar se AC2 falhar | AC2 aponta explicitamente para este risco como primeira hipótese de diagnóstico; T1.2 lista os 20 prefixos duplicados e checa dependência de ordem antes de rodar `db push` — não assumir que está tudo bem só porque o número está certo |
| R3 | Alguém, por conveniência, usa o projeto descartável para debug manual "só dessa vez" e ele deixa de ser confiavelmente descartável | Baixa-Média | AC5 (documentação explícita) + revisão do @architect no quality gate |
| R4 | Credenciais do projeto descartável vazam para um ambiente de produção por copy-paste de env var (o oposto do erro usual, mas mesmo risco de categoria) | Baixa | AC6 + nomenclatura de secret claramente prefixada (`TENANCY_TEST_*`) para reduzir chance de confusão |

---

## Dependencies

- **Depende de:** `87-1` (para que exista onde gravar secrets de CI e, futuramente, wire o job de isolamento — embora o wiring em si seja Onda 1)
- **Depende de (bloqueante para execução):** **PRE-1** — projeto Supabase descartável precisa existir de fato (não só estar autorizado). Ver seção "Bloqueio explícito" no topo desta story.
- **Bloqueia diretamente:** testes cross-tenant da Onda 1 (`tests/tenancy/cross-tenant.spec.ts`, mencionados como critério de saída da Onda 1 no epic), e `87-17` (citado no `depends_on` do frontmatter do epic como também bloqueado por PRE-1)
- **Dependências técnicas:** `supabase` CLI (já em uso no projeto via `sync-schema.sh`), `gh` CLI autenticado com permissão de secret no repositório

---

## Definition of Done

- [ ] Projeto Supabase descartável confirmado como existente (pré-condição T0, não item a marcar por esta story — é constatação)
- [ ] 222 arquivos de migration aplicados do zero, sem erro (ou erro documentado e reportado)
- [ ] 3 secrets de CI gravados e confirmados
- [ ] Script de reset determinístico funcionando, idempotência validada
- [ ] Documentação de "nunca recebe dado de produção" presente
- [ ] Nenhuma credencial commitada em texto claro
- [ ] @architect executou quality gate com verdict PASS ou CONCERNS documentados e aceitos
- [ ] @devops fez push do commit final

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Disabled
>
> CodeRabbit CLI não está habilitado em `core-config.yaml` (chave `coderabbit_integration` ausente).
> Validação de qualidade usará processo de revisão manual pelo @architect (quality gate desta story).

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-08-02 | 0.1 | Story criada a partir do Epic 87 (§10, Onda 0, story 87-3). Não quebrada — story atômica (provisionamento + script de reset, sem expand/migrate/contract sobre dado existente, sem janela de observação; NFR-1/§10 não se aplica). **Bloqueio de PRE-1 tornado explícito no topo do documento** (não implícito em uma linha de `Dep:`), conforme pedido explícito do spawn desta tarefa — a story pode ser Draft/revisada agora, mas não pode avançar para implementação até o projeto Supabase descartável existir de fato (distinto da autorização D6, que já existe). [AUTO-DECISION] Estratégia de reset recomendada: reaplicar as migrations do zero a cada reset, não truncate+reseed → reason: mais simples de implementar corretamente agora; otimizar depois só se performance se provar gargalo real. [AUTO-DECISION] Nomenclatura de secrets `TENANCY_TEST_*` → reason: reduzir risco de confusão com credenciais de produção/dev existentes. | @sm (River) |
| 2026-08-02 | 0.2 | **Validação @po — GO condicional (8/10), 3 correções aplicadas.** (1) **Números de migration corrigidos:** eram 222 arquivos `.sql`, não 199 (199 é só o maior *prefixo numérico*); todas as ~10 ocorrências de "199 migrations" no texto foram trocadas por "222 arquivos de migration". (2) **Lista de prefixos duplicados corrigida:** são 20, não 18 — `021, 024, 025, 027, 028, 029, 031, 032, 033, 034, 036, 044, 048, 063, 066, 075, 102, 104, 164, 170` (reconferido via `ls`+`sed`+`uniq -c`; `028`/`029` faltavam na lista original desta story, e `164`/`170` também não estavam no `CLAUDE.md`, cuja lista está incompleta — reportar ao @architect/@pm). (3) **Risco de ordenação nomeado como causa provável, não teórica:** `supabase db push` aplica em ordem lexicográfica de nome de arquivo; produção foi construída em ordem de criação incremental; as duas divergem perto de prefixos duplicados — exemplo concreto `024b_mensagens_sender_display_name.sql`. R2 reescrito para nomear essa divergência como hipótese nº1 de falha (não mais "dependência implícita de estado" genérica); nova task T1.2 (renumerando T1.2→T1.3, T1.3→T1.4) para checar os 20 pares antes de rodar `db push`; nova seção em Dev Notes. **Contradição Ready/Draft resolvida:** decisão do @po registrada — a story **permanece em `Draft`** (não `Ready`) mesmo com o GO dado, porque aqui GO libera o *conteúdo*, não a *implementação* (que segue bloqueada por PRE-1, uma pré-condição externa, não uma pendência de revisão). Texto do "Bloqueio explícito" reescrito para eliminar a leitura contraditória entre os itens 1 e 4 (item 1 agora afirma a validação já concluída; item 4 explica por que `Draft` é o status correto mesmo assim, e como a transição para `Ready` acontecerá sem nova rodada de conteúdo quando PRE-1 existir). | @po (Pax) via @sm |

---

## Dev Agent Record

### Agent Model Used
_A preencher pelo @devops na implementação (após PRE-1 resolvido)._

### Debug Log References
_A preencher._

### Completion Notes List
_A preencher._

### File List
_A preencher._

---

## QA Results

_A preencher pelo @architect (quality gate desta story)._
