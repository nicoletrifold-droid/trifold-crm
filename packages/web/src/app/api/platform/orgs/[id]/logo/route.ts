/**
 * Story 900-63 · AC2/AC3/AC4/AC5/AC7 — METADE 1 de 2: GUARDAR o arquivo do logo de uma empresa.
 *
 * 🔴 **O que esta rota NÃO faz.** `organizations.logo_url` tem ZERO consumidores no CRM do
 * cliente: nenhuma tela de login, cabeçalho, sidebar, e-mail transacional ou export lê essa
 * coluna. Um `200` daqui significa "o arquivo está guardado e o cadastro aponta para ele" — e
 * **nada** sobre a marca que o cliente vê. Trocar a marca exibida é a `900-64`. A UI declara isso
 * em voz alta (`AVISO_DE_QUE_ISTO_SO_GUARDA`, AC9); esta rota não pode ser usada como prova de
 * que o pedido do dono do produto foi atendido.
 *
 * ## Por que este arquivo é SEPARADO das rotas das `900-60` e `900-62`
 *
 * Mesma disciplina daquelas duas entre si: `[id]/route.ts` é `PATCH` de `is_active`,
 * `[id]/dados/route.ts` é `PATCH` de nome/slug/contato/fiscal, e este é o logo. Três stories
 * independentes, três arquivos, zero conflito de merge. E aqui há uma razão a mais: o transporte
 * é `multipart/form-data`, não JSON.
 *
 * ## A org NUNCA vem do corpo
 *
 * Ela é o parâmetro de rota `[id]`. Aceitar um id do corpo deixaria trocar o logo de uma empresa
 * a partir da tela de outra, e nada na resposta de sucesso denunciaria isso.
 *
 * ## Por que o efeito em `organizations` é uma RPC, e não um `.update()` aqui
 *
 * 1. `app/api/platform/**` não pode conter `.from(<literal>)` — é a segunda rede da `900-22b`
 *    (`platform-query-scan.ts`), aplicada por teste, e ela não distingue leitura de escrita nem
 *    isenta `createAdminClient()`.
 * 2. A trava otimista, o no-op e a linha de trilha precisam da MESMA transação do `UPDATE`.
 *
 * ⚠️ O `storage.from("org-logos")` abaixo **não** acende aquela régua, e isso é medido, não
 * sorte: o detector captura o nome com `[a-zA-Z_]\w*`, e `\w` não inclui hífen. O nome do bucket
 * é load-bearing — há teste de caracterização em `platform-query-scan.test.ts` fixando o motivo,
 * junto do controle positivo que impede o "conserto" errado (excluir o receiver `storage`
 * cegaria a régua para uma variável chamada `storage` lendo uma tabela de verdade).
 *
 * **`createAdminClient()` aqui é deliberado e está na allowlist** (`docs/audits/
 * admin-client-allowlist.json`, seção `plataforma`): a RPC é `GRANT EXECUTE … TO service_role`, a
 * escrita no bucket também só é possível por `service_role` (não há policy de INSERT para
 * `anon`/`authenticated`), e a autorização acontece NESTA rota (`getPlatformAdmin()`), não no SQL.
 *
 * ## A ORDEM DAS ESCRITAS — falha nunca vira "salvo"
 *
 * As operações em Storage e em `organizations` não são atômicas entre si, então a ordem é
 * escolhida para que a falha caia sempre no lado inofensivo:
 *
 *   • **Upload:** Storage **primeiro**, RPC **depois**. Se a RPC falhar → `500`, `logo_url`
 *     inalterado, e o objeto novo fica no bucket sem ninguém apontando para ele. Isso é aceito
 *     **só onde a empresa existe** (`409`, `500`, `503`): ali um próximo upload bem-sucedido o
 *     remove pela purga da AC4, e apagá-lo aqui seria pior — `logo_url` pode já apontar para o
 *     MESMO caminho (PNG sobre PNG), e a remoção recriaria o 404 público que a AC4 proíbe.
 *   • **Remoção:** RPC **primeiro** (`logo_url = NULL`), Storage **depois**. A ordem inversa é
 *     PROIBIDA: apagar o objeto antes e falhar na RPC deixaria `logo_url` apontando para um `404`
 *     público.
 *
 * ⚠️ **Onde não existe empresa, não existe "próximo upload".** Dois desfechos do `POST` são
 * terminais nesse sentido, e neles o objeto que ESTE pedido criou é removido antes da resposta:
 *   1. `[id]` que não é UUID — barrado **antes de tocar o Storage**, então não chega a nascer;
 *   2. `404 ORG_NOT_FOUND` (a RPC devolveu zero linhas) — removido explicitamente logo abaixo.
 * Nos dois, `logo_url` provadamente não pode apontar para `destino`: não há linha em
 * `organizations`. Sem isso, `POST /api/platform/orgs/nao-e-uuid/logo` deixava
 * `nao-e-uuid/logo.png` publicamente legível no bucket **para sempre** — este bucket não tem cron
 * de limpeza, e o dano é exatamente o que a AC4 nomeia.
 *
 * 🔴 A remoção é **só do `destino`**, e nunca do prefixo inteiro: zero linhas é um fato sobre a
 * tabela, não sobre o balde, e purgar o prefixo transformaria um erro de leitura da RPC em
 * destruição do logo vivo de outra empresa.
 *
 * ⚠️ **A purga da AC4 roda DEPOIS da RPC**, apesar de a AC dizer "antes de gravar". Medido contra
 * a própria invariante da AC, em DUAS rodadas:
 *   1. Purgar ANTES do upload e falhar no upload apaga o objeto que `logo_url` ainda referencia →
 *      404 público.
 *   2. Purgar ENTRE o upload e a RPC tem o MESMO desfecho por outra porta: todo não-200 da RPC
 *      (`409` de conflito, `500`, `503`) deixa `logo_url` inalterado apontando para um objeto que
 *      a purga já apagou. Este furo sobreviveu à primeira correção e só apareceu ao planejar a
 *      medição contra o Storage REAL — nenhum dos dois carrascos o pegava.
 * Depois da RPC, `logo_url` já aponta para o objeto novo antes de qualquer remoção. O pior caso
 * passa a ser um órfão público (reportado em `arquivoRemovido`), nunca um `logo_url` quebrado.
 *
 * ## AC11 da `900-62`, herdada: nenhum `console.*`
 *
 * Não há log neste arquivo, de propósito. O nome do arquivo enviado e a URL pública são dado do
 * cliente; os dois únicos lugares onde eles podem aparecer são `organizations.logo_url` e
 * `platform_audit_log`, ambos auditados. Um `console.error` num ramo de falha abriria um terceiro,
 * fora de qualquer política de retenção.
 */

