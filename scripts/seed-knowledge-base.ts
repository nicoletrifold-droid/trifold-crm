import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ORG_ID = "00000000-0000-0000-0000-000000000001"
const VIND_ID = "00000000-0000-0000-0004-000000000001"
const YARDEN_ID = "00000000-0000-0000-0004-000000000002"

const faqEntries = [
  // Geral
  { source_id: null, category: "geral", title: "Informacoes gerais", content: "Certo, para que possa ajuda-lo melhor, qual de nossos empreendimentos te interessou mais? O VIND ou o Yarden?" },
  { source_id: null, category: "geral", title: "Endereco Trifold", content: "A construtora Trifold fica localizada na Av. Arquiteto Nildo Ribeiro da Rocha, 1337 - Vila Marumby, Maringa - PR, 87005-160." },
  { source_id: null, category: "geral", title: "Decorado", content: "Temos sim. Nossos decorados ficam localizados na construtora Trifold. Qual melhor horario para agendar a sua visita?" },
  { source_id: null, category: "financeiro", title: "Promocao ou desconto", content: "As condicoes de pagamento sao flexiveis e podem ser personalizadas. Vamos agendar uma visita para fazer uma simulacao de pagamento para voce?" },
  { source_id: null, category: "financeiro", title: "Valor da entrada", content: "As condicoes de pagamento sao flexiveis e podem ser personalizadas, inclusive a entrada. Vamos agendar uma visita para fazer uma simulacao de pagamento para voce?" },
  { source_id: null, category: "financeiro", title: "Valor da parcela", content: "As condicoes de pagamento sao flexiveis e podem ser personalizadas, inclusive as parcelas. Vamos agendar uma visita para fazer uma simulacao de pagamento para voce?" },
  { source_id: null, category: "financeiro", title: "Minha Casa Minha Vida", content: "Para que eu possa ajuda-lo nessa questao, me responda qual valor de entrada voce possui para esse investimento?" },
  { source_id: null, category: "financeiro", title: "Nao tenho entrada", content: "Para a compra de algum de nossos apartamentos e necessario um valor de entrada. Voce gostaria de falar com um de nossos especialistas?" },
  { source_id: null, category: "lazer", title: "Estruturas de lazer", content: "Nossos empreendimentos contam com area gourmet, piscina, academia, salao de festas, playground e portaria 24h." },

  // VIND
  { source_id: VIND_ID, category: "apresentacao", title: "O que e o VIND", content: "O VIND e apartamento boutique, localizado na rua Jose Pereira da Costa, 547, proximo da Avenida Cerro Azul e do Super Muffato. Sao 2 suites com 67m2, sacada com churrasqueira e area de lazer completa." },
  { source_id: VIND_ID, category: "localizacao", title: "Localizacao VIND", content: "O VIND fica localizado na rua Jose Pereira da Costa, 547, proximo da Avenida Cerro Azul. Referencia principal: perto do Super Muffato da Av. Cerro Azul." },
  { source_id: VIND_ID, category: "localizacao", title: "Pontos de referencia VIND", content: "Pontos de referencia do VIND: 550m do Super Muffato (5min a pe), 1,5km da Unicesumar (5min de carro), 280m do Colegio Dom Bosco (4min a pe), 500m da Av. Cerro Azul (5min a pe), 350m da Av. Arquiteto Nildo Ribeiro da Rocha (4min a pe), 550m da Farmacia Droga Raia (5min a pe), 550m da Sorveteria Gela Boca (7min a pe), 2km do Parque do Inga (4min de carro)." },
  { source_id: VIND_ID, category: "tipologia", title: "Metragem VIND", content: "O VIND e um compacto de luxo com 67m2, todos os apartamentos com 2 suites, sacada ampla e churrasqueira a carvao. Vamos agendar uma visita para que voce conheca nosso apartamento decorado?" },
  { source_id: VIND_ID, category: "entrega", title: "Data entrega VIND", content: "O VIND sera entregue no primeiro semestre de 2027. Essa data atende suas expectativas?" },
  { source_id: VIND_ID, category: "materiais", title: "Planta VIND", content: "Tenho uma opcao melhor. O VIND possui um decorado que esta localizado na construtora Trifold, assim voce pode conhecer o espaco e a planta integralmente. Vamos agendar sua visita?" },
  { source_id: VIND_ID, category: "financeiro", title: "Valor VIND", content: "Os valores variam de acordo com a unidade escolhida, altura, 1 ou 2 vagas de garagem. Vamos agendar uma visita para que um de nossos especialistas te passe mais informacoes?" },
  { source_id: VIND_ID, category: "materiais", title: "Fotos VIND", content: "Vou te encaminhar algumas imagens, mas podemos te apresentar o projeto completo, inclusive o nosso apartamento decorado. Qual melhor horario pra voce fazer essa visita?" },
  { source_id: VIND_ID, category: "estrutura", title: "Andares VIND", content: "O VIND tem 15 andares: 1 terreo de lazer, 12 pavimentos tipo e 2 subsolos de garagem. Sao 48 unidades no total, 4 por andar." },

  // YARDEN
  { source_id: YARDEN_ID, category: "apresentacao", title: "O que e o YARDEN", content: "O YARDEN e o nosso sucesso de vendas. Apartamentos com opcao de 2 ou 3 dormitorios, todos com suite. Uma area de lazer completa com acabamento de alto padrao." },
  { source_id: YARDEN_ID, category: "localizacao", title: "Localizacao YARDEN", content: "O YARDEN fica localizado na Gleba Itororo, ao lado do Bosque II, em Maringa-PR." },
  { source_id: YARDEN_ID, category: "tipologia", title: "Metragem YARDEN", content: "O YARDEN possui apartamentos de 80 e 84m2. Apartamentos com opcao de 2 suites, ou 2 dormitorios + 1 suite. Vamos agendar uma visita para voce conhecer nosso decorado?" },
  { source_id: YARDEN_ID, category: "entrega", title: "Data entrega YARDEN", content: "O YARDEN sera entregue no primeiro semestre de 2029. Essa data atende suas expectativas?" },
  { source_id: YARDEN_ID, category: "materiais", title: "Planta YARDEN", content: "Tenho uma opcao melhor. YARDEN possui um decorado que esta localizado na construtora Trifold, assim voce pode conhecer o espaco e a planta integralmente. Vamos agendar sua visita?" },
  { source_id: YARDEN_ID, category: "financeiro", title: "Valor YARDEN", content: "Os valores variam de acordo com a metragem escolhida, altura, 1 ou 2 vagas de garagem. Vamos agendar uma visita para que um de nossos especialistas te passe mais informacoes?" },
  { source_id: YARDEN_ID, category: "materiais", title: "Fotos YARDEN", content: "Vou te encaminhar algumas imagens, mas podemos te apresentar o projeto completo, inclusive o nosso apartamento decorado. Qual melhor horario pra voce fazer essa visita?" },
  { source_id: YARDEN_ID, category: "estrutura", title: "Andares YARDEN", content: "O YARDEN tem 19 andares: 2 pavimentos de lazer, 15 pavimentos tipo e 2 subsolos de garagem. Sao 60 unidades no total, 4 por andar." },
]

async function seedKnowledgeBase() {
  console.log(`Seeding knowledge base (${faqEntries.length} entries)...`)

  for (const entry of faqEntries) {
    const { error } = await supabase.from("knowledge_base").upsert(
      {
        org_id: ORG_ID,
        source_id: entry.source_id,
        title: entry.title,
        content: entry.content,
        source: "nlu_csv",
        metadata: { category: entry.category },
      },
      { onConflict: "id" }
    )

    if (error) {
      console.error(`  Error: ${entry.title}: ${error.message}`)
    } else {
      console.log(`  ${entry.title} OK`)
    }
  }

  console.log("\nKnowledge base seed complete!")
}

seedKnowledgeBase().catch(console.error)
