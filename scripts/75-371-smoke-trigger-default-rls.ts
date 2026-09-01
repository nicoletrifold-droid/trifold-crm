/**
 * Story 75-371 (@qa R5 · CodeRabbit) — prova que o trigger `trg_kanban_stages_default_unico`
 * TRANSFERE o padrão sob RLS de `authenticated`, não só por service role.
 *
 * ## POR QUE ESTE SCRIPT EXISTE
 *
 * A migration 250 foi provada com a Management API, que roda como superusuário: RLS desligada.
 * Isso deixou uma lacuna de evidência real — o ramo de TRANSFERÊNCIA do trigger nunca havia
 * rodado como usuário logado, que é o único jeito que ele roda em produção. O @qa registrou
 * como resíduo R5.
 *
 * A impersonação é a mesma que o Postgres usa por baixo do PostgREST:
 *   SET LOCAL role authenticated;
 *   SET LOCAL request.jwt.claims = '{"sub":"<auth_id>","role":"authenticated"}';
 * `has_capability()` (migration 225:54) resolve o usuário por `u.auth_id = auth.uid()`, e
 * `auth.uid()` lê exatamente esse claim `sub`.
 *
 * ## É SEGURO RODAR EM PRODUÇÃO
 *
 * Tudo acontece dentro de `BEGIN … ROLLBACK`: o UPDATE é executado de verdade — o trigger
 * dispara de verdade — e nada persiste. É o mesmo padrão da prova da própria migration e da
 * Story 75-280. Ainda assim, o script NÃO pede `TRIFOLD_ALLOW_PROD`: ele não escreve fora da
 * transação revertida, e exigir a flag daria a impressão errada de que escreve.
 *
 * ## USO
 *
 *   SUPABASE_MANAGEMENT_PAT=… pnpm tsx scripts/75-371-smoke-trigger-default-rls.ts
 *   TRIFOLD_ENV=producao SUPABASE_MANAGEMENT_PAT=… pnpm tsx scripts/75-371-…   # padrão: teste
 */
import { runSqlBruto } from "./lib/management-api"
import { resolverAmbiente } from "./lib/db-env"

/**
 * Etapa que recebe o posto na prova. Por padrão o script **descobre** uma etapa ativa que não
 * seja a padrão atual, em vez de fixar um slug: fixar "follow-up" tornava este smoke test
 * dependente de uma etapa que o resíduo R6 manda EXCLUIR — e, com ela fora, o UPDATE atingiria
 * zero linhas e as asserções continuariam verdes (achado do CodeRabbit). `SLUG_ALVO` continua
 * disponível para apontar uma etapa específica.
 */
const SLUG_ALVO = process.env.SLUG_ALVO?.trim()

/** O mesmo formato que o CRM aceita em slug. Barra injeção sem depender de escaping. */
const FORMATO_DE_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

function validarSlug(slug: string): string {
  if (!FORMATO_DE_SLUG.test(slug)) {
    throw new Error(
      `SLUG_ALVO inválido: ${JSON.stringify(slug)}. Formato aceito: ${FORMATO_DE_SLUG}. ` +
        "O valor é interpolado em SQL — um slug fora do formato poderia fechar a transação " +
        "que é justamente o que torna esta prova segura de rodar em produção.",
    )
  }
  return slug
}

function pat(): string {
  const v = process.env.SUPABASE_MANAGEMENT_PAT?.trim()
  if (!v) {
    throw new Error(
      "Env SUPABASE_MANAGEMENT_PAT ausente ou vazia. É ela que autentica na Management API.",
    )
  }
  return v
}

interface Veredito {
  etapa: string
  valor: string
}

