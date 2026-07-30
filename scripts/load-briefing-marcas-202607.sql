-- scripts/load-briefing-marcas-202607.sql
-- Story 75-238 — carga do Briefing Mestre (respostas do marketing, 30/07/2026)
-- nas marcas do Kit (marketing_brands): Trifold institucional (INSERT),
-- Yarden (INSERT) e Vind Residence (UPDATE).
--
-- JÁ EXECUTADO em PROD (dsopqkqjkmhytudaaolv) em 30/07/2026 via Management API.
-- Idempotente pelos WHERE NOT EXISTS — reexecutar não duplica (não há UNIQUE
-- em (org_id, nome); a idempotência é este guard). Dev (xnxvyg…) ficou SEM a
-- carga de propósito: as properties de lá têm outros ids/dados.
--
-- Complementos aplicados depois (QA 75-238, itens de dado):
--   1) diretrizes de Trifold e Vind ganharam: "Não citar concorrentes nem
--      perfis de referência pelo nome em posts — concorrência é contexto interno."
--   2) briefing institucional: "REFERÊNCIAS (perfis):" virou
--      "REFERÊNCIAS (uso interno para inspiração de formato — NUNCA citar em post):"
-- O texto abaixo é a carga ORIGINAL (pré-complementos) — fonte da verdade
-- editável é a UI do Kit, não este arquivo.

UPDATE marketing_brands
   SET voz_da_marca = 'Aspiracional para quem vai morar; racional e objetiva para quem vai investir. Bater forte (e com verdade) na proximidade da entrega — sempre ancorada na data contratual. Jovem, elegante e próxima: público de upgrade, 28–45 anos, que busca evolução de vida ou investimento inteligente.',
       diretrizes   = 'NÃO falar sobre o entorno do empreendimento (regra do marketing). Prazo: usar SOMENTE a entrega contratual (abril/2027) — pode dizer que é a entrega mais próxima do mercado e que faltam poucos meses, NUNCA prometer antecipação. Nunca prometer % de valorização. Não citar preço/condições que não estejam no briefing.',
       briefing     = 'PRODUTO: Vind Residence, Jd. Novo Horizonte (Maringá). Obra em revestimento e pavimentos; entrega contratual ABRIL/2027 — a mais próxima entre todos os concorrentes (que entregam 2028–2030): é o argumento nº 1. ~72% vendido. Condomínio exclusivo de APENAS 48 unidades. Liberado para Airbnb/short-stay (forte p/ investidor). Preço na faixa de R$ 10.000/m² (mediana do grupo competitivo).

UNIDADES (66,91 m²): 2 suítes (casal + filhos com BWC privativo/social), sacada ampla com churrasqueira, cozinha americana, pé-direito 2,70 m, laje técnica, pontos de ar-condicionado, tomadas USB, persianas embutidas nas esquadrias, infra para automação residencial, piso laminado nos quartos, porcelanato nas áreas sociais, banheiros 100% revestidos com ventilação natural, medidores individuais (gás, água, energia).

LAZER/CONDOMÍNIO: piscina, salão de festas, espaço gourmet, sala de jogos, brinquedoteca, playground, pet place, fitness, pilates, coworking, sala de reuniões; guarita, hall com 4 m de pé-direito, infra p/ veículos elétricos, captação de água de chuva, infra p/ biometria, CFTV com acesso remoto, áreas comuns entregues equipadas e decoradas.

PÚBLICO: upgrade, 28–45 anos, renda 15k+; profissionais liberais, servidores, investidores e quem precisa morar logo; Maringá e vizinhas.

ARGUMENTOS (ordem de força): 1) entrega mais próxima do mercado (abril/2027); 2) liberado para Airbnb; 3) localização e potencial de valorização; 4) exclusividade (48 unidades) + 2 suítes + diferenciais da unidade.

CONCORRÊNCIA (contexto interno, não citar nomes em post): Luminare 90% vendido a R$ 9.200/m²; Flow R$ 10.600/m² (75%); Imperium Park R$ 10.000/m² (74%); na Zona 8, Giardini 90% a R$ 9.500/m². O Vind vence em PRAZO DE ENTREGA — todos os demais entregam 2028+.',
       updated_at   = now()
 WHERE org_id = '00000000-0000-0000-0000-000000000001' AND property_id = '00000000-0000-0000-0004-000000000001' AND tipo = 'empreendimento';

