# Story 75-251 — Gerente-comercial acha o Config (sem escalar privilégio)

**Status:** InReview
**Tipo:** Fix
**Epic:** Roles e Permissões
**Complexidade:** S

## Contexto
Marcos (31/07): *"Precisa dar acesso ao perfil gerente comercial, a parte de
configurações de corretores."*

A investigação mostrou que **o acesso já existe** — o que falta é o caminho:

- `gerente-comercial` tem `corretores = true` na matriz;
- a página de corretores já trata esse módulo (`canAccess(..., "sistema") ||
  canAccess(..., "corretores")`), e o comentário no código diz literalmente
  *"gerente-comercial can manage brokers"*;
- a página índice de Configurações **já filtra** os cards por role, e
  `GERENTE_ALLOWED` já inclui `/dashboard/configuracoes/corretores`;
- o layout do dashboard **não bloqueia rota** — só esconde itens de menu. Não há
  guard por módulo no layout nem no middleware.

⇒ Hoje o gerente-comercial **já consegue** abrir a página digitando a URL. O que
falta é o item **"Config" na sidebar**, gateado em `layout.tsx:290` pelo módulo
top-level `configuracoes`, que ele não tem.

## 🔴 Por que NÃO ligar `configuracoes` no Perfil de Acesso
Parece um toggle de um clique, e seria **escalada de privilégio**. O `canAccess`
**herda do módulo pai** quando não existe linha explícita do sub-módulo
(`permissions.ts:344`), e existe **uma única** linha `configuracoes.*` em produção
(`configuracoes.pipeline` do gerente-comercial). Ligar o pai daria a ele, por
herança:

- `configuracoes.perfil-acesso` → **a própria matriz de permissões**: ele se
  concederia qualquer coisa;
- `configuracoes.integracoes` → credenciais de Meta Ads, WhatsApp, Telegram;
- `configuracoes.clientes`, `configuracoes.empresa`, `configuracoes.horario`,
  `configuracoes.usuarios`.

A alternativa de negar os filhos um por um funcionaria, mas deixa a mesma
armadilha armada para o próximo perfil e para todo sub-módulo novo. A saída certa
é **não abrir o pai**.

## Critérios de aceite
- **AC1** — O item "Config" da sidebar aparece quando o usuário tem o módulo
  `configuracoes` **ou qualquer sub-módulo `configuracoes.*` concedido**.
- **AC2** — A decisão do AC1 é **função pura** sobre o mapa de permissões: sem
  I/O, sem banco, testável em unidade.
- **AC3** — O módulo pai `configuracoes` do `gerente-comercial` **permanece
  `false`**. Nenhuma linha de `role_permissions` é alterada — logo nenhum
  sub-módulo passa a herdar acesso.
- **AC4** — Sub-módulo com linha explícita `false` **não** faz o menu aparecer
  (só conta sub-módulo concedido).
- **AC5** — Zero regressão: admin e supervisor seguem vendo o Config (têm o pai);
  os perfis sem nada seguem sem ver. Suíte verde, `tsc` limpo, build OK.

## Escopo
**IN:** a condição do item Config em `layout.tsx`, a função pura que a decide, e
os testes.

**OUT (decidido):**
- **Mexer na matriz de permissões.** É justamente o que criaria a escalada.
- **Guard de rota por módulo no layout.** O layout hoje só esconde menu; adicionar
  bloqueio de rota é mudança de arquitetura de segurança que afeta **todas** as
  telas do dashboard — grande, arriscada e merece story própria com varredura.
- **`corretores` sem redirect próprio** (ver Riscos, item 2).

## Riscos
1. **Baixo.** A mudança só torna visível um caminho que já era acessível. Não
   concede permissão nova a ninguém: quem não tem nenhum `configuracoes.*` segue
   sem o menu.
2. ⚠️ **Observação encontrada no caminho, fora de escopo:** a página
   `configuracoes/corretores` **não tem redirect** — ela renderiza para qualquer
   usuário do dashboard, e o `isAdmin` interno só gateia as *ações*. A lista de
   corretores (nome, e-mail, CRECI, teto de leads) passa pelo RLS do client de
   usuário, mas a tela abre. Vale decidir se isso é intencional; não muda com
   esta story, e já era assim antes dela.
3. **Correção de rota anterior:** durante a investigação eu afirmei que
   `configuracoes/empresa` estava sem guard. **Estava errado** — o guard existe
   (`configuracoes.empresa`); meu padrão de busca não pegou a linha. Registrado
   para o histórico não carregar um alarme falso.

## Valor
O gerente-comercial passa a **encontrar** o que já podia usar, sem que ninguém
ganhe permissão que não deveria. E a solução resolve por construção: qualquer
perfil que receba um sub-módulo de Configurações no futuro passa a ver o menu
automaticamente, sem precisar abrir o pai.

## Definição de pronto
AC1–AC5 verdes, gate do @qa, PR pelo @devops, deploy, e verificação com a Thielly
ou outro gerente-comercial: o menu Config aparece, mostra só Corretores, Nicole e
Pipeline, e Perfil de Acesso/Integrações continuam inacessíveis por URL.

## Change Log
- 31/07/2026 — @sm: story criada (Draft). Escopo **reduzido** durante a
  investigação: começou como "dar acesso" e virou "mostrar o menu", porque o
  acesso já existia. A hipótese inicial de buraco de segurança em `empresa` foi
  descartada por leitura precisa do código.
- 31/07/2026 — @po: validação 10 pontos = **10/10, GO**. Ressalva: o AC3 é o
  coração — provar que nenhuma linha da matriz mudou, não só que o menu apareceu.
- 31/07/2026 — @dev: `podeVerMenuConfig` (pura) + 1 linha no `layout.tsx` + 6
  testes. Nenhuma migration, nenhuma alteração em `role_permissions`.
- 31/07/2026 — @qa: gate **PASS**. Ressalva do @po atendida por query em produção
  APÓS a implementação: `configuracoes` segue `false`, `configuracoes.pipeline` e
  `corretores` seguem `true`. Suíte 1426, tsc/eslint limpos, build 21s.