import { NextResponse } from "next/server"
import { getPlatformAdmin } from "@web/lib/tenancy/platform-guard"
import { createAdminClient } from "@web/lib/supabase/admin"
import { isUuid } from "@web/lib/uuid"
import { createHash } from "node:crypto"
import {
  caminhoDoLogo,
  objetosAPurgar,
  urlVersionadaDoLogo,
  validarArquivoDeLogo,
} from "@web/lib/tenancy/console-logo-empresa"

/** AC1 — o bucket desta story. O HÍFEN é load-bearing; ver o bloco do topo. */
export const BUCKET_DE_LOGOS = "org-logos"

/** O que a migration `254` levanta, e o status HTTP que cada código merece. */
const STATUS_POR_CODIGO_SQL: Record<string, number> = {
  // Trava otimista ausente. A rota já barra antes; a função é a segunda rede, para quando a RPC
  // for chamada por outra superfície. `400` porque é defeito de chamada, não corrida.
  P0024: 400,
}

/**
 * A RPC ainda não existe no banco — sintoma exato de deploy fora de ordem (código antes da
 * migration `254`). Mesma rede da `900-60` (QA-900-60-2) e da `900-62`: sem ela o desfecho cai no
 * `?? 500` genérico, e o operador lê "não foi possível concluir" numa tela que parece pronta.
 */
