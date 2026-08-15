# Parecer @po — Story 87-14 (o switch da Nicole na lista, e só para quem pode)

**Validador:** @po (Pax) · **Data:** 2026-08-15 · **Repo:** `24800872` (main) · **Prod:** `dsopqkqjkmhytudaaolv`
**Story:** `docs/stories/87-14-switch-da-nicole-na-lista-e-so-para-quem-pode.story.md`

## Veredito: 🟢 **GO** — 9/10 — `Draft → Ready`, com **8 emendas já aplicadas** por mim

Confiança de implementação: **Alta**. A story é a mais bem medida deste epic — cada número tem
`arquivo:linha` ou consulta ao lado, e reconferi **todos**. O que ela não tinha era **ACs
executáveis**: três delas eu rodei e elas **não podem ficar verdes** como estavam escritas. Não
devolvi a story por isso; corrigi as réguas, porque o diagnóstico e o desenho estão certos e o
problema era de instrumento.

---

## 1. O que reconferi do @sm — e o placar

Não aceitei nenhuma medição. Refiz todas.

| # | Afirmação do @sm | Minha medição | Bate? |
|---|---|---|---|
| 1 | 4 empreendimentos, Vind/Yarden ligados, Japura/Solum desligados, tipologias 1/2/0/0 | mesma query, mesma saída, linha a linha | ✅ |
| 2 | matriz dos 10 papéis (`imoveis`, `imoveis.editar`, `imoveis.ativar_nicole`) + ativos | `roles × role_permissions × users` — **as 10 linhas idênticas**, inclusive os 5+4+2+1 ativos | ✅ |
| 3 | 3 pessoas passam pelo guard e levam 403 (`obras` 2 + `gerente-relacionamento` 1) | confirmado | ✅ |
| 4 | `IMOVEIS_CREATE_ROLES`/`EDIT_ROLES`: 8 ocorrências, todas comentário ou nome de teste | `grep -rn` em `packages/*/src`: **exatamente 8**, zero declaração, zero import | ✅ |
| 5 | `imoveis.ativar_nicole` em `capabilities.ts:165`, `seed: [A, S]`, `enforced: true` | linha 165, idem | ✅ |
| 6 | rota cobra em `route.ts:125` | `requireCapability(appUser, "imoveis.ativar_nicole")` na 125 | ✅ |
| 7 | `edit/layout.tsx` guarda por `canEditImoveis` (capability **outra**) | confirmado; `imoveis.editar` tem seed `[A, S, OBR, GR]` | ✅ |
| 8 | `KNOWN_ROLES` = 10 papéis; produção tem 12 `role` distintos | `capabilities.ts:21-31` = 10; `select distinct role from users` = 12 (+`cliente`, +`auxadministrativo`) | ✅ |
| 9 | grep da AC5 = **15** linhas em `edit/page.tsx` | 15, e **as 15 linhas são exatamente as que ele listou** (`:32 :46 :71 :74 :79 :115 :116 :194 :195 :196 :213 :218 :442 :460 :462`) | ✅ |
| 10 | `nicole-enabled.test.ts` tem 14 casos | 14 `it()`, e **rodei**: `14 passed`, 203ms | ✅ |
| 11 | AC8: sem `testing-library`, 0 `*.test.tsx`, `include` só `*.test.ts` | as três, idênticas | ✅ |
| 12 | lista é Server Component, `select` com `nicole_enabled` em `:14`, badge no `<span>` | confirmado (badge em `:66-74`, não `:64-76` — cosmético) | ✅ |
| 13 | `/dashboard/properties` sem `canAccess("imoveis")` | varri as 8 páginas/layouts: nenhuma cobra o módulo | ✅ |

**13 de 13.** O @sm mediu o que disse que mediu. O que segue não é desconfiança do dado — é
execução das réguas.

### O que eu medi e ele não

