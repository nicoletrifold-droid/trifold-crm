// Story 78-3 — Contrato reusável de coletor de billing (Epic 78).
//
// Este arquivo é a REFERÊNCIA CANÔNICA do contrato de coletor. As Stories
// 78-4 (OpenAI), 78-5 (Vercel), 78-6 (WhatsApp/Meta), 78-7 (Supabase/Resend)
// e 78-10 (Meta Ads) devem IMPORTAR e IMPLEMENTAR `BillingCollector` para o
// seu fornecedor e reusar `runCollector()` (run-collector.ts) sem redefinir
// este contrato — IDS: CREATE aqui, ADAPT nas demais. Só revisar sob aprovação
// do @architect (quality gate desta story).

/**
 * Janela de datas (inclusiva) que o coletor deve buscar.
 * `from`/`to` são datas civis no formato `YYYY-MM-DD`. O coletor traduz para o
 * formato exigido pela API do fornecedor (ex.: RFC 3339 na Anthropic).
 */
export interface CollectWindow {
  /** Primeiro dia da janela (inclusive), `YYYY-MM-DD`. */
  from: string
  /** Último dia da janela (inclusive), `YYYY-MM-DD`. */
  to: string
}

/**
 * Uma linha normalizada, pronta para upsert em `service_cost_snapshots`
 * (Story 78-1). Cada campo mapeia 1:1 para uma coluna daquela tabela; o
 * `run-collector.ts` acrescenta `service_id` (resolvido pelo slug) e
 * `collected_at` antes de persistir.
 */
export interface CostSnapshotRow {
  /** → `service_cost_snapshots.snapshot_date` (`date`). Dia coberto por esta métrica, `YYYY-MM-DD`. */
  snapshot_date: string
  /**
   * → `service_cost_snapshots.metric` (`text`, livre — sem CHECK/enum na 78-1).
   * Ex.: `cost_usd`, `tokens_input`, `tokens_output`. Cada coletor define suas
   * próprias métricas. `collection_error` é reservado pelo runner (falha de coleta).
   */
  metric: string
  /** → `service_cost_snapshots.value` (`numeric`). Valor da métrica (custo em USD, contagem de tokens, etc.). */
  value: number
  /**
   * → `service_cost_snapshots.currency` (`text`, nullable, CHECK IN ('USD','BRL')).
   * `null` para métricas não-monetárias (tokens, requests). Sem conversão de moeda (NFR-7).
   */
  currency: "USD" | "BRL" | null
  /**
   * → `service_cost_snapshots.collection_status` (`text`, CHECK IN ('ok','manual','no_data','error')).
   * `ok` = coleta automática funcionou; `no_data` = API respondeu sem custo;
   * `manual` = valor inserido à mão (78-7); `error` = falha (gravado pelo runner).
   */
  collection_status: "ok" | "manual" | "no_data" | "error"
  /** → `service_cost_snapshots.raw_response` (`jsonb`, nullable). Payload bruto opcional, para depuração/auditoria. */
  raw_response?: unknown
}

/**
 * Contrato que cada coletor de fornecedor implementa. O runner
 * (`run-collector.ts`) chama `collect(window)` e isola qualquer exceção
 * (NFR-3) — o coletor pode lançar erro livremente, sem se preocupar com
 * try/catch nem com persistência.
 */
export interface BillingCollector {
  /** Deve bater com `platform_services.slug` (78-1): 'anthropic', 'openai', 'vercel', ... */
  serviceSlug: string
  /**
   * Busca custo/uso da janela `[from, to]` (inclusive) na API do fornecedor e
   * retorna linhas já normalizadas. PODE lançar exceção — o runner isola a
   * falha (NFR-3) e grava uma linha degradada `collection_status='error'`.
   */
  collect(window: CollectWindow): Promise<CostSnapshotRow[]>
}

/**
 * Resultado da execução de um coletor via `runCollector()`. É o corpo JSON
 * devolvido pela rota de cron.
 */
export interface CollectorResult {
  service_slug: string
  window: CollectWindow
  /** Quantidade de linhas efetivamente enviadas ao upsert. */
  rows_upserted: number
  /** `ok` = coleta persistida; `partial` = sucesso parcial; `error` = falha isolada (NFR-3). */
  status: "ok" | "partial" | "error"
  /** Mensagem de erro quando `status === 'error'`. */
  error?: string
}
