// Busca, filtro e ordem das demandas no seletor do apontamento (v0.15, docs/decisions/0014). Funções puras:
// o componente só mostra o resultado.

import { DEMAND_CATEGORIES, isOpenDemand, type DemandCategory, type DemandSummary } from './demands.ts';

/** As demandas abertas apontadas mais recentemente que abrem a lista, sem busca digitada. */
export const MAX_RECENT = 5;

/** Minúsculas e sem acentos: "Ação" e "acao" são o mesmo texto. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const termsOf = (query: string) => normalizeSearch(query).split(/\s+/).filter(Boolean);

/** Tudo o que a busca enxerga numa demanda: nome, número, descrição e, nas reuniões, tipo, assunto e pessoas. */
function haystack(d: DemandSummary): string {
  const parts = [d.label, d.subtitle];
  if (d.category === 'reuniao') parts.push(d.meetingType, d.subject, d.participants);
  else parts.push(d.description);
  if (d.category === 'chamado') parts.push(d.ticketNumber);
  if (d.category === 'ciclo' || d.category === 'treinamento' || d.category === 'atividade') parts.push(d.title);
  return normalizeSearch(parts.join(' \n '));
}

export interface SearchOptions {
  /** Só esta categoria; nulo = todas. */
  category?: DemandCategory | null;
  /** Mostra também as encerradas. Com busca, elas entram sozinhas se só houver resultado entre elas. */
  includeClosed?: boolean;
  recentLimit?: number;
}

export interface DemandGroup {
  category: DemandCategory;
  items: DemandSummary[];
}

export interface DemandSearchResult {
  /** As abertas apontadas mais recentemente; só sem busca e sem filtro de categoria. Não se repetem nos grupos. */
  recent: DemandSummary[];
  groups: DemandGroup[];
  /** Quantas há em cada categoria (já com a busca e o critério de encerradas, sem o filtro de categoria). */
  counts: Record<DemandCategory, number>;
  /** Encerradas que ficaram de fora (e que o botão "Mostrar N encerradas" traz de volta). */
  hiddenClosed: number;
  /** As encerradas estão na lista (a pedido ou por serem o único resultado). */
  showingClosed: boolean;
}

/** Última apontada primeiro; as nunca apontadas, da declarada mais nova para a mais antiga. */
const byRecency = (a: DemandSummary, b: DemandSummary) =>
  (b.metrics.lastActivityDate ?? '').localeCompare(a.metrics.lastActivityDate ?? '') || b.id - a.id;

export function searchDemands(
  demands: DemandSummary[],
  query: string,
  { category = null, includeClosed = false, recentLimit = MAX_RECENT }: SearchOptions = {},
): DemandSearchResult {
  const terms = termsOf(query);
  const matches = demands.filter((d) => {
    if (!terms.length) return true;
    const text = haystack(d);
    return terms.every((t) => text.includes(t));
  });
  const open = matches.filter(isOpenDemand);
  const closed = matches.filter((d) => !isOpenDemand(d));
  // Com busca e nenhum resultado aberto, as encerradas aparecem direto.
  const showingClosed = includeClosed || (terms.length > 0 && open.length === 0 && closed.length > 0);
  const visible = showingClosed ? matches : open;

  const counts = Object.fromEntries(DEMAND_CATEGORIES.map((c) => [c, 0])) as Record<DemandCategory, number>;
  for (const d of visible) counts[d.category]++;

  const inCategory = (d: DemandSummary) => !category || d.category === category;
  const shown = visible.filter(inCategory);

  const recent =
    terms.length || category
      ? []
      : open
          .filter((d) => d.metrics.lastActivityDate)
          .sort((a, b) => byRecency(a, b) || b.metrics.activityCount - a.metrics.activityCount)
          .slice(0, recentLimit);
  const recentIds = new Set(recent.map((d) => d.id));

  // Relevância (só com busca): começa com o termo < contém no nome < contém só na descrição.
  const rank = (d: DemandSummary) => {
    const label = normalizeSearch(d.label);
    if (label.startsWith(terms[0])) return 0;
    return terms.every((t) => label.includes(t)) ? 1 : 2;
  };
  const order = terms.length ? (a: DemandSummary, b: DemandSummary) => rank(a) - rank(b) || byRecency(a, b) : byRecency;

  const groups: DemandGroup[] = DEMAND_CATEGORIES.map((c) => ({
    category: c,
    items: shown.filter((d) => d.category === c && !recentIds.has(d.id)).sort(order),
  })).filter((g) => g.items.length > 0);

  return { recent, groups, counts, hiddenClosed: showingClosed ? 0 : closed.filter(inCategory).length, showingClosed };
}

/**
 * Trechos do texto que casam com algum termo da busca, para pôr em negrito: `[início, fim)` no texto original,
 * sem diferenciar maiúsculas nem acentos. Trechos que se tocam são unidos.
 */
export function highlightRanges(text: string, query: string): [number, number][] {
  const terms = termsOf(query);
  if (!terms.length) return [];
  let norm = '';
  const origin: number[] = []; // índice no texto original de cada caractere do normalizado
  [...text].reduce((i, ch) => {
    for (const n of normalizeSearch(ch)) {
      norm += n;
      origin.push(i);
    }
    return i + ch.length;
  }, 0);

  const raw: [number, number][] = [];
  for (const t of terms) {
    for (let at = norm.indexOf(t); at !== -1; at = norm.indexOf(t, at + t.length)) {
      const last = origin[at + t.length - 1];
      raw.push([origin[at], last + 1]);
    }
  }
  raw.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const r of raw) {
    const prev = merged.at(-1);
    if (prev && r[0] <= prev[1]) prev[1] = Math.max(prev[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