async function provarComo(
  ref: string,
  token: string,
  papel: string,
  authId: string,
  slugAlvo: string,
) {
  const r = await runSqlBruto(
    ref,
    token,
    `
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"${authId}","role":"authenticated"}';

CREATE TEMP TABLE v(ordem int, etapa text, valor text);
INSERT INTO v SELECT 1, 'has_capability(pipeline_editar)',
  has_capability('configuracoes.pipeline_editar')::text;
INSERT INTO v SELECT 2, 'padrao ANTES', (SELECT name FROM kanban_stages WHERE is_default);

-- O ATO: transferir o padrão. É aqui que o trigger tem de disparar sob RLS.
-- O RETURNING conta as linhas afetadas: sem isso, um UPDATE que não acerta ninguém deixaria
-- todas as asserções verdes (a padrão antiga continuaria lá, sozinha e ativa) e o script
-- reportaria OK sem ter exercitado o trigger uma única vez.
WITH alvo AS (
  UPDATE kanban_stages SET is_default = true WHERE slug = '${slugAlvo}' RETURNING 1
)
INSERT INTO v SELECT 3, 'linhas que o UPDATE atingiu', (SELECT count(*) FROM alvo)::text;

INSERT INTO v SELECT 4, 'linhas com is_default DEPOIS',
  (SELECT count(*) FROM kanban_stages WHERE is_default)::text;
INSERT INTO v SELECT 5, 'padrao DEPOIS', (SELECT name FROM kanban_stages WHERE is_default);
INSERT INTO v SELECT 6, 'padrao DEPOIS e o alvo?',
  (SELECT (slug = '${slugAlvo}')::text FROM kanban_stages WHERE is_default);
INSERT INTO v SELECT 7, 'padrao em etapa INATIVA',
  (SELECT count(*) FROM kanban_stages WHERE is_default AND NOT is_active)::text;

-- A Management API devolve só o resultado do ÚLTIMO statement — daí a temp table.
SELECT etapa, valor FROM v ORDER BY ordem;
ROLLBACK;`,
  )

  console.log(`\n=== ${papel} ===`)
  if (!r.ok) {
    console.error("FALHOU:", r.msg.slice(0, 400))
    return false
  }
  const vereditos = JSON.parse(r.msg) as Veredito[]
  for (const v of vereditos) console.log(`  ${v.etapa.padEnd(34)} ${v.valor}`)

  const valor = (etapa: string) => vereditos.find((v) => v.etapa === etapa)?.valor
  const ok =
    valor("has_capability(pipeline_editar)") === "true" &&
    // O trigger só é exercitado se o UPDATE tiver acertado alguém E o posto tiver mudado de
    // dono. Sem estas duas, "nada aconteceu" é indistinguível de "transferiu certo".
    valor("linhas que o UPDATE atingiu") === "1" &&
    valor("padrao DEPOIS e o alvo?") === "true" &&
    valor("padrao ANTES") !== valor("padrao DEPOIS") &&
    valor("linhas com is_default DEPOIS") === "1" &&
    valor("padrao em etapa INATIVA") === "0"
  console.log(`  → ${ok ? "OK" : "REPROVOU"}`)
  return ok
}

async function main() {
  const alvo = resolverAmbiente({ escreve: false })
  const token = pat()

  // Descobrir o alvo antes de impersonar: precisa ser etapa ATIVA que não seja a padrão atual.
  let slugAlvo: string
  if (SLUG_ALVO) {
    slugAlvo = validarSlug(SLUG_ALVO)
  } else {
    const candidata = await runSqlBruto(
      alvo.ref,
      token,
      `SELECT slug FROM kanban_stages
        WHERE is_active AND NOT is_default
        ORDER BY position LIMIT 1;`,
    )
    if (!candidata.ok) throw new Error("não consegui escolher a etapa alvo: " + candidata.msg.slice(0, 300))
    const linhas = JSON.parse(candidata.msg) as { slug: string }[]
    if (linhas.length === 0) {
      throw new Error(
        "Nenhuma etapa ativa não-padrão para receber o posto — não há como provar a transferência.",
      )
    }
    slugAlvo = validarSlug(linhas[0]!.slug)
  }
  console.log(`etapa alvo da transferência: ${slugAlvo}`)

  const quem = await runSqlBruto(
    alvo.ref,
    token,
    `SELECT DISTINCT ON (role) role, auth_id
       FROM users
      WHERE is_active AND auth_id IS NOT NULL AND role IN ('admin','gerente-comercial')
      ORDER BY role, name;`,
  )
  if (!quem.ok) throw new Error("não consegui listar usuários: " + quem.msg.slice(0, 300))
  const usuarios = JSON.parse(quem.msg) as { role: string; auth_id: string }[]

  // Zero usuários NÃO é sucesso: o `for` não rodaria e o script sairia 0 sem provar nada —
  // invisível para o CI, que lê o exit code, não o texto (achado do CodeRabbit).
  if (usuarios.length === 0) {
    throw new Error(
      "Nenhum usuário ativo com auth_id nos papéis admin/gerente-comercial — nada foi exercitado.",
    )
  }

  let tudoOk = true
  for (const u of usuarios) {
    tudoOk = (await provarComo(alvo.ref, token, u.role, u.auth_id, slugAlvo)) && tudoOk
  }

  console.log(
    `\n${tudoOk ? "✅" : "❌"} ${usuarios.length} papel(éis) exercitado(s) em ${alvo.ambiente} ` +
      `(${alvo.ref}). Nada persistiu: cada prova roda em BEGIN … ROLLBACK.`,
  )
  process.exit(tudoOk ? 0 : 1)
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
