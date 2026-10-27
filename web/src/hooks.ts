import { useSearchParams } from 'react-router';
import { isValidISODate, todayISO, type ISODate } from '@acomp/shared';

/** Data de referência da tela, guardada na URL (?data=AAAA-MM-DD) para sobreviver a recarregamentos. */
export function useRefDate(): [ISODate, (date: ISODate) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get('data');
  const date = raw && isValidISODate(raw) ? raw : todayISO();
  const setDate = (next: ISODate) =>
    setParams(next === todayISO() ? {} : { data: next }, { replace: true });
  return [date, setDate];
}

/** Monta links entre telas preservando a data de referência. */
export const withDate = (path: string, date: ISODate) =>
  date === todayISO() ? path : `${path}?data=${date}`;
