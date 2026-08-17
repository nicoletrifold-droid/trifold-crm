# Validação @po — Story 75-331 (*agenda no fim do formulário*)

**Validador:** @po (Pax) · **Data:** 2026-08-17 · **Story:** `docs/stories/75-331-formulario-agenda-no-fim.story.md`
**Epic:** 89 · **Depende de:** 75-330 (PR #437, aberto)
**Base:** branch `story/75-331-formulario-agenda-no-fim`, empilhada sobre a 75-330. Verificações contra a árvore e contra **produção em SELECT** (Management API).

---

## VEREDITO: 🟠 **GO BLOQUEADO** — 1 pergunta de negócio precisa de resposta antes do @dev

A story está bem construída e a armadilha central que ela levanta (§1) **se confirma**. Mas ao
puxar esse fio encontrei uma segunda consequência que **nenhum de nós tinha visto**, e ela não
é técnica: é uma decisão de operação que só o Marcos fecha (§2).

Placar do checklist: **8/10** — a nota não é o problema; a pergunta aberta é.

---

## 1. ✅ A armadilha do `assigned_broker_id` — CONFIRMADA

`lib/roleta/distributor.ts:86-88`, lido na árvore:

```ts
// Guard: lead já foi atribuído por execução concorrente — não redistribuir
if (lead.assigned_broker_id !== null) {
  return { status: "sem_corretor_disponivel" }
}
```

A story está certa: carimbar o SDR e depois chamar o distribuidor devolveria
`sem_corretor_disponivel` **sem erro e sem log de falha**. O lead ficaria parado com o SDR
para sempre e ninguém perceberia — a D3 pareceria implementada.

**Precisão que a story errou (corrigida no corpo):** as linhas são **86-88**, não 85-88.

**Fato que ajuda e a story não sabia:** apesar do nome, `assigned_broker_id` **referencia
`users(id)`** (`001_base_schema.sql:134`), não `brokers(id)`. Então carimbar o usuário do SDR
funciona direto, sem passar pela tabela `brokers`. Anotado na story.

## 2. 🔴 O ACHADO NOVO — a roleta pode devolver o lead para a própria SDR

Medido em produção (`SELECT`, sem escrita):

```
name    | role | is_active | tem_linha_em_brokers
Thielly | sdr  | true      | true
```

A Thielly **está no pool da roleta** — é o desenho da Story 75-226, não um acidente. E a RPC
que escolhe o próximo é `roleta_pick_and_advance(uuid, uuid, uuid, integer)` =
`(org, lead, property, max_leads_per_day)`: **não existe parâmetro de exclusão**.

Consequência: no fluxo da D3 — SDR confirma → limpa o dono → entrega à roleta — a roleta pode
**sortear a Thielly de novo**. O lead voltaria para quem acabou de confirmá-lo, e o corretor
que deveria fechar nunca o receberia.

Não é bug de código; é lacuna da regra de negócio. A D3 diz "depois roleta", mas não diz o que
acontece se a roleta apontar de volta para o SDR.

**As três saídas, com o custo de cada uma:**

| Saída | O que implica |
|-------|---------------|
| **(a) Aceitar** | Mais simples, zero código. Mas contraria o desenho "SDR qualifica, corretor fecha": às vezes o lead ficaria com quem já o trabalhou |
| **(b) Excluir o SDR nesta distribuição** | O correto conceitualmente. Custa **migration** (novo parâmetro na RPC) e mexe numa função crítica e concorrente — a que já tem advisory lock por org |
| **(c) Redistribuir se cair no SDR** | Sem migration, mas é gambiarra: pode entrar em laço quando a Thielly for a única disponível |

**Recomendação do @po: (b)** — mas não decido isto sozinho, porque muda como a operação
funciona e porque (b) toca a RPC mais sensível do sistema.

## 3. Outras observações (não bloqueiam)

- ✅ **AC5 pede o teste certo.** "Um teste que só verifique `status = 'confirmed'` não vale" —
  é exatamente a parte silenciosa. Mantido como está.
- ✅ **Zero migrations é verdade** — desde que a saída (b) da §2 não seja escolhida. Se for,
  a story passa a ter migration **233** e a estimativa sobe de L para L+.
- ⚠️ **A ação de confirmar é construção nova**, e a story diz isso. Confirmado: o único
  `status: "confirmed"` do código está em `visit-feedback/route.ts:216`, outro fluxo.
- ⚠️ **A estimativa L está no limite.** Se (b) entrar, recomendo **fatiar**: 75-331 = agenda +
  visita `scheduled` com SDR; 75-333 = confirmação + entrega à roleta. Fatiar deixa metade da
  D3 em produção sem a outra — aceitável por dias, não por semanas.

## 4. Checklist

| # | Item | Nota |
|---|------|------|
| 1 | Título claro | ✅ |
| 2 | Descrição completa | ✅ o "porquê" da armadilha está explícito |
| 3 | ACs testáveis | ✅ AC5 e AC7 especialmente bem postos |
| 4 | Escopo IN/OUT | ✅ |
| 5 | Dependências | ⚠️→✅ faltava a consequência da §2; incluída |
| 6 | Estimativa | ⚠️ L, no limite; muda se a §2 for (b) |
| 7 | Valor de negócio | ✅ |
| 8 | Riscos | ⚠️→✅ §2 acrescentado |
| 9 | DoD | ✅ |
| 10 | Alinhamento com o epic | ✅ D1/D2/D3 preservadas |

**8/10.**

## 5. O que trava

⛔ **Não liberar o @dev antes da resposta da §2.** Implementar (a) e depois trocar para (b)
significa refazer a parte que toca a RPC — o pedaço mais caro e mais arriscado da story.

— Pax, @po

---

# ADENDO — 17/08, após a decisão do Marcos

## VEREDITO REVISTO: 🟢 **GO** — `Draft` → **`Ready`**

A pergunta da §2 foi respondida **dissolvendo o problema em vez de escolhendo entre (a), (b) e
(c)**: não existe passo de confirmação e não existe entrega à roleta. O lead agenda, a visita
cai na agenda, o SDR fica como responsável e transfere manualmente quando fizer sentido.

**O que isso apaga:**

| Item | Antes | Agora |
|------|-------|-------|
| Tela/endpoint de confirmar | construção nova (nenhuma tela do sistema promove `confirmed` hoje) | **não existe** |
| Chamada ao distribuidor | precisava limpar `assigned_broker_id` antes, senão falhava calada | **não existe** |
| Migration na `roleta_pick_and_advance` | provável, para excluir o SDR do sorteio | **não existe** |
| Estimativa | L (~8 pts) | **M (~5 pts)** |
| Migrations | 0 ou 1 | **0** |

As duas armadilhas que eu havia levantado continuam **verdadeiras** — só deixaram de ser
problema desta story, porque o caminho que passava por elas foi cortado. Ficam registradas
aqui: qualquer story futura que queira automatizar a entrega deste lead à roleta vai reencontrar
as duas.

## 🔴 A pendência que sobra NÃO é de código

Medido em produção:

```
leads.transferir → admin: true · supervisor: true · sdr: FALSE
```

**A Thielly não consegue transferir lead hoje.** O desenho novo depende disso para fechar.
Duas saídas, ambas na matriz de Perfis de Acesso (tela existente, sem deploy):

- ligar `leads.transferir` para o perfil `sdr`; ou
- deixar a transferência com admin/supervisor, e o SDR só trabalha o lead.

Não bloqueia a implementação — bloqueia a **operação**. Registrado na DoD.

## Checklist revisto

Itens 5 (dependências), 6 (estimativa) e 8 (riscos) reavaliados com o escopo novo:
**9/10**. GO.

— Pax, @po
