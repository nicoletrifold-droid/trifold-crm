/**
 * Story 87-13 — os QUATRO empreendimentos REAIS de produção (`dsopqkqjkmhytudaaolv`),
 * colados do banco em 11/08/2026 pelo @dev, exatamente na forma que o PostgREST
 * devolve para o `select` de `loadProperties` (com `typologies` e `units` embutidos).
 *
 * POR QUE UMA FIXTURE COMPARTILHADA, E NÃO UMA CÓPIA EM CADA TESTE
 * ----------------------------------------------------------------
 * A AC3 (contexto byte a byte) e a AC4 (turno inteiro) precisam do MESMO cadastro.
 * Duas cópias divergem no primeiro ajuste — e a AC3 compara contra um golden gravado
 * em disco: uma fixture que derivasse do golden sem que ninguém percebesse
 * transformaria a prova de não-regressão em tautologia.
 *
 * `is_active` está como o PALIATIVO de 10/08 13:45 UTC o deixou (Japura e Solum em
 * `false` — soft delete, `api-utils.ts:29-49`). `nicole_enabled` está como a migration
 * 220 o deixa (backfill nomeado: só Vind e Yarden).
 *
 * ⚠️ `createFakeSupabase` NÃO materializa embedded resources — ele ignora as colunas
 * do `select` e devolve a linha inteira. É por isso que `typologies` e `units` estão
 * no próprio objeto: é assim que o fake os entrega, e é assim que o PostgREST os
 * entrega. (Armadilha 3 das Dev Notes.)
 */

export type LinhaProperty = Record<string, unknown>

/** `units` como o PostgREST as devolve para o `select`: só o `status`. */
function unidades(vendidas: number, disponiveis: number): Array<{ status: string }> {
  return [
    ...Array.from({ length: vendidas }, () => ({ status: "sold" })),
    ...Array.from({ length: disponiveis }, () => ({ status: "available" })),
  ]
}

/** A org de produção — a mesma nas quatro linhas. */
export const ORG_PRODUCAO = "00000000-0000-0000-0000-000000000001"

export const VIND: LinhaProperty = {
  "id": "00000000-0000-0000-0004-000000000001",
  "name": "Vind Residence",
  "slug": "vind-residence",
  "status": "selling",
  "address": "Rua Jose Pereira da Costa, 547",
  "neighborhood": "Jardim Novo Horizonte",
  "city": "Maringa",
  "state": "PR",
  "concept": "Apartamento boutique com estrutura moderna e inteligente. 2 suites com 66,91m2 de area privativa, sacada ampla com churrasqueira a carvao. Piscina aquecida, pet place, pilates, sports bar e coworking.",
  "description": "O Vind Residence e um empreendimento boutique da Trifold Engenharia, localizado no Jardim Novo Horizonte em Maringa-PR. Proximo a Unicesumar, Colegio Dom Bosco, Parque do Inga e Super Muffato. Apartamentos de 2 suites com sacada ampla e churrasqueira a carvao. Decorado disponivel para visita na construtora.",
  "amenities": [
    "Piscina aquecida",
    "Pet place",
    "Pilates",
    "Sports bar",
    "Coworking",
    "Churrasqueira a carvao na sacada",
    "Sacada ampla",
    "Salao de festas",
    "Espaco gourmet",
    "Fitness"
  ],
  "differentials": [],
  "delivery_date": "2027-06-30",
  "total_units": 48,
  "total_floors": 15,
  "units_per_floor": 4,
  "commercial_rules": {
    "mcmv_eligible": false,
    "min_down_payment": 68000,
    "requires_down_payment": true
  },
  "faq": [
    {
      "answer": "O Vind Residence fica na Rua José Pereira da Costa, 547, Jardim Novo Horizonte, em Maringá-PR. Como referência, fica próximo à Avenida Cerro Azul e ao Supermercado Muffato.",
      "question": "Onde fica o Vind Residence? Qual a referência / fica perto de quê?"
    }
  ],
  "is_active": true,
  "nicole_enabled": true,
  "org_id": ORG_PRODUCAO,
  "typologies": [
    {
      "name": "2 Suites",
      "private_area_m2": 66.91,
      "bedrooms": 2,
      "suites": 2,
      "has_balcony": true,
      "balcony_bbq": true
    }
  ],
  "units": unidades(36, 12),
}

