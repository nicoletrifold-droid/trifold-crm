status: Done

# Story 6.5 — Resumo IA do Lead (Versao Corretor)

## Contexto
O resumo IA e o diferencial para o corretor: em vez de ler 30 mensagens, ele ve "O que voce precisa saber antes de atender" — preferencias, objecoes, perguntas e proximos passos recomendados. O resumo e gerado pela Story 4.8 e armazenado em `leads.ai_summary`. Esta story cobre a exibicao otimizada para o corretor, com destaque visual e linguagem orientada a acao.

## Acceptance Criteria
- [x] AC1: No detalhe do lead do corretor (Story 6.4), resumo exibido como card destacado no topo
- [x] AC2: Card com titulo "O que voce precisa saber" e icone de IA
- [x] AC3: Secoes do resumo formatadas com visual claro:
  - **Interesse:** Empreendimento + tipologia + preferencias (badges)
  - **Score:** Badge colorido (Frio/Morno/Quente)
  - **Perguntas do lead:** Lista com bullets
  - **Objecoes:** Lista com bullets (vermelho se houver)
  - **Proximos passos:** Lista com bullets (verde, orientado a acao)
- [x] AC4: Se resumo nao existe ainda, exibir: "Resumo sera gerado automaticamente quando a conversa avancar"
- [ ] AC5: Timestamp de quando o resumo foi gerado/atualizado
- [ ] AC6: Resumo parseado de Markdown para componentes visuais (nao exibir raw markdown)
- [ ] AC7: Card colapsavel (pode expandir/colapsar) — comeca expandido

## Detalhes Tecnicos

### Arquivos a criar/modificar:
- `packages/web/src/components/leads/lead-summary-card.tsx` — Componente visual do resumo (reusar na Story 4.5 e 6.4)

### Parsing do resumo:
```typescript
// O resumo e Markdown gerado pelo Claude (Story 4.8)
// Parsear secoes e renderizar com componentes visuais

function parseSummary(markdown: string): ParsedSummary {
  // Extrair secoes: Interesse, Score, Perguntas, Objecoes, Proximos Passos
  // Retornar objeto estruturado para renderizacao
}

interface ParsedSummary {
  interest?: string;
  score?: number;
  questions?: string[];
  objections?: string[];
  nextSteps?: string[];
  raw: string; // fallback se parsing falhar
}
```

### Score badge:
```typescript
function getScoreBadge(score: number) {
  if (score >= 70) return { label: 'Quente', color: 'red', icon: 'flame' };
  if (score >= 30) return { label: 'Morno', color: 'yellow', icon: 'sun' };
  return { label: 'Frio', color: 'blue', icon: 'snowflake' };
}
```

## Dependencias
- Depende de: 4.8 (resumo IA gerado), 6.4 (pagina de detalhe do corretor)
- Bloqueia: Nenhuma

## Estimativa
P (Pequena) — 1-2 horas

## File List

- `packages/web/src/app/broker/leads/[id]/page.tsx` — Secao de resumo IA integrada na pagina de detalhe do lead do corretor (card destacado no topo com titulo "O que voce precisa saber", score badge, e fallback para resumo pendente)

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
