import { useSearchParams } from 'react-router';
import { isValidISODate, todayISO, type ISODate, type PeriodScale } from '@acomp/shared';

/** A escala do período fica na URL como ?escala=mes; sem ela, vale a semana. */
const SCALE_PARAM = 'escala';
const MONTH_VALUE = 'mes';

/** Data de referência da tela, guardada na URL (?data=AAAA-MM-DD) para sobreviver a recarregamentos. */
export function useRefDate(): [ISODate, (date: ISODate) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('data');
  const date = raw && isValidISODate(raw) ? raw : todayISO();
  const setDate = (next: ISODate) => {
    // Só a data muda: a escala escolhida continua na URL.
    const query: Record<string, string> = {};
    if (next !== todayISO()) query.data = next;
    if (params.get(SCALE_PARAM) === MONTH_VALUE) query[SCALE_PARAM] = MONTH_VALUE;
    setParams(query, { replace: true });
  };
  return [date, setDate];
}

/** Escala do período (?escala=mes): semana (sexta → quinta) ou mês civil. */
export function usePeriodScale(): [PeriodScale, (scale: PeriodScale) => void] {
  const [params, setParams] = useSearchParams();
  const scale: PeriodScale = params.get(SCALE_PARAM) === MONTH_VALUE ? 'month' : 'week';
  const setScale = (next: PeriodScale) => {
    const updated = new URLSearchParams(params);
    if (next === 'month') updated.set(SCALE_PARAM, MONTH_VALUE);
    else updated.delete(SCALE_PARAM);
    setParams(updated, { replace: true });
  };
  return [scale, setScale];
}

/** Monta links entre telas preservando a data de referência e a escala do período. */
export function withDate(path: string, date: ISODate, scale: PeriodScale = 'week') {
  const query = new URLSearchParams();
  if (date !== todayISO()) query.set('data', date);
  if (scale === 'month') query.set(SCALE_PARAM, MONTH_VALUE);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