const CODIGOS_DE_FUNCAO_NAO_PUBLICADA = new Set(["PGRST202", "42883"])
const MENSAGEM_DE_FUNCAO_NAO_PUBLICADA =
  "A função de banco desta tela ainda não foi publicada (migration 254). Nada foi alterado."

/**
 * O BUCKET ainda não existe — o outro sintoma de deploy fora de ordem, e MEDIDO na tela.
 *
 * Rodando o console contra um banco sem a migration `254`, o `upload()` volta com a mensagem
 * crua `"Bucket not found"` e a rota respondia `500` com ela na tela. `500` diz "defeito do
 * servidor"; a causa real é "a migration não subiu", que é acionável e tem dono. É exatamente a
 * mesma rede que `CODIGOS_DE_FUNCAO_NAO_PUBLICADA` dá à RPC — faltava dá-la ao Storage.
 *
 * Casado por texto porque o `StorageError` do supabase-js **não** carrega código nesse caminho
 * (medido: o objeto traz só `message`/`name`/`status`). Casar por texto é frágil de propósito e
 * falha na direção segura: se a mensagem mudar, o desfecho volta a ser o `500` genérico de hoje,
 * nunca um `503` sobre um erro que não é esse.
 */
const BUCKET_AUSENTE = /bucket not found/i
const MENSAGEM_DE_BUCKET_NAO_PUBLICADO =
  "O bucket de logos ainda não foi criado neste ambiente (migration 254). Nada foi enviado."

/** O que a migration `254` devolve — uma linha, ou nenhuma quando a empresa não existe. */
interface LinhaDaRpc {
  id: string
  logo_url: string | null
  updated_at: string
  conflito: boolean
}

type ClienteAdmin = ReturnType<typeof createAdminClient>

/**
 * A tradução do desfecho da RPC em resposta HTTP — compartilhada pelo `POST` e pelo `DELETE`.
 *
 * Devolve `null` quando a RPC passou; nesse caso `linha` traz o que ficou GRAVADO. Compartilhar
 * isto não é economia de linha: são os dois verbos precisando concordar sobre o que é `409`, o
 * que é `404` e o que é `503`, e duas cópias divergiriam no primeiro conserto de um lado só.
 *
 * `orgInexistente` é o discriminante que o `POST` usa para decidir se remove o objeto que acabou
 * de escrever. É um CAMPO, e não `resposta.status === 404`, porque o gesto "apagar do balde
 * público" não pode depender de um número que outro desfecho pode passar a usar amanhã.
 */
function respostaDeFalhaDaRpc(
  error: { code?: string; message?: string } | null,
  data: unknown,
): { resposta: NextResponse | null; linha: LinhaDaRpc | null; orgInexistente: boolean } {
  // Falha de escrita NÃO pode virar "salvo".
  //
  // O desfecho genérico NÃO afirma "nada foi alterado" (OBS-2 do gate da `900-62`): um erro de
  // transporte depois do `COMMIT` teria alterado, e a rota não tem como saber qual dos dois
  // aconteceu. A frase de `MENSAGEM_DE_FUNCAO_NAO_PUBLICADA` continua afirmando, porque ali a
  // escrita provadamente não saiu: a função nem foi chamada.
  if (error) {
    const codigo = error.code ?? ""
    const naoPublicada = CODIGOS_DE_FUNCAO_NAO_PUBLICADA.has(codigo)
    return {
      resposta: NextResponse.json(
        {
          error: codigo || "ESCRITA_FALHOU",
          message: naoPublicada
            ? MENSAGEM_DE_FUNCAO_NAO_PUBLICADA
            : (error.message ??
              "Não foi possível confirmar se a alteração foi gravada — recarregue a página."),
        },
        { status: naoPublicada ? 503 : (STATUS_POR_CODIGO_SQL[codigo] ?? 500) },
      ),
      linha: null,
      orgInexistente: false,
    }
  }

  // `RETURNS TABLE` chega pelo PostgREST como array. Zero linhas é a empresa que não existe — a
  // RPC desambigua isso do conflito de propósito, e os dois desfechos são HTTPs diferentes.
  const linha = (Array.isArray(data) ? (data as LinhaDaRpc[])[0] : null) ?? null
  if (!linha) {
    return {
      resposta: NextResponse.json({ error: "ORG_NOT_FOUND" }, { status: 404 }),
      linha: null,
      orgInexistente: true,
    }
  }

  if (linha.conflito) {
    return {
      resposta: NextResponse.json(
        {
          error: "CONFLITO_DE_CONCORRENCIA",
          // O valor ATUAL do banco, e não o que a tela tinha: dizer "outra pessoa alterou" e
          // mostrar o valor de quem está lendo seria a tela discordando de si mesma.
          atual: { logoUrl: linha.logo_url, updatedAt: linha.updated_at },
        },
        { status: 409 },
      ),
      linha: null,
      orgInexistente: false,
    }
  }

  return { resposta: null, linha, orgInexistente: false }
}

