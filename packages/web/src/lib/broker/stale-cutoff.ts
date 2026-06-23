/**
 * Corte (epoch ms) para o filtro "Sem contato" / "parado N dias".
 *
 * Encapsula a leitura do relógio FORA do corpo do Server Component. Um Server
 * Component renderiza fresh a cada request, então o valor é determinístico por
 * request — mas chamar `Date.now()` diretamente no corpo do componente dispara a
 * regra de lint `react-hooks/purity`. Isolando aqui (função comum, não componente
 * nem hook), o componente apenas chama `staleCutoffMs()` e fica lint-clean.
 *
 * @param days dias de inatividade (3, 7, 30...). <= 0 ou inválido → 0 (sem corte).
 * @returns epoch ms do limite; conversas com `last_message_at` mais antigo que isso
 *          são consideradas "sem contato". 0 quando não há filtro.
 */
export function staleCutoffMs(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 0
  return Date.now() - days * 86400000
}