- **Não existe `user_permission_exceptions` em `imoveis*`** (as 5 exceções da base são de outros
  módulos). Importa porque `can()` resolve *exceção do usuário → perfil → herança*: hoje a matriz
  de papéis é a **verdade inteira**, e a D1 não tem exceção individual escondida por baixo.
- **29 das 103 capabilities do registro têm `seed` exatamente `[A, S]`** — ver E6.
- **Baselines de `tsc` e `lint`** — ver E8.

---

## 2. As três ACs que eu executei e que **não fechavam**

Isto é o núcleo do parecer. Nenhuma foi encontrada por leitura.

### 🔴 E1 — AC6 exclui o arquivo que a própria story manda editar

A AC6 dizia: `git diff --stat origin/main...HEAD -- packages/ai/ supabase/migrations/
packages/web/src/app/api/` ⇒ *"esperado: nenhuma linha de saída"*.

A **T6** manda acrescentar os casos de AC1/AC2/AC3 em
`packages/web/src/app/api/properties/nicole-enabled.test.ts` — que está **dentro** do terceiro
pathspec. Rodei o comando do @sm contra o commit real que mexeu naquele arquivo:

```
$ git diff --stat ca26e5ed~1..ca26e5ed -- packages/ai/ supabase/migrations/ packages/web/src/app/api/
 packages/web/src/app/api/properties/[id]/route.ts        |    9 +-
 .../src/app/api/properties/nicole-enabled.test.ts        |   21 +-
 ...
```

AC6 e AC1/AC2/AC3/T6 eram **mutuamente exclusivas**. E a AC6-(iii) diz que, se ela ficar vermelha,
*"a story mudou de escopo e volta para o @po"* — ou seja, a story tinha um gatilho armado contra si
mesma que **dispararia com certeza**.

**Emenda:** separar código de teste. `--name-only` com exclusão explícita do arquivo de teste
(esperado: vazio) + `--numstat` daquele arquivo provando diff **aditivo**. O que a story promete não
tocar é o **enforcement**, não a prova dele.

### 🔴 E2 — o controle positivo da AC1 é satisfeito por um no-op

A AC1 mandava: *"autorizado ⇒ `status !== 403`"*. **Isso fica verde com o gate inteiro apagado.**

O gate só roda dentro do `if (muda)` (`route.ts:121`). Um `PATCH` que **não muda** o valor devolve
`200` sem nunca consultar a capability — é literalmente o caso do teste
`"reenviar o valor ATUAL não exige o papel elevado"` que já existe no arquivo (`:227`).

Pior: o laço proposto sobre `KNOWN_ROLES` **não reseta a fixture**. `KNOWN_ROLES[0] === "admin"` ⇒
a primeira volta liga o Vind, e **as 9 seguintes viram no-op**. Metade do laço mediria o vazio; a
outra metade falharia por motivo errado.

> Na `87-13` eu peguei uma AC que ficava em zero subisse ou não subisse a story. Esta é a irmã
> dela: a AC ficava **verde** subisse ou não subisse o gate.

**Emenda:** reset da fixture a cada volta + `status === 200` **e** `linha(VIND).nicole_enabled ===
true` no ramo autorizado. O controle positivo só vale se a alteração **aconteceu**.

### 🔴 E8 — `npx tsc --noEmit` da raiz já nasce com 14.292 linhas de erro

A AC7-(iii) pedia *"`npx tsc --noEmit` limpo"*. Rodei:

```
$ npx tsc --noEmit | wc -l
14292          # 14.241 em packages/ , 34 em scripts/
```

O `tsconfig` da raiz não resolve `node_modules` por pacote. *"Limpo"* nunca seria verdade — a AC
seria cumprida por interpretação, que é o oposto do que ela existe para fazer. O gate real é o
script `type-check` de `packages/web` (`package.json:10`), e esse **está limpo**:

```
$ cd packages/web && npx tsc --noEmit | wc -l
0
```

**Emenda:** comando trocado; baseline de `lint` também registrado (**0 errors, 23 warnings**), para
*"sem erro novo"* medir contra número e não contra zero.