export const YARDEN: LinhaProperty = {
  "id": "00000000-0000-0000-0004-000000000002",
  "name": "Yarden",
  "slug": "yarden",
  "status": "selling",
  "address": "Rua Carlos Meneghetti, 168",
  "neighborhood": "Gleba Itororo",
  "city": "Maringa",
  "state": "PR",
  "concept": "Residencial de alto padrao com design biofilico, onde a natureza se integra a arquitetura. Rooftop exclusivo com fitness, sport bar, coworking e mirante panoramico. 60 unidades com 2 opcoes de planta, combinando sofisticacao e bem-estar.",
  "description": "O Yarden Residence redefine o conceito de morar bem em Maringa. Com design biofilico que integra natureza e arquitetura, o empreendimento oferece 2 pavimentos de lazer completos, rooftop exclusivo com mirante panoramico e localizacao privilegiada na Gleba Itororo, ao lado do Bosque II.",
  "amenities": [
    "Rooftop exclusivo com fitness",
    "Sport bar no rooftop",
    "Coworking no rooftop",
    "Mirante panoramico",
    "Piscina",
    "Salao de festas",
    "Espaco gourmet",
    "Pet place",
    "Playground",
    "Miniquadra",
    "Fire pit",
    "Area gourmet"
  ],
  "differentials": [],
  "delivery_date": "2029-06-30",
  "total_units": 60,
  "total_floors": 19,
  "units_per_floor": 4,
  "commercial_rules": {
    "mcmv_eligible": false,
    "requires_down_payment": true
  },
  "faq": [],
  "is_active": true,
  "nicole_enabled": true,
  "org_id": ORG_PRODUCAO,
  "typologies": [
    {
      "name": "Tipologia A - 2 Suites",
      "private_area_m2": 83.66,
      "bedrooms": 2,
      "suites": 2,
      "has_balcony": true,
      "balcony_bbq": false
    },
    {
      "name": "Tipologia B - 2 Dorm + 1 Suite",
      "private_area_m2": 79.81,
      "bedrooms": 3,
      "suites": 1,
      "has_balcony": true,
      "balcony_bbq": false
    }
  ],
  "units": unidades(51, 9),
}

export const JAPURA: LinhaProperty = {
  "id": "fcbd2a01-7c59-48b0-8e88-f5a68f4970cd",
  "name": "Japura",
  "slug": "japura",
  "status": "planning",
  "address": "A definir",
  "neighborhood": null,
  "city": "Maringa",
  "state": "PR",
  "concept": null,
  "description": null,
  "amenities": [],
  "differentials": [],
  "delivery_date": null,
  "total_units": null,
  "total_floors": null,
  "units_per_floor": null,
  "commercial_rules": {
    "notes": null,
    "status_label": null,
    "mcmv_eligible": false,
    "financing_options": [],
    "key_selling_points": [],
    "ideal_buyer_profile": null,
    "min_down_payment_pct": 0,
    "down_payment_flexible": false,
    "requires_down_payment": false,
    "identification_keywords": [],
    "example_down_payment_brl": null
  },
  "faq": [],
  "is_active": false,
  "nicole_enabled": false,
  "org_id": ORG_PRODUCAO,
  "typologies": [],
  "units": unidades(0, 0),
}

export const SOLUM: LinhaProperty = {
  "id": "5694ecf1-eb53-4d9e-bb82-4c06f0b19690",
  "name": "Solum",
  "slug": "solun",
  "status": "planning",
  "address": "A definir",
  "neighborhood": null,
  "city": "Maringa",
  "state": "PR",
  "concept": null,
  "description": null,
  "amenities": [],
  "differentials": [],
  "delivery_date": null,
  "total_units": null,
  "total_floors": null,
  "units_per_floor": null,
  "commercial_rules": {
    "notes": null,
    "status_label": null,
    "mcmv_eligible": false,
    "financing_options": [],
    "key_selling_points": [],
    "ideal_buyer_profile": null,
    "min_down_payment_pct": 0,
    "down_payment_flexible": false,
    "requires_down_payment": false,
    "identification_keywords": [],
    "example_down_payment_brl": null
  },
  "faq": [],
  "is_active": false,
  "nicole_enabled": false,
  "org_id": ORG_PRODUCAO,
  "typologies": [],
  "units": unidades(0, 0),
}

/**
 * As quatro linhas na ordem determinística da AC1 (`order by created_at, name`) —
 * Japura e Solum foram criados na MESMA transação e têm `created_at` idêntico ao
 * microssegundo, então `created_at` sozinho não desempata.
 */
export const CADASTRO_PRODUCAO: LinhaProperty[] = [VIND, YARDEN, JAPURA, SOLUM]
