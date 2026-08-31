"use client"

/**
 * Story 900-51 · AC4 — o componente compartilhado pelas DUAS superfícies.
 *
 * ## O que `viewerRole` decide, e o que ele NÃO decide
 *
 * `viewerRole` controla **textos e rótulos**: "esta empresa" × "sua empresa", o aviso de D14 no
 * tile do Google, o rótulo do botão. Ele **nunca** decide se um dado chega ao navegador — R9 do
 * parecer: esconder no render não é esconder. O bloco "Detalhes técnicos" aparece se, e somente
 * se, `technicalDetail` **veio no JSON**, e quem decide isso é a rota que respondeu
 * (`/api/platform/...` inclui; `/api/configuracoes/...` não serializa o campo). Se um dia alguém
 * trocar `endpoint` por engano, o pior que acontece é o cliente ver um campo que a rota dele não
 * produz — porque o campo não existe no payload.
 *
 * ## Cinco tiles, e o Google não é o sexto
 *
 * `google` não tem tile aqui: OAuth exige consentimento do próprio cliente e completá-lo por ele
 * exigiria impersonation, proibida pela D14 do epic. Ele continua no card "Google Forms" da tela
 * do cliente, e aparece como linha somente-leitura em `/platform`, FORA deste componente.
 *
 * ## O segredo é escrita-apenas
 *
 * O campo de credencial nunca é populado com o valor guardado — não existe leitura que o
 * devolva. O que a tela pode mostrar é "Configurado"/"Não configurado" e, sob clique explícito,
 * os 4 últimos caracteres (que vêm de uma RPC que audita antes de responder).
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DEFINICOES_DE_PROVIDER,
  PROVIDERS_DO_PAINEL,
  rotuloDeStatusDoTile,
  type ProviderDoPainel,
} from "@web/lib/integrations/painel/providers"
import {
  classesDaPaleta,
  type ClassesDaPaleta,
  type PaletaDoPainel,
} from "./paleta"

export type PapelDoVisitante = "platform_admin" | "org_admin"

export interface EstadoDoTile {
  provider: ProviderDoPainel
  /** `disconnected` | `connected` | `error` (org_integrations) ou `inactive`/`active` (whatsapp). */
  status: string
  /** Só identificadores PÚBLICOS. O segredo nunca vem para cá. */
  config: Record<string, string | null>
  /** "existe um segredo guardado?" — nunca o segredo. */
  temSegredo: boolean
  /** ISO. `null` quando nunca foi tocado. */
  atualizadoEm: string | null
}

export interface LinhaDaTrilha {
  id: string
  action: string
  actor_type: string
  created_at: string
  metadata: Record<string, unknown> | null
}

export interface IntegrationsPanelProps {
  viewerRole: PapelDoVisitante
  tiles: EstadoDoTile[]
  /** Base das rotas: `/api/platform/orgs/{id}/integracoes` ou `/api/configuracoes/integracoes`. */
  endpoint: string
  trilha?: LinhaDaTrilha[]
  /**
   * Escala de cinza. Ausente = `stone`, que é o CRM do cliente — o `/dashboard` NÃO passa a prop
   * e por isso não muda de aparência. `/platform` passa `"slate"` para parar de parecer um
   * enxerto do CRM dentro do console (900-57/AC4).
   *
   * É prop de APRESENTAÇÃO e nada mais: nenhum dado entra ou sai por ela. Resolver a diferença
   * de paleta buscando dado aqui dentro é que esbarraria na régua
   * `dashboard-platform-boundary.test.ts`, que proíbe este diretório de importar o caminho de
   * leitura de plataforma.
   */
  palette?: PaletaDoPainel
}

interface RespostaDaRota {
  ok?: boolean
  codigo?: string
  mensagem?: string
  technicalDetail?: string
  error?: string
  last4?: string
}

/**
 * O status vira TOM (em `providers.ts`, compartilhado), e o tom vira classe só aqui.
 *
 * Verde e vermelho não dependem da paleta — "com erro" é vermelho nas duas superfícies. O que
 * depende é o NEUTRO, que era fixo aqui na escala do CRM e por isso pintava o console com ela
 * mesmo quando o resto do tile já estivesse certo.
 */