/**
 * AC3 — a trava otimista é obrigatória, e é barrada ANTES de tudo.
 *
 * Um pedido sem trava não é um pedido "quase certo": é um cliente que não participa do protocolo.
 * Sem ela, a AC afirma ao operador uma proteção que não existe — e a migration `254` documenta o
 * caminho pelo qual isso fica desligado em silêncio (`<>` com `NULL`).
 */
function respostaDeTravaAusente(): NextResponse {
  return NextResponse.json(
    {
      error: "EXPECTED_UPDATED_AT_REQUIRED",
      message: "Recarregue a página: falta a marca de versão dos dados que você abriu.",
    },
    { status: 400 },
  )
}

/**
 * AC4 — apaga do prefixo `{org_id}/` tudo que não for `destino`.
 *
 * `destino = null` (remoção) apaga o prefixo inteiro. Devolve `false` quando a listagem ou a
 * remoção falhou — **não** quando não havia nada a apagar. Distinção deliberada: "não consegui
 * ler o balde" não pode virar "não havia lixo lá dentro" (o mesmo erro-ignorado-vira-estado-
 * alegado que a `900-51` mediu em outra tabela).
 */
async function purgarPrefixo(
  db: ClienteAdmin,
  orgId: string,
  destino: string | null,
): Promise<boolean> {
  const balde = db.storage.from(BUCKET_DE_LOGOS)

  const { data, error } = await balde.list(orgId)
  if (error || !data) return false

  const alvos = objetosAPurgar(
    orgId,
    data.map((objeto) => objeto.name),
    destino ?? "",
  )
  if (alvos.length === 0) return true

  const { error: erroDeRemocao } = await balde.remove(alvos)
  return !erroDeRemocao
}

