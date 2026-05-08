status: Done

# Story 5.7 — Gestao de Empreendimentos (Interface Visual do Catalogo)

## Contexto
O CRUD de empreendimentos, tipologias e unidades ja existe no backend (Bloco 2 — Stories 2.1, 2.2, 2.3). Esta story cria a interface admin completa com tabs para gerenciar tudo em uma unica pagina. O admin precisa poder editar informacoes dos empreendimentos, adicionar tipologias, gerenciar status de unidades individuais, editar FAQ e regras comerciais — tudo visual, sem SQL.

## Acceptance Criteria
- [ ] AC1: Pagina `/dashboard/properties/[id]/manage` renderiza com tabs
- [ ] AC2: **Tab Informacoes Gerais:** Formulario completo de edicao do empreendimento (todos os campos de 2.1)
- [ ] AC3: **Tab Tipologias:** Lista de tipologias do empreendimento com CRUD inline:
  - Nome, metragem, quartos, suites, banheiros, sacada, churrasqueira
  - Botao "Nova tipologia" / "Editar" / "Desativar"
- [ ] AC4: **Tab Unidades:** Tabela de unidades com filtros (status, andar, tipologia):
  - Editar status (disponivel/reservado/vendido) com dropdown inline
  - Editar preco inline (admin only)
  - Exibir totais: X disponiveis, Y reservadas, Z vendidas
- [ ] AC5: **Tab FAQ:** Lista de pergunta-resposta com toggle ativo/inativo, criar/editar/remover
- [ ] AC6: **Tab Regras Comerciais:** Formulario com: exige entrada (toggle), valor minimo, MCMV (toggle), faixa de preco visivel (toggle)
- [ ] AC7: **Tab Restricoes IA:** Lista de textos que a Nicole NAO pode dizer sobre este empreendimento
- [ ] AC8: Alteracoes salvas via API existente (Stories 2.1, 2.2, 2.3) — sem criar novas rotas
- [ ] AC9: Indicador de ultima atualizacao no header ("Atualizado ha 2 horas por Admin")
- [ ] AC10: Mapa de unidades: visualizacao por andar (grid mostrando posicao/status por cor)

## Detalhes Tecnicos

### Arquivos a criar:
- `packages/web/src/app/dashboard/properties/[id]/manage/page.tsx` — Pagina com tabs
- `packages/web/src/components/properties/property-tabs.tsx` — Tab container
- `packages/web/src/components/properties/property-info-tab.tsx` — Tab info geral
- `packages/web/src/components/properties/typologies-tab.tsx` — Tab tipologias
- `packages/web/src/components/properties/units-tab.tsx` — Tab unidades
- `packages/web/src/components/properties/units-grid.tsx` — Grid visual por andar
- `packages/web/src/components/properties/faq-tab.tsx` — Tab FAQ
- `packages/web/src/components/properties/rules-tab.tsx` — Tab regras comerciais
- `packages/web/src/components/properties/restrictions-tab.tsx` — Tab restricoes IA

### Mapa de unidades (grid por andar):
```typescript
// Visualizacao: cada andar e uma linha, cada posicao e uma celula
// Cores: verde = disponivel, amarelo = reservado, vermelho = vendido
// Clique abre modal de edicao da unidade

interface UnitGridProps {
  units: Unit[];
  totalFloors: number;
  unitsPerFloor: number;
}
```

### Referencia agente-linda:
- Adaptar pattern de tabs de `~/agente-linda/packages/web/src/components/`
- APIs do Bloco 2 ja existem — esta story e apenas frontend

## Dependencias
- Depende de: 2.1 (CRUD empreendimentos), 2.2 (CRUD tipologias), 2.3 (CRUD unidades), 1.5 (auth admin)
- Bloqueia: Nenhuma

## Estimativa
G (Grande) — 3-4 horas

## Change Log

| Data | Agente | Descrição |
|------|--------|----------|
| 2026-05-08 | @po | Story auditada — implementada em produção, fechada retroativamente |
