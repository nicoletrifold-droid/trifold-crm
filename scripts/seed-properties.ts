import { createClient } from "@supabase/supabase-js"
import { resolverAmbiente } from "./lib/db-env"

// Story 900-3b (AC3): alvo por `scripts/lib/db-env.ts` — allowlist que falha FECHADA,
// default TESTE. Escrever em produção exige TRIFOLD_ENV=producao E TRIFOLD_ALLOW_PROD=1.
const ALVO = resolverAmbiente({ escreve: true })
const supabase = createClient(
  ALVO.url,
  ALVO.serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG_ID = "00000000-0000-0000-0000-000000000001"
const VIND_ID = "00000000-0000-0000-0004-000000000001"
const YARDEN_ID = "00000000-0000-0000-0004-000000000002"
const VIND_TIPO_ID = "00000000-0000-0000-0005-000000000001"
const YARDEN_TIPO_A_ID = "00000000-0000-0000-0005-000000000002"
const YARDEN_TIPO_B_ID = "00000000-0000-0000-0005-000000000003"

async function seedProperties() {
  // ==================== VIND ====================
  console.log("Seeding Vind Residence...")
  const { error: vindError } = await supabase.from("properties").upsert({
    id: VIND_ID,
    org_id: ORG_ID,
    name: "Vind Residence",
    slug: "vind-residence",
    status: "selling",
    address: "Rua Jose Pereira da Costa, 547",
    city: "Maringa",
    state: "PR",
    concept: "Residencial de alto padrao com 48 unidades, sacada ampla com churrasqueira a carvao e localizacao privilegiada.",
    total_units: 48,
    total_floors: 15,
    units_per_floor: 4,
    type_floors: 12,
    basement_floors: 2,
    leisure_floors: 1,
    delivery_date: "2027-06-30",
    commercial_rules: { requires_down_payment: false, mcmv_eligible: false },
    amenities: [
      "Churrasqueira a carvao na sacada",
      "Sacada ampla",
      "Salao de festas",
      "Espaco gourmet",
      "Fitness",
    ],
  }, { onConflict: "slug" })
  if (vindError) console.error("Vind error:", vindError.message)
  else console.log("  Vind OK")

  // Tipologia Vind
  console.log("Seeding Vind tipologia...")
  const { error: vindTipoError } = await supabase.from("typologies").upsert({
    id: VIND_TIPO_ID,
    property_id: VIND_ID,
    name: "2 Suites",
    private_area_m2: 67.0,
    bedrooms: 2,
    suites: 2,
    bathrooms: 2,
    has_balcony: true,
    balcony_bbq: true,
    description: "Apartamento de 67m2 com 2 suites, sacada ampla com churrasqueira a carvao e 1 vaga de garagem coberta.",
  })
  if (vindTipoError) console.error("Vind tipo error:", vindTipoError.message)
  else console.log("  Tipologia OK")

  // Unidades Vind (48: 12 andares x 4)
  console.log("Seeding Vind unidades...")
  const positions = ["frente-esquerda", "frente-direita", "fundos-esquerda", "fundos-direita"]
  const views = ["rua", "rua", "interna", "interna"]
  const vindUnits = []
  for (let floor = 1; floor <= 12; floor++) {
    for (let unit = 0; unit < 4; unit++) {
      vindUnits.push({
        property_id: VIND_ID,
        typology_id: VIND_TIPO_ID,
        identifier: `${floor}0${unit + 1}`,
        floor,
        position: positions[unit],
        view_direction: views[unit],
        garage_count: 1,
        garage_type: "coberta",
        private_area_m2: 67.0,
        status: "available",
      })
    }
  }
  const { error: vindUnitsError } = await supabase.from("units").upsert(vindUnits)
  if (vindUnitsError) console.error("Vind units error:", vindUnitsError.message)
  else console.log(`  ${vindUnits.length} unidades OK`)

  // ==================== YARDEN ====================
  console.log("\nSeeding Yarden Residence...")
  const { error: yardenError } = await supabase.from("properties").upsert({
    id: YARDEN_ID,
    org_id: ORG_ID,
    name: "Yarden Residence",
    slug: "yarden-residence",
    status: "launching",
    address: "Rua Carlos Meneghetti, 168",
    neighborhood: "Gleba Itororo",
    city: "Maringa",
    state: "PR",
    concept: "Residencial de alto padrao com rooftop exclusivo: fitness, sport bar, coworking e mirante com vista panoramica. 60 unidades com 2 opcoes de planta.",
    description: "O Yarden redefine o conceito de morar bem em Maringa. Com 2 pavimentos de lazer completos, rooftop exclusivo e localizacao privilegiada na Gleba Itororo, oferece qualidade de vida incomparavel.",
    total_units: 60,
    total_floors: 19,
    units_per_floor: 4,
    type_floors: 15,
    basement_floors: 2,
    leisure_floors: 2,
    delivery_date: "2029-06-30",
    commercial_rules: { requires_down_payment: true, mcmv_eligible: false },
    amenities: [
      "Rooftop com fitness",
      "Sport bar no rooftop",
      "Coworking no rooftop",
      "Mirante panoramico",
      "Piscina",
      "Salao de festas",
      "Espaco gourmet",
      "Pet place",
      "Playground",
      "Miniquadra",
    ],
  }, { onConflict: "slug" })
  if (yardenError) console.error("Yarden error:", yardenError.message)
  else console.log("  Yarden OK")

  // Tipologias Yarden
  console.log("Seeding Yarden tipologias...")
  const { error: tipoAError } = await supabase.from("typologies").upsert({
    id: YARDEN_TIPO_A_ID,
    property_id: YARDEN_ID,
    name: "Tipologia A - 2 Suites",
    private_area_m2: 83.66,
    bedrooms: 2,
    suites: 2,
    bathrooms: 2,
    has_balcony: true,
    balcony_bbq: false,
    description: "Apartamento de 83,66m2 com 2 suites, ideal para casais que buscam conforto e privacidade.",
  })
  if (tipoAError) console.error("Tipo A error:", tipoAError.message)
  else console.log("  Tipologia A OK")

  const { error: tipoBError } = await supabase.from("typologies").upsert({
    id: YARDEN_TIPO_B_ID,
    property_id: YARDEN_ID,
    name: "Tipologia B - 2 Dorm + 1 Suite",
    private_area_m2: 79.81,
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    has_balcony: true,
    balcony_bbq: false,
    description: "Apartamento de 79,81m2 com 2 dormitorios + 1 suite, perfeito para familias que precisam de um quarto extra.",
  })
  if (tipoBError) console.error("Tipo B error:", tipoBError.message)
  else console.log("  Tipologia B OK")

  // Unidades Yarden (60: 15 andares x 4)
  console.log("Seeding Yarden unidades...")
  const yardenUnits = []
  for (let floor = 1; floor <= 15; floor++) {
    for (let unit = 0; unit < 4; unit++) {
      const isTypeA = unit === 0 || unit === 2
      const garageCount = floor >= 10 ? 2 : 1
      const garageArea = floor >= 10 ? 22.5 : 11.25

      yardenUnits.push({
        property_id: YARDEN_ID,
        typology_id: isTypeA ? YARDEN_TIPO_A_ID : YARDEN_TIPO_B_ID,
        identifier: `${floor}0${unit + 1}`,
        floor,
        position: positions[unit],
        view_direction: views[unit],
        garage_count: garageCount,
        garage_type: "coberta",
        garage_area_m2: garageArea,
        private_area_m2: isTypeA ? 83.66 : 79.81,
        status: "available",
      })
    }
  }
  const { error: yardenUnitsError } = await supabase.from("units").upsert(yardenUnits)
  if (yardenUnitsError) console.error("Yarden units error:", yardenUnitsError.message)
  else console.log(`  ${yardenUnits.length} unidades OK`)

  console.log("\nSeed properties complete!")
}

seedProperties().catch(console.error)