---

## 3. As outras cinco emendas

### 🟡 E3 — a mutação da AC3 era tiro de festim

AC3-(iii) mandava *"mover a chamada de `carregarCadastroNicole` para fora do `if (desejado)`"* e
prometia que (i) cairia. Conferi `route.ts:131-152`: mover **só** a chamada deixa
`avaliarMinimosNicole` e o `return` 422 dentro do `if (desejado)` ⇒ **o comportamento não muda em
caso nenhum** e (i) segue verde. Mutação que não mata teste não prova nada. Corrigida para *"remover
o `if (desejado)`"* (o bloco inteiro).

*(A tese da AC3 está certa e confirmei no código: `requireCapability` está no `if (muda)` (`:121`),
**antes** do `if (desejado)` (`:131`). "Desligar nunca é bloqueado" é sobre os mínimos, não sobre
papel. A AC merece existir.)*

### 🟡 E6 — a capability é indistinguível de outras 28

Contei: **29 das 103 capabilities têm `seed` exatamente `[A, S]`** — incluindo `imoveis.criar`,
`imoveis.apagar`, `imoveis.vender_unidade` e `imoveis.tipologias_editar`.

Se o @dev escrever `can(user.id, user.orgId, "imoveis.criar")` no `page.tsx`, isso **compila** (é
`CapabilityKey` válida), **acerta a tela hoje** (resposta idêntica nos 10 papéis) e **nenhum teste
deste repositório detecta**: a AC1 exercita a rota, que não muda; o componente não é testável
(AC8). A divergência só apareceria no dia em que o Gabriel mexesse na matriz do painel — **sem
deploy e sem aviso**, que é exatamente o cenário para o qual a story escolheu `can()`.

É colinearidade de fixture pelo eixo da capability: **28 escolhas erradas ficam verdes**.
Emenda: **AC5-(v)**, `grep -c '"imoveis.ativar_nicole"' page.tsx` = 1. Uma linha de régua para
separar as 29.

### 🟢 E7 — AC7-(ii) contava, não congelava

*"Os 14 casos continuam existindo"* medido por **contagem** sobrevive a um `it()` renomeado. Passa a
exigir os 14 títulos **verbatim**.

### ⚖️ E4 e E5 — as decisões de desenho, na seção 4.

---

## 4. As três decisões

### D1 — quem pode: `admin` + `supervisor` ⚖️ **Gabriel**

Fechada, não reabro. A story já estava certa. Só acrescentei a medição que faltava: **não há
exceção individual** em `imoveis*`, então a matriz de papéis é a verdade inteira e a D1 não tem
letra miúda.

### D2 — quem não pode **vê o estado, sem controle** ⚖️ **Gabriel**

Recusa as duas saídas que estavam na mesa: nem o desabilitado-com-motivo do @sm, nem ocultar a
coluna. Consequência de desenho, que apliquei: quando `interativo === false`, o componente renderiza
**exatamente o `<span>` de hoje** (`page.tsx:66-74`, mesmas classes, mesmo texto), acrescido de
`title` — **nenhum `<input>`, nenhum `onClick`**. Para os 8 papéis sem permissão, a célula fica
**byte a byte** o que já está em produção; o diff é `+title`.

Isso é mais barato **e** mais honesto que o desabilitado: um `<input disabled>` ainda comunica
*"aqui existe um controle que você não pode usar"*, o que é exatamente o tipo de meia-verdade que
esta story existe para tirar da tela.

**Onde bateu:** Desenho §1 e §2, AC4-(i)/(ii), AC8 passo 4 (que agora pede **print lado a lado**,
antes × depois, provando que o badge de quem não pode não mudou).

### D3 — a confirmação ⚖️ **minha**

**Mantida, e estendida às duas direções.** O @sm queria confirmar só ao ligar, apoiado em *"desligar
é o lado seguro"*. Contei as linhas antes de aceitar:

