---
epic: 32
title: Número de Unidade no Vínculo Cliente-Obra
status: In Progress
created_at: 2026-05-14
updated_at: 2026-05-14
created_by: River (@sm)
priority: P1
depends_on: []
blocks: []
stories_planned: [32.1]
estimated_points: 5
estimated_duration: ~1 dia útil
---

# Epic 32 — Número de Unidade no Vínculo Cliente-Obra

## Objetivo

Permitir registrar o número de unidade/apartamento de cada cliente vinculado a uma obra, tornando o cadastro mais completo e rastreável — especialmente em empreendimentos com múltiplas unidades onde cada comprador tem uma unidade específica.

## Contexto de Negócio

A tabela `cliente_obras` (M:N entre clientes e obras) não possui campo para a unidade/apartamento. Em empreendimentos com múltiplas unidades, é essencial saber qual unidade pertence a cada cliente para fins de acompanhamento, comunicação e controle de entrega. Hoje essa informação precisa ser anotada fora do sistema.

## Stories

| Story | Título | Pontos | Status |
|-------|--------|--------|--------|
| 32.1 | Campo Número de Unidade no Cadastro de Cliente na Obra | 5 | Draft |

## Critérios de Sucesso do Epic

- [ ] Campo `numero_unidade` visível e editável nos formulários de criação e vinculação de cliente
- [ ] Número da unidade exibido na lista de clientes vinculados à obra
- [ ] Campo editável inline para clientes já vinculados
- [ ] Campo opcional (não obrigatório) — obras sem unidades não são impactadas
