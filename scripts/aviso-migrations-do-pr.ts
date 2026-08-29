/**
 * Story 900-3c · AC4 — o corpo do comentário que o job de CI publica no PR.
 *
 * ## O JOB SEMPRE COMENTA. TRÊS ESTADOS NOMEADOS, NENHUM SILÊNCIO. (correção G2 do @po)
 *
 * O motivo é medido, não estético: `git diff --name-only` devolve **vazio com exit 0** tanto
 * para "este PR não traz migration" quanto para "não consegui resolver as refs". Sem um
 * terceiro estado explícito, **cinco** situações ficam visualmente idênticas no PR:
 *
 *   1. PR limpo de verdade (a migration já está aplicada no teste)   ← sucesso
 *   2. PR que não traz migration nenhuma                              ← sucesso
 *   3. `fetch-depth` raso ⇒ o diff não resolve a base                 ← FALHA
 *   4. `db:status` saiu 1 (o ledger não existe no teste)              ← FALHA
 *   5. o formato do relatório mudou ⇒ zero casamentos no cruzamento   ← FALHA
 *
 * Três das cinco são falhas, e todas as cinco produziriam "nenhum comentário". Um aviso que
 * nunca aparece é indistinguível de um aviso que não era necessário. Com o terceiro estado,
 * **ausência de comentário passa a significar uma coisa só: o job não rodou** — e isso é
 * visível, porque o comentário deveria estar sempre lá.
 *
 * O mesmo `ci.yml` já carrega essa lição por escrito, no job `tenancy-gate`: *"senão a regra
 * se abstém em silêncio e ninguém nota"*.
 *
 * ## TRÊS ESTADOS DE AVISO. (G5 do @po + CONCERNS-1 do @qa)
 *
 * `db:status` classifica cada arquivo em quatro estados. O aviso cobre **três** — todos os
 * que podem sair de um arquivo que o PR toca:
 *
 *   • `PENDENTE`              → "ainda não aplicada no teste".
 *   • `ALTERADA-APÓS-APLICAR` → aviso **mais severo**: este PR edita uma migration que já
 *     rodou no teste, e `pnpm db:apply` vai **recusar em bloco**. É detectável só com
 *     leitura, e sairia em silêncio se o aviso olhasse só `PENDENTE`.
 *   • `ÓRFÃ-no-banco`         → este PR **apaga** um arquivo que consta como aplicado. O
 *     registro fica órfão no ledger e o `reset:testdb` deixa de conseguir reconstruir aquele
 *     efeito do zero.
 *
 * ⚠️ **A AC4 original excluía `ÓRFÃ-no-banco`, e a razão que ela dava foi FALSIFICADA POR
 * MEDIÇÃO (@qa, gate de 2026-08-29).** O texto era: *"é registro sem arquivo correspondente,
 * não pode ser um arquivo que o PR traz"*. Medido: `git diff --name-only` **lista caminho
 * apagado**. O @qa reproduziu com `git rm` + commit num repositório sintético — o arquivo
 * apagado apareceu na lista do PR, casou com `ÓRFÃ-no-banco` no relatório e o aviso
 * respondia `✅ limpo`, com o próprio corpo listando o estado órfão sob a manchete "já estão
 * aplicadas e nenhuma foi alterada". Era o mesmo falso-verde que G2 e G5 existem para fechar,
 * sobrando na quarta classe — justamente a que **apaga histórico já aplicado**.
 *
 * **A manchete também generalizava errado (NIT-8).** Ela dizia "N migration(s) não
 * aplicada(s)" mesmo no caso `ALTERADA-APÓS-APLICAR`, em que o arquivo **foi** aplicado e
 * depois editado. Agora ela diz "precisam de atenção", e cada bloco nomeia o que é.
 *
 * ## ESTE MÓDULO NÃO FALA COM NINGUÉM
 *
 * Função pura: recebe a lista de arquivos do PR e o relatório do `db:status`, devolve
 * `{ estado, corpo }`. Sem rede, sem git, sem banco — é o que permite que as mutações da AC4
 * (G2 e G5) sejam exercidas por teste unitário em vez de por "abre um PR e vê".
 */

import { readFileSync, writeFileSync } from "node:fs"

export type EstadoDoAviso = "pendente" | "limpo" | "indeterminado"

export interface VereditoDoRelatorio {
  arquivo: string
  estado: string
}

export interface EntradaDoAviso {
  /**
   * Caminhos de `supabase/migrations/*.sql` que este PR acrescenta ou modifica.
   * `null` significa **"não consegui apurar"** — nunca "não há nenhum". A distinção é a
   * razão de ser deste módulo.
   */
  arquivosDoPr: string[] | null
  /** Obrigatório quando `arquivosDoPr` é `null`. Vai literal para o comentário. */
  motivoDoDiff?: string
  /** Vereditos do `pnpm db:status --json`. `null` = o comando falhou ou o JSON não abriu. */
  vereditos: VereditoDoRelatorio[] | null
  /** Obrigatório quando `vereditos` é `null`. */
  motivoDoStatus?: string
}