INSERT INTO marketing_brands (org_id, nome, tipo, property_id, cores, fontes, voz_da_marca, diretrizes, briefing)
SELECT '00000000-0000-0000-0000-000000000001', 'Trifold', 'institucional', NULL,
       '[{"hex":"#000000","nome":"Primária (fundo prioritário)"},{"hex":"#F27A5E","nome":"Laranja (energia/promo)"},{"hex":"#2E2E2E","nome":"Cinza de apoio"},{"hex":"#FFFFFF","nome":"Branco de apoio"}]'::jsonb,
       '[{"papel":"Geral","nome":"Space Grotesk"}]'::jsonb,
       'Elegante, sóbria e próxima do cliente. Português do Brasil. Sofisticação sem frieza: fala com gente, não com "prospects". Frases curtas, claras e elegantes; benefícios concretos e argumentos objetivos antes de adjetivos. Evitar excesso de exclamações, emojis ou chamadas agressivas de venda. Temas naturais: patrimônio, qualidade de vida, localização estratégica, mobilidade, valorização, praticidade, crescimento e investimento. Aspiracional para quem vai morar; racional para quem vai investir.', 'NUNCA prometer percentual de valorização nem "retorno garantido" — falar de potencial e de fatos (histórico, localização, % vendido), jamais de garantia. NUNCA cravar prazo de entrega diferente do contratual — se um argumento pedir prazo, usar somente a data contratual. A base cristã da empresa é real, mas na comunicação de mercado (lifestyle/consumidor final) deve ser apenas sugerida com sutileza, nunca explicitada — não filtrar audiência por identidade religiosa. Não inventar preço, metragem, condição ou promoção que não estejam no briefing. Publicação é sempre aprovada por humano.', 'QUEM É: Trifold Engenharia, Maringá-PR. CNPJ de 2019, mas o time técnico e estratégico constrói junto desde 1997 ("segunda geração") — narrativa-chave contra a objeção "construtora nova". Verticalmente integrada: incorpora, projeta e executa sem depender de terceiros nas etapas críticas. 13 engenheiros in-house (não terceirizados): quem projeta é quem responde no canteiro e assina a entrega.

CREDIBILIDADE (B2B): obras para Coca-Cola FEMSA, Unimed Maringá, Sicoob, GT Foods, Grupo CPA, Notre Educacional, Frangobras, Angelus Cemitério Vertical, Grupo Prever, Mafip. Central de Apartamentos Decorados com +1.000 m² na Av. Nildo Ribeiro da Rocha, 1.337.

PILARES DE PRODUTO/COPY: PMGT (Preço Máximo Garantido Trifold — preço fixo com flexibilidade de execução, exclusivo); auditoria independente do canteiro (equipe separada da obra); compatibilização BIM (elimina retrabalho); histórico de entregas antes do prazo (usar como histórico, NUNCA como promessa); pé-direito 2,70 m (padrão de mercado é 2,60 m); laje plana protendida = planta 100% personalizável, sem viga aparente nem pilar no living; sistema Lightwall (conforto térmico + acústico + custo que volta em qualidade). Promessa de experiência: "o cliente percebe que recebeu mais do que comprou".

PÚBLICO: 30–50 anos, renda 15k+/mês, ~65% morador e ~35% investidor; profissionais liberais e servidores públicos de Maringá e região norte do PR.

PROVAS SOCIAIS (clientes reais do Vind, usar à vontade): Marielle Valente ("escolhi o Vind pela Trifold... construtora que tem os mesmos valores que eu... custo-benefício maravilhoso"); Michele Valente ("alto padrão, localização privilegiada... condições muito facilitadas"); Sandro Alarcão ("localização, atendimento perfeito, área de lazer, acesso ao Parque do Ingá e Bosque 2... vale a pena vir conhecer").

TEMAS DESEJADOS: bastidores de obra, time e cultura, andamento das obras, dicas para compradores, investimento imobiliário, conteúdo sobre Maringá.

CADÊNCIA: 3 posts/semana (2 reels + 1 estático); 1 post de feed por semana focado em CONVERSÃO (CTA + link), o resto engajamento/posicionamento; stories todos os dias com link e CTA.