| direção | alcançável hoje em | rede já existente |
|---|---|---|
| **ligar** | Japura, Solum (`tipologias = 0`) | 🟢 o servidor **já barra**: 422 do mínimo `B1` (`route.ts:130-152`) |
| **desligar** | Vind, Yarden (as 2 que a Nicole usa) | 🔴 **nenhuma** — sem mínimos, sem `system_event` |

Confirmar só ao ligar protege **a direção que já tem rede** e deixa nua a que não tem. Régua
saturada: dispara onde não precisa, cala onde precisaria. Desligar o Vind por engano é a ação mais
consequente desta tela — a Nicole para de citar o carro-chefe para lead pago, **em silêncio**,
porque ninguém é notificado e nada fica registrado (Achado nº 3).

⚠️ **E o argumento do @sm é a AC3 lida errado.** *"Desligar nunca é bloqueado"* é decisão minha na
`87-13` sobre os **mínimos de cadastro** — não é um juízo de que desligar seja inconsequente. A AC3
existe justamente para impedir essa leitura de circular; reaproveitá-la como argumento de UX é
propagá-la para outra camada.

**Custo:** `precisaConfirmar` (booleano) vira `textoConfirmacao` (string derivada da direção). A
decisão continua fora do JSX — que é o princípio de desenho da story — e a AC4-(iii) ganha
**conteúdo** em vez de um booleano. **Deixa de ser bloco separável:** é a única rede da direção sem
rede. R3 rebaixado para impacto Baixo; **R3b aberto** com impacto Alto.

### E5 — a tela de edição fica sem espelho (ratifico o @sm)

Reavaliei à luz da D2, como pedido. **Mantenho o ponteiro estático.** Espelhar o estado exigiria
manter `nicole_enabled` na `interface PropertyData` e no `setState` do `fetch` — e a AC5 mede
**zero** ocorrência do identificador porque hoje ele aparece **15 vezes** nesse arquivo, **3 delas
dentro do `handleSave`** (`:194-196`). Espelho e AC5 são incompatíveis, e o vetor que a AC5 fecha
(um refactor futuro remontar o body a partir do estado e ressuscitar o 403) é real.

A D2 é sobre **a lista**, que é onde o estado dos 4 empreendimentos significa alguma coisa — em
comparação. Quem edita está a um clique dela.

Duas exigências que acrescentei, para o ponteiro não virar rodapé: (a) fica **no lugar visual do
bloco removido** (a caixa `mt-6` com borda), para quem rolar até lá achar a explicação onde o
controle estava; (b) `<Link>` de verdade, não texto solto.

---

## 5. Achado nº 2 — julguei, e discordo da cor

O @sm classificou como 🟡 fora de escopo. **Concordo do escopo, promovi a 🔴, e dei dono.**

Reconferi: das 8 páginas/layouts sob `properties/`, **só as três sub-rotas** têm guard, todas por
`canEditImoveis`. **Nenhuma** cobra o módulo. 5 pessoas ativas com `imoveis = false` alcançam lista e
detalhe por URL — e duas delas (`social-media`, `auxadministrativo`) **não têm nem `imoveis.editar`**:
leem regras comerciais, diferenciais, FAQ e restrições sem nenhuma capability do módulo.

**Por que não entra nesta story:** o guard **remove acesso de gente que hoje o tem**, sem pedido —
inclusive de `obras`/`gerente-relacionamento`, que *editam* o empreendimento e passariam a não
conseguir **abrir** a lista de onde se chega ao formulário. `imoveis.editar = true` com módulo
`imoveis = false` é uma incoerência que a matriz permite e que só o @pm resolve.

**Por que não fica só num Achado:** é onde furo de acesso vai morrer. Item aberto em
`docs/backlog.md` — *"[SEGURANÇA] 🔴 Módulo `imoveis` não é cobrado na lista nem no detalhe"*, com a
tabela dos 4 papéis e o Achado nº 1 (`auxadministrativo` fora do `KNOWN_ROLES`) anexado, porque é o
mesmo mecanismo mudo.