/**
 * AC2/AC3/AC4 — `POST` com `multipart/form-data` (campo `file`).
 *
 * `multipart`, e não JSON, porque é upload de arquivo — mesmo desenho de
 * `campaigns/upload-image/route.ts`. E upload DIRETO (a rota faz o `upload()` ela mesma), e não o
 * fluxo `sign → cliente envia → registra` de `marketing-brands`: é um arquivo só, de baixa
 * frequência, disparado por um platform admin.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const platformAdmin = await getPlatformAdmin()
  if (!platformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })

  const { id: orgId } = await params
  // A FORMA do `[id]` é conferida ANTES de qualquer contato com o Storage. Ver o bloco do topo:
  // o upload acontece antes da RPC por desenho, e a existência da empresa só é verificada DENTRO
  // da RPC — então, sem esta linha, `POST /api/platform/orgs/nao-e-uuid/logo` gravava
  // `nao-e-uuid/logo.png` no bucket PÚBLICO de uma empresa que não existe, e nada nunca o
  // removia. Aqui é `400`, e não `404`: `404` é a afirmação "esta empresa não existe", que a rota
  // já usa para o id BEM-FORMADO sem linha em `organizations`; um id malformado é defeito de
  // chamada, e sobrecarregar o mesmo número faria a tela dizer duas coisas com um número só.
  if (!isUuid(orgId)) {
    return NextResponse.json(
      {
        error: "ORG_ID_INVALIDO",
        message: "O endereço desta tela não aponta para uma empresa válida.",
      },
      { status: 400 },
    )
  }

  const formulario = await req.formData().catch(() => null)
  if (!formulario) {
    return NextResponse.json(
      { error: "ARQUIVO_OBRIGATORIO", message: "Escolha um arquivo de imagem para enviar." },
      { status: 400 },
    )
  }

  const trava = formulario.get("expectedUpdatedAt")
  const expectedUpdatedAt = typeof trava === "string" ? trava.trim() : ""
  if (!expectedUpdatedAt) return respostaDeTravaAusente()

  const enviado = formulario.get("file")
  const arquivo = enviado instanceof File ? enviado : null
  // A MESMA função que o componente usa para recusar antes do round-trip. Uma implementação só —
  // duas divergiriam em silêncio, e o operador veria o arquivo aceito na tela e recusado aqui.
  const recusa = validarArquivoDeLogo(
    arquivo ? { tipo: arquivo.type, tamanho: arquivo.size } : null,
  )
  if (recusa || !arquivo) {
    // O `!arquivo` do `if` é redundante em runtime (sem arquivo, `recusa` é sempre verdadeira) e
    // obrigatório para o `tsc` estreitar o tipo abaixo. Se algum dia a validação passar a aceitar
    // ausência, o `500` daqui é o desfecho certo: escrever no bucket sem arquivo não é opção.
    const r = recusa ?? { codigo: "ARQUIVO_OBRIGATORIO", status: 500, mensagem: "sem arquivo" }
    return NextResponse.json({ error: r.codigo, message: r.mensagem }, { status: r.status })
  }

  const db = createAdminClient()
  const destino = caminhoDoLogo(orgId, arquivo.type)
  const conteudo = Buffer.from(await arquivo.arrayBuffer())

  // 1º Storage. Ver "A ORDEM DAS ESCRITAS" no topo.
  const { error: erroDeUpload } = await db.storage
    .from(BUCKET_DE_LOGOS)
    .upload(destino, conteudo, { contentType: arquivo.type, upsert: true })
  if (erroDeUpload) {
    const semBucket = BUCKET_AUSENTE.test(erroDeUpload.message ?? "")
    return NextResponse.json(
      {
        error: semBucket ? "BUCKET_NAO_PUBLICADO" : "UPLOAD_FALHOU",
        message: semBucket ? MENSAGEM_DE_BUCKET_NAO_PUBLICADO : erroDeUpload.message,
      },
      { status: semBucket ? 503 : 500 },
    )
  }

  // A URL é VERSIONADA PELO CONTEÚDO. Sem isso, trocar um PNG por outro PNG produz a mesma string,
  // a RPC classifica como no-op, `updated_at` não anda e a TELA CONTINUA MOSTRANDO O LOGO ANTIGO —
  // medido contra o Storage real. Hash e não relógio: reenviar o arquivo idêntico segue sendo um
  // no-op honesto, sem linha de trilha.
  const { data: url } = db.storage.from(BUCKET_DE_LOGOS).getPublicUrl(destino)
  const urlGravada = urlVersionadaDoLogo(
    url.publicUrl,
    createHash("sha256").update(conteudo).digest("hex").slice(0, 16),
  )

  // 3º a RPC. Ela é a única porta de escrita de `organizations.logo_url` (migration `254`).
  const { data, error } = await db.rpc("org_logo_update_as_platform", {
    p_org_id: orgId,
    p_actor_user_id: platformAdmin.userId,
    p_logo_url: urlGravada,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: lerMotivo(formulario.get("reason")),
  })

  const { resposta, linha, orgInexistente } = respostaDeFalhaDaRpc(
    error as { code?: string; message?: string } | null,
    data,
  )
  if (resposta) {
    // Zero linhas em `organizations` ⇒ NENHUM `logo_url` pode apontar para `destino`, e nenhum
    // upload futuro vai purgá-lo (não há empresa para receber um). É o único desfecho de falha em
    // que remover é seguro — no `409` e no `500` a empresa EXISTE e `logo_url` pode já apontar
    // para o MESMO caminho, e remover ali recriaria o 404 público que a AC4 proíbe.
    //
    // O erro do `remove()` é deliberadamente ignorado: esta resposta é `{error: "ORG_NOT_FOUND"}`
    // e não afirma nada sobre o balde. Reportar exigiria um campo que só existe no `200`, e
    // "não consegui apagar" não muda o que o operador tem a fazer com um id que não é empresa.
    if (orgInexistente) await db.storage.from(BUCKET_DE_LOGOS).remove([destino])
    return resposta
  }

  // 3º a purga da AC4 — DEPOIS da RPC ter passado. Ver "A ORDEM DAS ESCRITAS" no topo.
  //
  // Enquanto ela rodava ENTRE o upload e a RPC, todo desfecho não-200 da RPC (`409` de conflito,
  // `500`, `503`) deixava `logo_url` — inalterado — apontando para um objeto que a purga acabara
  // de apagar: o 404 público que a AC4 nomeia como proibido, reintroduzido por outra porta.
  // Depois da RPC, `logo_url` já aponta para o objeto NOVO antes de qualquer remoção acontecer.
  const arquivoRemovido = await purgarPrefixo(db, orgId, destino)

  // O retorno é a verdade do que ficou gravado — não repetimos aqui o que pedimos. `updatedAt` é
  // o valor já bombado pelo trigger `set_updated_at`, e é ele que a próxima escrita usa de trava.
  return NextResponse.json({
    orgId: linha!.id,
    logoUrl: linha!.logo_url,
    updatedAt: linha!.updated_at,
    arquivoRemovido,
  })
}

/**
 * AC2/AC4/AC5 — `DELETE`: limpa `logo_url` e depois apaga o objeto.
 *
 * ## `DELETE` numa empresa que já não tem logo: no-op `200`, e não `404` (Task 7.4)
 *
 * Decisão documentada aqui e não deixada implícita. `404` seria uma afirmação sobre a EMPRESA
 * ("não existe"), e ela existe; a rota já usa `404` para esse fato, e sobrecarregá-lo faria a
 * tela dizer duas coisas diferentes com o mesmo número. A RPC trata o caso como no-op de verdade
 * — `IS NOT DISTINCT FROM` entre dois `NULL` —, então **não** grava linha de trilha para uma
 * remoção que não removeu nada, e `platform_audit_log` é append-only: aquela linha seria
 * irreversível. A purga do prefixo roda de qualquer jeito, porque pode haver órfão de uma falha
 * anterior mesmo com `logo_url` já nulo.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const platformAdmin = await getPlatformAdmin()
  if (!platformAdmin) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 })

  const { id: orgId } = await params
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const expectedUpdatedAt =
    typeof corpo.expectedUpdatedAt === "string" ? corpo.expectedUpdatedAt.trim() : ""
  if (!expectedUpdatedAt) return respostaDeTravaAusente()

  const db = createAdminClient()

  // 1º a RPC. Ver "A ORDEM DAS ESCRITAS" no topo: a inversa deixaria `logo_url` apontando para um
  // `404` público, que é o estado que a `900-60` já provou não poder existir.
  const { data, error } = await db.rpc("org_logo_update_as_platform", {
    p_org_id: orgId,
    p_actor_user_id: platformAdmin.userId,
    p_logo_url: null,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: lerMotivo(corpo.reason),
  })

  const { resposta, linha } = respostaDeFalhaDaRpc(
    error as { code?: string; message?: string } | null,
    data,
  )
  if (resposta) return resposta

  // 2º o Storage. Falhar aqui deixa um órfão para o qual NENHUMA tela aponta — assimétrico, e por
  // isso reportado: `arquivoRemovido: false` é o que a UI usa para avisar em vez de dizer só
  // "removido". Engolir o erro aqui seria a resposta afirmando um estado que não foi medido.
  const arquivoRemovido = await purgarPrefixo(db, orgId, null)

  return NextResponse.json({
    orgId: linha!.id,
    logoUrl: linha!.logo_url,
    updatedAt: linha!.updated_at,
    arquivoRemovido,
  })
}

/** `reason` é opcional nesta story (diferente da `900-60`): em branco vira `null` na trilha. */
function lerMotivo(valor: unknown): string | null {
  const texto = typeof valor === "string" ? valor.trim() : ""
  return texto === "" ? null : texto
}