VISUAL: preto #000000 (fundo prioritário, elegância) + laranja #F27A5E (energia/promo) + cinza #2E2E2E e branco de apoio; tipografia Space Grotesk. Ícone remete sutilmente a uma pomba branca.

REFERÊNCIAS (perfis): cidadearuna, vanguard.londrina, gtbuildingoficial, altmaincorporadora, construtoralaguna, kopstein.poa, woss.inc.

SOLUM (pré-lançamento, ainda sem cadastro de empreendimento no CRM): Rua Assaí 153, Chácara Paulista, lançamento previsto ago/set 2026, fase de teaser. Slogans: "Sua família merece viver o único." / "Singular, desde o solo.". Argumentos: região consolidada e em expansão, repleta de serviços, perto do centro ("fazer tudo a pé"); pé-direito duplo; personalização total da planta (laje plana protendida); foco em wellness/qualidade do tempo; decorado como vitrine. Público: igual ao Yarden (2º imóvel, consolidação patrimonial, casais 1–3 filhos, renda 15–35k). Até o lançamento: só teaser, sem preço, metragem ou condição.'
 WHERE NOT EXISTS (SELECT 1 FROM marketing_brands WHERE org_id = '00000000-0000-0000-0000-000000000001' AND tipo = 'institucional' AND is_active);

INSERT INTO marketing_brands (org_id, nome, tipo, property_id, cores, fontes, voz_da_marca, diretrizes, briefing)
SELECT '00000000-0000-0000-0000-000000000001', 'Yarden', 'empreendimento', '00000000-0000-0000-0004-000000000002', '[]'::jsonb, '[]'::jsonb,
       'Aspiracional para moradia, racional para investidor. Slogan do lançamento: "Onde a Natureza encontra a Sofisticação". Falar com o CASAL: a decisão é conjugal — motivação emocional dela (bem-estar, família, natureza) + validação racional dele (números, escassez, condição). Tom de consolidação patrimonial: segundo imóvel, upgrade, legado para os filhos.', 'Nunca prometer % de valorização — usar fatos: 90% vendido, bairro planejado em construção, condição 10/20/70. Prazo: somente o contratual (2029). Não citar concorrentes pelo nome em posts. Não inventar preço/condição fora do briefing.', 'PRODUTO: Yarden, Rua Carlos Meneghetti 168, Gleba Itororó (Maringá), a poucos passos do Bosque II e da região central. Obra em infraestrutura; entrega contratual 2029. Mono-torre de 60 unidades — 90% VENDIDO (54/60): escassez REAL, ~2 vendas/mês desde mar/2024, entre os 3 mais vendidos do padrão Alto da cidade. Ticket R$ 770k–1.05M; ~R$ 11.135/m²; condição 10/20/70 (10% entrada, 20% na obra, 70% nas chaves) — maioria da concorrência trabalha 30/70 ou 40/60.

UNIDADES: Tipo A 83,66 m² e Tipo B 79,81 m², cada um em 2 versões (2 suítes OU 1 suíte master + 2 quartos); todas com varanda gourmet com churrasqueira A CARVÃO e área técnica; opção de 2 vagas (produto preferido do estudo DataStore 2025). 4 unidades por andar. Pé-direito duplo em áreas.

LAZER (do subsolo ao rooftop, foco wellness): rooftop, espaço gourmet com piscina privativa, pilates, sports bar, beauty room, pet care — o lazer mais completo do grupo competitivo.

PÚBLICO: 2ª moradia/investimento/upgrade; renda familiar 15–35k; profissionais liberais, empresários em consolidação patrimonial; 65% casados com 1–3 filhos; valores: família, fé, churrasco/lazer em grupo, patrimônio para os filhos, segurança em cenário de incerteza.

ARGUMENTOS: 1) localização Gleba Itororó — bairro planejado sendo construído ao redor = vetor de valorização (falar como potencial, não garantia); 2) mais barato pelo que entrega (concorrente direto da Gleba cobra 15,6% mais caro por m² e vende mais devagar); 3) decorado forte; 4) frase-síntese: nenhum outro combina localização premium na Gleba + metragem exclusiva + 2 vagas + lazer completo + condição facilitada — e o mercado validou com 90% vendido.'
 WHERE NOT EXISTS (SELECT 1 FROM marketing_brands WHERE org_id = '00000000-0000-0000-0000-000000000001' AND property_id = '00000000-0000-0000-0004-000000000002' AND is_active);