function Badge({ status, classes }: { status: string; classes: ClassesDaPaleta }) {
  const r = rotuloDeStatusDoTile(status)
  const classe =
    r.tom === "ok"
      ? "bg-emerald-500/15 text-emerald-300"
      : r.tom === "erro"
        ? "bg-red-500/15 text-red-300"
        : classes.badgeNeutro
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classe}`}>
      {r.texto}
    </span>
  )
}

function Tile({
  estado,
  viewerRole,
  endpoint,
  classes,
}: {
  estado: EstadoDoTile
  viewerRole: PapelDoVisitante
  endpoint: string
  /** Prop PRÓPRIA, não herdada: `Tile` é uma função separada e hardcodava a escala sozinho. */
  classes: ClassesDaPaleta
}) {
  const def = DEFINICOES_DE_PROVIDER[estado.provider]
  const router = useRouter()
  const [segredo, setSegredo] = useState("")
  const [config, setConfig] = useState<Record<string, string>>(() =>
    Object.fromEntries(def.chavesDeConfig.map((k) => [k, estado.config[k] ?? ""])),
  )
  const [enviando, setEnviando] = useState(false)
  const [resposta, setResposta] = useState<RespostaDaRota | null>(null)
  const [last4, setLast4] = useState<string | null>(null)

  const somenteLeitura = !def.gravaEmOrgIntegrations

  async function salvar() {
    setEnviando(true)
    setResposta(null)
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: estado.provider, secret: segredo, config }),
      })
      const json = (await r.json()) as RespostaDaRota
      setResposta(json)
      if (json.ok) {
        setSegredo("")
        router.refresh()
      }
    } catch {
      setResposta({ ok: false, mensagem: "Erro de rede ao falar com o servidor." })
    } finally {
      setEnviando(false)
    }
  }

  async function revelar() {
    setLast4(null)
    try {
      const r = await fetch(`${endpoint}/revelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: estado.provider }),
      })
      const json = (await r.json()) as RespostaDaRota
      setLast4(json.ok ? (json.last4 ?? "") : "—")
    } catch {
      setLast4("—")
    }
  }

  return (
    <div
      data-testid={`tile-${estado.provider}`}
      className={classes.cartao}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className={classes.titulo}>{def.rotulo}</h3>
          <p className={classes.descricao}>{def.descricao}</p>
        </div>
        <Badge status={estado.status} classes={classes} />
      </div>

      {/* O limite honesto do selo, em TEXTO junto do badge — não só numa nota da story.
          "Conectado" garante que um segredo não vazio foi gravado E que a chamada de teste
          passou no momento da gravação; não garante que a credencial continua válida agora. */}
      <p className={classes.nota}>
        {estado.status === "connected" || estado.status === "active"
          ? `Credencial testada com sucesso ao ser salva${
              estado.atualizadoEm
                ? ` em ${new Date(estado.atualizadoEm).toLocaleDateString("pt-BR")}`
                : ""
            }. Não é uma verificação contínua.`
          : "Ainda não há credencial testada para esta integração."}
      </p>

      {somenteLeitura ? (
        // QA-900-51-2 — o texto anterior mandava o usuário para "o fluxo de WhatsApp", e ele
        // NÃO EXISTE: medido, 32 call sites LEEM `whatsapp_config` em `packages/web/src` e
        // ZERO escrevem (nenhum `.update`/`.upsert`/`.insert`). Mandar alguém para um caminho
        // inexistente é pior do que dizer que não há caminho — quem lê perde tempo procurando e
        // conclui que a tela está quebrada. Aqui o cartão diz a verdade.
        <div className={classes.caixaInformativa}>
          <p>
            O estado acima vem de <code>whatsapp_config</code>, que é a fonte que decide se o canal
            atende — não de <code>org_integrations</code>, onde a linha de WhatsApp é
            estruturalmente inescrevível (CHECK{" "}
            <code>whatsapp_sem_identificador_proprio</code>).
          </p>
          <p className="text-amber-300">
            <strong>Ainda não há como configurar o WhatsApp por esta aplicação.</strong> Hoje a
            credencial é gravada direto no banco. As stories <code>900-52</code>/<code>900-53</code>
            /<code>900-54</code> é que abrem esse caminho — até lá, fale com o suporte da Trifold.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {def.chavesDeConfig.map((chave) => (
            <label key={chave} className="block">
              <span className={classes.rotuloDeCampo}>
                {def.rotulosDeConfig[chave] ?? chave}
              </span>
              <input
                type="text"
                value={config[chave] ?? ""}
                onChange={(e) => setConfig({ ...config, [chave]: e.target.value })}
                className={classes.campo}
              />
            </label>
          ))}

          <label className="block">
            <span className={classes.rotuloDeCampo}>
              {def.rotuloSegredo} — {estado.temSegredo ? "configurado" : "não configurado"}
            </span>
            <input
              type="password"
              autoComplete="off"
              value={segredo}
              placeholder={estado.temSegredo ? "•••••••• (deixe vazio para manter)" : ""}
              onChange={(e) => setSegredo(e.target.value)}
              className={`${classes.campo} font-mono`}
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={salvar}
              disabled={enviando || segredo.trim() === ""}
              className="rounded bg-emerald-700 px-3 py-1 text-sm text-white disabled:opacity-40"
            >
              {enviando ? "Testando e salvando…" : "Testar e salvar"}
            </button>
            {estado.temSegredo && (
              <button
                type="button"
                onClick={revelar}
                className={classes.botaoSecundario}
              >
                Revelar últimos 4
              </button>
            )}
            {last4 !== null && (
              <span className={classes.mono}>…{last4}</span>
            )}
          </div>

          {resposta && !resposta.ok && (
            <div role="alert" className="rounded bg-red-950/40 px-3 py-2 text-sm text-red-300">
              <p>{resposta.mensagem ?? resposta.error ?? "Falha ao salvar."}</p>
              {/* R9: aparece porque o campo VEIO no payload — não porque o papel foi conferido
                  no navegador. A rota do cliente não serializa este campo. */}
              {resposta.technicalDetail && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-red-400">
                    Detalhes técnicos
                  </summary>
                  <pre className="mt-1 whitespace-pre-wrap break-all text-xs text-red-400">
                    {resposta.technicalDetail}
                  </pre>
                </details>
              )}
            </div>
          )}
          {resposta?.ok && (
            <p className="text-sm text-emerald-400">
              Credencial testada e salva
              {viewerRole === "platform_admin" ? " para esta empresa." : "."}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function IntegrationsPanel({
  viewerRole,
  tiles,
  endpoint,
  trilha,
  palette,
}: IntegrationsPanelProps) {
  const classes = classesDaPaleta(palette)
  const porProvider = new Map(tiles.map((t) => [t.provider, t]))
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS_DO_PAINEL.map((provider) => {
          const estado =
            porProvider.get(provider) ??
            ({
              provider,
              status: "disconnected",
              config: {},
              temSegredo: false,
              atualizadoEm: null,
            } satisfies EstadoDoTile)
          return (
            <Tile
              key={provider}
              estado={estado}
              viewerRole={viewerRole}
              endpoint={endpoint}
              classes={classes}
            />
          )
        })}
      </div>

      {trilha && trilha.length > 0 && (
        <div className={classes.cartao}>
          <h3 className={classes.tituloDaTrilha}>
            {viewerRole === "platform_admin"
              ? "Trilha desta empresa"
              : "Quem mexeu nas suas integrações"}
          </h3>
          <ul className={classes.listaDaTrilha}>
            {trilha.map((l) => (
              <li key={l.id}>
                <span className={classes.carimboDaTrilha}>
                  {new Date(l.created_at).toLocaleString("pt-BR")}
                </span>{" "}
                — {l.action} ·{" "}
                {String(l.metadata?.actor_label ?? "sem rótulo")} ({l.actor_type})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
