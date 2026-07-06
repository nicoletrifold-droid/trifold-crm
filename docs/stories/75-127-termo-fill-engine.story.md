# Story 75-127 — Termo de Intenção: motor de preenchimento do PDF-modelo (Etapa 1/3)

## Metadata
- **Status:** Done (Etapa 1; merge junto do recurso completo) · **Epic:** Pastas / Termo auto-preenchido · **Branch:** feat/75-127-termo-fill-engine · **Complexidade:** M (5 pontos)
- **executor:** @dev · **quality_gate:** @qa

## Contexto
Fundação do recurso "gerar Termo de Intenção preenchido a partir dos documentos da pasta" (o "pulo do gato"). Etapa 1 = motor determinístico que, dado um objeto de dados, **carimba os campos no PDF-modelo YARDEN em branco** (mantendo logo, marca d'água, QR, dados PIX) e devolve os bytes do PDF. Extração por visão (Etapa 2) e UI/anexo (Etapa 3) vêm depois. Ver [[project-pastas-documentos]] e [[project-termo-autopreenchido]].

## Decisões (diretor, 2026-07-06)
- v1 cobre **PF e PJ**, modelo **YARDEN**.
- Preencher o **PDF-modelo existente** (não recriar do zero) → adicionar `pdf-lib`.

## Escopo
**IN:**
1. **Dependência:** adicionar `pdf-lib` ao `packages/web`.
2. **Template embutido:** o PDF-modelo YARDEN em branco (`~/Downloads/Termo_de_Interesse_YARDEN_MODELO_em_branco.pdf`) embutido no projeto como base64 (`lib/pastas/termo/template-yarden.ts`) — evita problema de path em runtime.
3. **Motor** `lib/pastas/termo/fill.ts`: `fillTermo(data: TermoData): Promise<Uint8Array>` — carrega o template, desenha o texto nas coordenadas mapeadas (converte topo-esquerda→base-esquerda; página A4 841.9pt), marca os checkboxes (fluxo + PIX) com "X". Campos: nome1, profissao, celular, email, endereco{logradouro,numero,complemento}, cidade, uf, cep, conjuge{nome,profissao,celular,email}, corretor, imobiliaria, fluxoPagamento, temPix (Grupo1/2), data{dia,mes}. Campos vazios = deixa em branco. Fonte/tamanho compatível com o modelo (~8-9pt, cor preta).
4. **Teste** `fill.test.ts`: `fillTermo` com dados de exemplo retorna PDF válido (magic bytes %PDF), não lança, e o texto aparece (extração de texto do resultado contém os valores).

**OUT:** extração por visão (Etapa 2); UI/botão/revisão (Etapa 3); anexar à pasta/assinatura (Etapa 3); modelos de outros empreendimentos.

## Acceptance Criteria
1. **Given** um `TermoData` PF completo, **when** chamo `fillTermo`, **then** recebo bytes de um PDF válido com nome/profissão/celular/email/endereço/cidade/UF/CEP + corretor/imobiliária preenchidos e o fluxo + PIX assinalados nas posições certas.
2. **Given** um `TermoData` com cônjuge, **then** os campos do cônjuge (linha "Cônjuge") são preenchidos.
3. **Given** campos vazios/null, **then** ficam em branco (sem "undefined"/erro).
4. **Given** PJ (nome = razão social), **then** preenche Nome 1 = razão social e o endereço; documentado como o representante entra (Etapa 2 define a fonte dos dados).
5. O modelo mantém logo, marca d'água, QR e dados do PIX (só adiciona texto). tsc/lint/testes limpos.

## Tasks (@dev)
- [ ] Adicionar `pdf-lib`; embutir template base64.
- [ ] `TermoData` + `fillTermo` com o mapa de coordenadas (do PDF original).
- [ ] `fill.test.ts`.
- [ ] Verificar renderizando um PDF de exemplo (imagem) — conferência visual das posições.
- [ ] tsc/eslint/vitest.

## Riscos
- **Coordenadas**: origem topo-esquerda (extração) vs base-esquerda (pdf-lib) → converter y = 841.9 − y. Verificar visualmente (render) antes de fechar.
- `pdf-lib` roda em Node runtime (as rotas serão Node, não Edge).
- Fonte embutida: usar Helvetica (StandardFonts) — pode diferir levemente da fonte mono do modelo, mas legível; aceitável no v1.

## Dev Agent Record (@dev — 2026-07-06)
- `pdf-lib ^1.17.1` adicionado ao `packages/web`. Template YARDEN embutido em base64 (`template-yarden.ts`, string simples — `.replace`/template-literal quebravam no tsx).
- `fill.ts`: `fillTermo(data)` carrega o template, embed Helvetica, carimba campos (y = pageH − bottom + 2) e marca fluxo/PIX com "X". Guarda de página (throw se template sem páginas).
- **Verificação visual (render 110dpi):** todos os campos no lugar (nome/profissão/celular/email/endereço/nº/compl/cidade/UF/CEP, cônjuge completo, corretor, imobiliária), X no Fluxo 30/70 e no "Farei o PIX", data 06/07 na pág. 2, marca d'água/QR/dados PIX preservados. ✅
- **Checks:** tsc 0 · eslint 0 · vitest 757/757 (fill.test 2/2).
- **Files:** `packages/web/package.json` (+pdf-lib); `lib/pastas/termo/{template-yarden.ts, fill.ts, fill.test.ts}`.
- **Nota PJ:** o fill é agnóstico — Nome 1 = razão social; a fonte dos dados do representante e o mapeamento PJ ficam na Etapa 2.

## Change Log
- 2026-07-06 — @qa — **PASS** (verificação visual + 757/757). Merge junto do recurso completo (Etapas 2/3).
- 2026-07-06 — @dev — Motor de preenchimento implementado e verificado.
- 2026-07-06 — @po — GO (10/10).
- 2026-07-06 — @sm — Story criada (Draft).
