/**
 * Story 900-23 · AC10 — **EXCEÇÃO NOMEADA**: o último identificador fixo da Trifold no código de
 * aplicação. Leia o parágrafo inteiro antes de importar isto em qualquer arquivo novo.
 *
 * ## O que é
 *
 * Um **marcador de qual das orgs ativas é a Trifold**, usado exclusivamente para escopar os
 * **canais globais de notificação administrativa** — `DAILY_REPORT_RECIPIENTS` (telefones do
 * relatório diário) e o Telegram administrativo (`TELEGRAM_ADMIN_CHAT_ID`).
 *
 * **Não é** um default de org a processar. Esse papel era do `DEFAULT_ORG_ID` que existia em
 * `daily-report/route.ts:16` e `nicole-agenda-reconcile/route.ts:30`, e **morreu aqui**: quem
 * decide quais orgs processar agora é `forEachActiveOrg` (`./for-each-org.ts`), lendo
 * `organizations WHERE is_active = true`. Usar `trifoldOrgId()` para escolher o que processar
 * seria ressuscitar exatamente o defeito que a Onda 2 existe para fechar.
 *
 * ## Por que existe
 *
 * Os dois canais acima têm **um destino único por env**, sem destino por organização. Iterar as
 * orgs sem escopar QUEM recebe o quê não é neutro: os telefones de `DAILY_REPORT_RECIPIENTS`
 * passariam a receber as métricas de negócio de todas as empresas, e o Telegram administrativo da
 * Trifold passaria a receber o **nome do lead**, o **trecho da conversa** e o **deep link** do
 * cadastro de leads de outras empresas (o corpo do alerta de
 * `nicole-agenda-reconcile/route.ts` nomeia os três). "Não ter destino por org" não é a prova de
 * que não vaza — é a razão pela qual vaza: tudo cai no único destino que existe.
 *
 * ## Quem mata esta exceção (e quando ela deve sumir)
 *
 * 1. **Telegram:** destino por organização em `org_integrations`, `provider = 'telegram'` — a
 *    linha já existe desde a migration `246` (Story 900-21b), com `config` vazia. Quando
 *    `resolveIntegration` (Onda 7, `900-47`) resolver o chat/token por org, o despacho deixa de
 *    precisar perguntar "esta org é a Trifold?" e passa a perguntar "qual é o canal desta org?".
 * 2. **Relatório diário:** aposentadoria de `DAILY_REPORT_RECIPIENTS` em favor da lista da tela
 *    de Configurações › Relatório Diário, que já é por org (`lib/reports/recipients.ts`). A env
 *    hoje só existe para números que não são usuários do CRM.
 *
 * Enquanto os dois canais forem globais, o marcador fica. **Este cabeçalho existe para o próximo
 * leitor não achar que ele é permanente por omissão.**
 *
 * ## Por que NÃO lê `process.env.DAILY_REPORT_ORG_ID` (AC10.4)
 *
 * Seria recriar, mais larga, a dependência cruzada que a AC2 fechou: o `nicole-agenda-reconcile`
 * usava o env var de OUTRO cron (`DAILY_REPORT_ORG_ID`) como fallback da própria org. Com a env
 * lida aqui dentro, apontar o **relatório diário** para outra organização redirecionaria também,
 * em silêncio, **para onde vai o Telegram do cron da agenda**. Um literal só, sem env. Quem
 * precisar compor a env com o marcador faz isso **localmente**, no próprio cron que é dono dela —
 * é o que `daily-report/route.ts` faz com
 * `process.env.DAILY_REPORT_ORG_ID ?? trifoldOrgId()`.
 *
 * ## Catraca
 *
 * O literal abaixo é vigiado por `trifold-org-literal.test.ts`: ele só pode aparecer no conjunto
 * declarado de arquivos de implementação. Um terceiro arquivo com o UUID **reprova o teste**.
 */

/**
 * @returns o `organizations.id` da Trifold Engenharia.
 * @see o cabeçalho deste arquivo — isto é uma exceção com prazo, não uma constante de negócio.
 */
export function trifoldOrgId(): string {
  return "00000000-0000-0000-0000-000000000001"
}