**Não muda o veredito:** a story não piora nada — as 5 pessoas já leem esse badge hoje, e por D2
continuarão lendo.

---

## 6. AC8 — aceito aqui, e **parei de aceitar caso a caso**

As três medições do @sm batem. A declaração está correta: `.test.tsx` **nem seria coletado** pelo
runner.

Mas é a **quarta story seguida** com item de tela não verificável (`87-0`, `87-10`/`87-11`, `87-13`,
`87-14`). Cada uma paga o mesmo pedágio: o @sm gasta parágrafos provando que não dá, eu reconfiro as
três medições, e a verificação vira print no gate. Declarar de novo na 87-15 seria transformar
dívida em praxe.

Item aberto: *"[QA] 🔴 Não existe harness de teste de componente React"*, com a régua de aceitação
amarrada ao caso concreto da fila — *"o badge aparece para `obras` e o `<input>` não"*. Se a solução
escolhida não provar isso, não resolve o problema que gerou o item.

**A 87-14 não espera o item.** Ela é a última que declara sem que exista dono.

---

## 7. Checklist de 10 pontos

| # | Critério | Nota | Observação |
|---|---|---|---|
| 1 | Título claro | ✅ | diz o quê e para quem |
| 2 | Descrição completa | ✅ | os dois defeitos em duas linhas; §3 mede o furo |
| 3 | ACs testáveis | ⚠️→✅ | **3 eram inexecutáveis** (E1/E2/E8) + 1 mutação morta (E3). Corrigidas |
| 4 | Escopo definido | ✅ | AC6 é a fronteira mecânica — agora com a régua certa |
| 5 | Dependências mapeadas | ✅ | `87-13` (mergeada), `75-306`; sem colisão com a fila da Onda 1 (não abre `packages/ai/`) |
| 6 | Estimativa | ✅ | S — 3 tocados, 2 criados, 2 de teste |
| 7 | Valor de negócio | ✅ | encontrabilidade + parar de oferecer o que o servidor recusa a 3 pessoas |
| 8 | Riscos documentados | ✅ | R1-R5 + **R3b** que eu abri |
| 9 | DoD | ✅ | atualizada com os comandos corrigidos |
| 10 | Alinhamento com o epic | ✅ | §10 (*"nenhuma AC pode ser 'existe no painel'"*) respeitada: AC1-AC3 são efeito HTTP, AC5/AC6 são comando, AC8 é declarada |

**9/10.** O ponto perdido é o 3: quatro réguas com defeito num conjunto de oito não é detalhe — é a
diferença entre um gate e um teatro de gate. Estão corrigidas, e é por isso que o veredito é GO.

---

## 8. Para o @dev — os cinco pontos que mais custam se ignorados

1. **`cd packages/web && npx tsc --noEmit`** — o da raiz devolve 14 mil linhas e **não** é o gate.
2. **Reset da fixture a cada volta do laço da AC1**, e assertar o **estado da linha**, não só o
   status. Sem isso a AC1 fica verde com o gate apagado.
3. **A chave literal `"imoveis.ativar_nicole"`** no `page.tsx`. 28 chaves erradas passam em tudo.
4. **`interativo === false` ⇒ nenhum `<input>`.** É o badge de hoje + `title`. Decisão do Gabriel.
5. **Confirmação nas duas direções**, e `[Cancelar]` **não chama a rota** (a AC8-6 confere na aba
   Network).

## 9. Para o @pm

- Entrada de `87-14` no `stories_planned` do Epic 87 (o pedido formal está na story). **Não editei o
  corpo do epic** — outro @sm está escrevendo a `87-12` em paralelo.
- Dois itens novos no `docs/backlog.md` (seções 5 e 6 deste parecer) precisam de prioridade.

---

*— Pax, equilibrando prioridades 🎯*
