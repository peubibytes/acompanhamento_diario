import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  DEMAND_CATEGORY_PLURAL,
  formatDayMonth,
  highlightRanges,
  isOpenDemand,
  searchDemands,
  statusLabel,
  type DemandCategory,
  type DemandSummary,
} from '@acomp/shared';
import { categoryIcon, CycleStatusBadge, DeadlineBadge, TaskStatusBadge } from './DemandVisuals';
import { ChevronDown, SearchIcon, XIcon } from './icons';

interface Props {
  demands: DemandSummary[];
  value: number | null;
  onChange: (id: number) => void;
}

/** Texto com os trechos da busca em negrito. */
function Highlighted({ text, query }: { text: string; query: string }) {
  const ranges = highlightRanges(text, query);
  if (!ranges.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(
      <strong key={i} className="font-semibold text-ink">
        {text.slice(start, end)}
      </strong>,
    );
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

function StatusBadge({ demand: d }: { demand: DemandSummary }) {
  if (d.category === 'reuniao') return null;
  return d.category === 'ciclo' ? <CycleStatusBadge status={d.status} /> : <TaskStatusBadge status={d.status} />;
}

/**
 * Seletor de demanda com busca (v0.15, docs/decisions/0014): padrão ARIA combobox com listbox. Fechado, é um botão;
 * aberto, um painel com busca, filtro de categoria, recentes e grupos. Esc fecha só o seletor (não o painel do formulário).
 */
export function DemandPicker({ demands, value, onChange }: Props) {
  const labelId = useId();
  const listId = useId();
  const optionId = (id: number) => `${listId}-opt-${id}`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<DemandCategory | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [active, setActive] = useState(0);

  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const result = useMemo(
    () => searchDemands(demands, query, { category, includeClosed: showClosed }),
    [demands, query, category, showClosed],
  );
  const options = useMemo(() => [...result.recent, ...result.groups.flatMap((g) => g.items)], [result]);
  const chosen = demands.find((d) => d.id === value);
  const activeId = options[active] ? optionId(options[active].id) : undefined;

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const choose = (d: DemandSummary) => {
    onChange(d.id);
    close(true);
  };

  // Abre limpo e com o foco na busca.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCategory(null);
    setShowClosed(false);
    setActive(0);
    input.current?.focus();
  }, [open]);

  useEffect(() => setActive(0), [query, category, showClosed]);

  // Clique fora fecha.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // A opção ativa sempre à vista.
  useEffect(() => {
    if (!open || !activeId) return;
    // Rola só a lista: scrollIntoView também rolaria o painel (overflow oculto) e esconderia a busca.
    const el = document.getElementById(activeId);
    const list = el?.closest('[role=listbox]') as HTMLElement | null;
    if (!el || !list) return;
    if (active === 0) return void (list.scrollTop = 0);
    const l = list.getBoundingClientRect();
    const o = el.getBoundingClientRect();
    if (o.top < l.top) list.scrollTop -= l.top - o.top;
    else if (o.bottom > l.bottom) list.scrollTop += o.bottom - l.bottom;
  }, [open, activeId, active]);

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (last >= 0) setActive((i) => (i >= last ? 0 : i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (last >= 0) setActive((i) => (i <= 0 ? last : i - 1));
        break;
      case 'Home':
        if (e.ctrlKey) setActive(0);
        break;
      case 'End':
        if (e.ctrlKey) setActive(Math.max(last, 0));
        break;
      case 'Enter':
        e.preventDefault(); // não envia o formulário
        if (options[active]) choose(options[active]);
        break;
      case 'Escape':
        // O painel do formulário também ouve o Esc: aqui ele só fecha o seletor.
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
    }
  };

  const option = (d: DemandSummary) => {
    const index = options.indexOf(d);
    const selected = d.id === value;
    const isActive = index === active;
    const m = d.metrics;
    return (
      <div
        key={d.id}
        id={optionId(d.id)}
        role="option"
        aria-selected={selected}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => index !== active && setActive(index)}
        onClick={() => choose(d)}
        className={`cursor-pointer rounded-control px-2.5 py-2 ${isActive ? 'bg-accent-soft' : ''} ${selected ? 'ring-1 ring-accent' : ''}`}
      >
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-accent">{categoryIcon[d.category](15)}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            <Highlighted text={d.label} query={query} />
          </span>
          {!isOpenDemand(d) && (
            <span className="shrink-0 rounded-full bg-neutral-soft px-2 py-0.5 text-2xs font-medium text-ink-2">Encerrada</span>
          )}
          <StatusBadge demand={d} />
        </div>
        <div className="mt-0.5 flex items-center gap-2 pl-[23px] text-xs text-ink-3">
          <span className="min-w-0 flex-1 truncate">
            {d.subtitle ? <Highlighted text={d.subtitle} query={query} /> : <span className="sr-only">Sem descrição</span>}
          </span>
          {d.category === 'ciclo' && isOpenDemand(d) && ['proxima', 'vence_hoje', 'atrasada'].includes(m.deadline) && (
            <DeadlineBadge status={m.deadline} />
          )}
          <span className="tabular shrink-0">
            {m.lastActivityDate ? `última vez: ${formatDayMonth(m.lastActivityDate)}` : 'nunca apontada'}
          </span>
        </div>
      </div>
    );
  };

  const group = (title: string, items: DemandSummary[], key: string) => {
    const titleId = `${listId}-g-${key}`;
    return (
      <div key={key} role="group" aria-labelledby={titleId} className="mb-1">
        <div id={titleId} className="px-2.5 pt-2 pb-1 text-2xs font-semibold tracking-wider text-ink-3 uppercase">
          {title}
        </div>
        {items.map(option)}
      </div>
    );
  };

  const categories = (Object.entries(result.counts) as [DemandCategory, number][]).filter(([, n]) => n > 0);
  const total = categories.reduce((sum, [, n]) => sum + n, 0);
  const empty = options.length === 0;

  return (
    <div ref={root} className="relative">
      <span id={labelId} className="mb-1.5 block text-xs font-semibold text-ink-2">
        Demanda
      </span>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelId}
        aria-describedby={`${labelId}-value`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="field flex items-center gap-2 text-left"
      >
        <span id={`${labelId}-value`} className="flex min-w-0 flex-1 items-center gap-2">
          {chosen ? (
            <>
              <span className="shrink-0 text-accent">{categoryIcon[chosen.category](15)}</span>
              <span className="truncate font-medium text-ink">{chosen.label}</span>
              {chosen.category !== 'reuniao' && (
                <span className="shrink-0 text-xs text-ink-3">{statusLabel(chosen.status)}</span>
              )}
            </>
          ) : (
            <span className="text-ink-3">Escolha o que foi feito…</span>
          )}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-ink-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="z-30 flex flex-col overflow-hidden rounded-card border border-line bg-surface shadow-lg max-sm:fixed max-sm:inset-0 max-sm:rounded-none sm:absolute sm:inset-x-0 sm:top-full sm:mt-1.5 sm:max-h-[26rem]"
          role="presentation"
        >
          <div className="space-y-2 border-b border-line p-2.5">
            <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <SearchIcon size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input
                ref={input}
                type="search"
                role="combobox"
                aria-label="Buscar demanda"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-autocomplete="list"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Buscar por nome, número ou descrição"
                className="field"
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => close(true)}
              aria-label="Fechar lista"
              className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-surface-2 sm:hidden"
            >
              <XIcon size={18} />
            </button>
            </div>
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por tipo">
                {[[null, 'Todas', total] as const, ...categories.map(([c, n]) => [c, DEMAND_CATEGORY_PLURAL[c], n] as const)].map(
                  ([c, label, n]) => (
                    <button
                      key={c ?? 'todas'}
                      type="button"
                      aria-pressed={category === c}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setCategory(c)}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        category === c ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2'
                      }`}
                    >
                      {label} ({n})
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          <div id={listId} role="listbox" aria-label="Demandas" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {result.recent.length > 0 && group('Recentes', result.recent, 'recentes')}
            {result.groups.map((g) =>
              group(`${DEMAND_CATEGORY_PLURAL[g.category]} · ${g.items.length}`, g.items, g.category),
            )}
            {empty && (
              <p className="px-3 py-6 text-center text-sm text-ink-2" role="presentation">
                {query.trim() ? <>Nada encontrado para “{query.trim()}”</> : 'Nenhuma demanda aberta'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs">
            {result.hiddenClosed > 0 ? (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowClosed(true)}
                className="font-medium text-ink-2 hover:text-ink hover:underline"
              >
                Mostrar {result.hiddenClosed} {result.hiddenClosed === 1 ? 'encerrada' : 'encerradas'}
              </button>
            ) : (
              <span />
            )}
            <Link to="/demandas" className="font-semibold text-accent hover:underline">
              Declarar nova demanda
            </Link>
          </div>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {open ? `${options.length} ${options.length === 1 ? 'demanda' : 'demandas'}` : ''}
      </span>
    </div>
  );
}