export interface Aviso {
  estado: EstadoDoAviso
  corpo: string
}

/** Marca usada para achar e atualizar o comentário in-place, em vez de acumular um novo. */
export const MARCA = "## Migrations deste PR"

const RODAPE =
  "\n> Job **não-bloqueante** e de **leitura pura sobre o banco** (`pnpm db:status`): ele não " +
  "aplica migration, não reseta o banco de teste e não escreve nada nele. Quem aplica é você, " +
  "com `pnpm db:apply`.\n" +
  ">\n" +
  "> Este comentário é publicado **sempre**, em qualquer desfecho. Se ele não estiver aqui, o " +
  "job não rodou."

function so(nome: string): string {
  return nome.replace(/^.*\//, "")
}

export function montarAviso(entrada: EntradaDoAviso): Aviso {
  const cabecalho = `${MARCA}\n`

  if (entrada.arquivosDoPr === null) {
    return {
      estado: "indeterminado",
      corpo:
        cabecalho +
        `\n⛔ **Não foi possível verificar** — ${entrada.motivoDoDiff ?? "motivo não informado"}.\n` +
        `\nNão consegui apurar quais migrations este PR traz, então **não afirmo nada** sobre o ` +
        `estado delas no banco de teste. Isto não é "está tudo certo".\n` +
        RODAPE,
    }
  }

  if (entrada.vereditos === null) {
    return {
      estado: "indeterminado",
      corpo:
        cabecalho +
        `\n⛔ **Não foi possível verificar** — ${entrada.motivoDoStatus ?? "motivo não informado"}.\n` +
        `\nAs migrations deste PR foram apuradas (${entrada.arquivosDoPr.length}), mas o relatório ` +
        `do \`pnpm db:status\` não veio. Se o motivo for a tabela \`trifold_migrations_aplicadas\` ` +
        `ausente no banco de teste, o remédio é o runbook ` +
        `\`docs/runbooks/aplicar-245-registro-migrations.md\`.\n` +
        RODAPE,
    }
  }

  if (entrada.arquivosDoPr.length === 0) {
    return {
      estado: "limpo",
      corpo:
        cabecalho +
        `\n✅ **Nenhuma migration deste PR está pendente no banco de teste.**\n` +
        `\nEste PR não acrescenta nem modifica nenhum arquivo em \`supabase/migrations/\`.\n` +
        RODAPE,
    }
  }

  // Normaliza os DOIS lados para o nome do arquivo: o `git diff --name-only` devolve o
  // caminho (`supabase/migrations/245_….sql`) e o relatório do `db:status` devolve só o nome.
  const porArquivo = new Map(entrada.vereditos.map((v) => [so(v.arquivo), v.estado]))
  const casados = entrada.arquivosDoPr
    .map((caminho) => ({ caminho, nome: so(caminho), estado: porArquivo.get(so(caminho)) }))
    .filter((c): c is { caminho: string; nome: string; estado: string } => c.estado !== undefined)

  // Nenhum casamento com o relatório: ou o formato mudou, ou o relatório é de outra árvore.
  // Em nenhum dos dois casos dá para dizer "está limpo".
  if (casados.length === 0) {
    return {
      estado: "indeterminado",
      corpo:
        cabecalho +
        `\n⛔ **Não foi possível verificar** — nenhuma das ${entrada.arquivosDoPr.length} ` +
        `migration(s) deste PR casou com alguma linha do relatório do \`db:status\` ` +
        `(${entrada.vereditos.length} linha(s)).\n` +
        `\nOu o formato do relatório mudou, ou ele foi gerado contra outra árvore. Cruzamento ` +
        `sem casamento nenhum é falha de apuração, não estado limpo.\n` +
        `\nArquivos do PR: ${entrada.arquivosDoPr.map((a) => `\`${so(a)}\``).join(", ")}\n` +
        RODAPE,
    }
  }

  const pendentes = casados.filter((c) => c.estado === "PENDENTE")
  const alteradas = casados.filter((c) => c.estado === "ALTERADA-APÓS-APLICAR")
  // CONCERNS-1 (@qa): `git diff --name-only` LISTA caminho apagado, então um arquivo do PR
  // pode, sim, casar com `ÓRFÃ-no-banco`. Ver o cabeçalho deste arquivo.
  const removidas = casados.filter((c) => c.estado === "ÓRFÃ-no-banco")

  if (pendentes.length + alteradas.length + removidas.length === 0) {
    return {
      estado: "limpo",
      corpo:
        cabecalho +
        `\n✅ **Nenhuma migration deste PR está pendente no banco de teste.**\n` +
        `\nAs ${casados.length} migration(s) deste PR já estão aplicadas e nenhuma foi alterada ` +
        `depois da aplicação:\n` +
        casados.map((c) => `- \`${c.nome}\` — ${c.estado}`).join("\n") +
        "\n" +
        RODAPE,
    }
  }

  // Manchete neutra de propósito (NIT-8): "não aplicada" seria falso para
  // `ALTERADA-APÓS-APLICAR` (foi aplicada, e depois editada) e para `ÓRFÃ-no-banco` (foi
  // aplicada, e o PR apagou o arquivo). Quem nomeia o quê é cada bloco abaixo.
  const partes: string[] = [
    cabecalho,
    `\n⚠️ **${pendentes.length + alteradas.length + removidas.length} migration(s) deste PR ` +
      `precisam de atenção no banco de teste.**\n`,
  ]

  if (pendentes.length > 0) {
    partes.push(
      `\n**PENDENTE — ainda não aplicada no teste (${pendentes.length}):**\n` +
        pendentes.map((c) => `- \`${c.nome}\``).join("\n") +
        `\n\nAplique com \`pnpm db:apply\` antes de testar contra o banco de teste.\n`,
    )
  }

  if (alteradas.length > 0) {
    partes.push(
      `\n**⛔ ALTERADA-APÓS-APLICAR — mais grave (${alteradas.length}):**\n` +
        alteradas.map((c) => `- \`${c.nome}\``).join("\n") +
        `\n\nEste PR **altera uma migration que já foi aplicada** no banco de teste: o \`sha256\` ` +
        `registrado no ledger não bate com o arquivo. **O \`pnpm db:apply\` vai recusar em ` +
        `bloco** (exit 1, sem aplicar nada) enquanto isso não for resolvido. Migration que já ` +
        `rodou não se edita — crie uma migration nova com a correção.\n`,
    )
  }

  if (removidas.length > 0) {
    partes.push(
      `\n**⛔ REMOVIDA — este PR apaga migration que consta como aplicada (${removidas.length}):**\n` +
        removidas.map((c) => `- \`${c.nome}\``).join("\n") +
        `\n\nO arquivo sai do repositório, mas o registro **fica órfão** no ledger do banco de ` +
        `teste (\`ÓRFÃ-no-banco\`): o efeito daquele SQL continua no banco e o repositório não ` +
        `tem mais como reproduzi-lo — \`pnpm reset:testdb\` reconstrói a partir dos arquivos, e ` +
        `esse deixou de existir. Se a remoção for intencional, apague também a linha ` +
        `correspondente de \`trifold_migrations_aplicadas\` em **cada** ambiente onde ela ` +
        `existe; se não for, restaure o arquivo.\n`,
    )
  }

  return { estado: "pendente", corpo: partes.join("") + RODAPE }
}

// ---------------------------------------------------------------------------
// CLI — lê os artefatos que o job de CI produziu e escreve o corpo do comentário.
// ---------------------------------------------------------------------------

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(nome)
  return i === -1 ? undefined : process.argv[i + 1]
}

function main(): number {
  const caminhoDiff = arg("--diff")
  const caminhoStatus = arg("--status")
  const saida = arg("--saida")
  const motivoDoDiff = arg("--motivo-diff")
  const motivoDoStatus = arg("--motivo-status")
  if (!saida) throw new Error("--saida <arquivo.md> é obrigatório")

  let arquivosDoPr: string[] | null = null
  if (!motivoDoDiff && caminhoDiff) {
    try {
      arquivosDoPr = readFileSync(caminhoDiff, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.endsWith(".sql"))
    } catch (e) {
      arquivosDoPr = null
    }
  }

  let vereditos: VereditoDoRelatorio[] | null = null
  let motivoStatusFinal = motivoDoStatus
  if (!motivoDoStatus && caminhoStatus) {
    try {
      const bruto = JSON.parse(readFileSync(caminhoStatus, "utf-8")) as {
        vereditos?: VereditoDoRelatorio[]
      }
      vereditos = Array.isArray(bruto.vereditos) ? bruto.vereditos : null
      if (!vereditos) motivoStatusFinal = "o relatório JSON não tem a chave `vereditos`"
    } catch {
      vereditos = null
      motivoStatusFinal = `não consegui ler o relatório JSON em \`${caminhoStatus}\``
    }
  }

  const aviso = montarAviso({
    arquivosDoPr,
    motivoDoDiff:
      motivoDoDiff ??
      (arquivosDoPr === null ? `não consegui ler a lista de migrations do PR` : undefined),
    vereditos,
    motivoDoStatus: motivoStatusFinal,
  })

  writeFileSync(saida, aviso.corpo + "\n")
  console.log(`estado=${aviso.estado}`)
  return 0
}

if (process.argv[1]?.includes("aviso-migrations-do-pr")) {
  try {
    process.exit(main())
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
