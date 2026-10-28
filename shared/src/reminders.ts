// Lembretes (notificações do sino) e agenda: reúnem o que antes ficava espalhado
// pelo painel em alertas, para que o usuário veja só quando quiser.

import { addDays, formatDayMonth, getCycle, WEEKDAY_SHORT, weekdayOf, type ISODate } from './cycle.ts';
import { DEADLINE_LABEL, formatDemandHours, isOpenDemand, type DeadlineStatus, type DemandSummary } from './demands.ts';
import type { CycleSummary } from './metrics.ts';
import { formatDuration } from './time.ts';

export type Severity = 'critical' | 'warning' | 'info';

/** Para onde o lembrete leva; a interface traduz em rota. */
export type ReminderTarget =
  | { screen: 'atividades'; date: ISODate }
  | { screen: 'demandas'; demandId: number }
  | { screen: 'painel' };

export interface AppNotification {
  id: string;
  severity: Severity;
  kind: 'dia_irregular' | 'prazo_demanda' | 'apontamento';
  title: string;
  detail: string;
  date: ISODate;
  target: ReminderTarget;
}

export interface AgendaItem {
  id: string;
  date: ISODate;
  kind: 'prazo_demanda' | 'inicio_demanda' | 'apontamento';
  title: string;
  detail: string;
  /** Situação do prazo, para itens de demanda. */
  deadline?: DeadlineStatus;
  target: ReminderTarget;
}

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const dayLabel = (iso: ISODate) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

/**
 * Notificações do momento, das mais graves para as informativas:
 * dias irregulares do ciclo atual, prazos de demandas e o dia de apontamento.
 * `current` deve ser o resumo do ciclo que contém `today`.
 */
export function buildNotifications(current: CycleSummary, demands: DemandSummary[], today: ISODate): AppNotification[] {
  const items: AppNotification[] = [];

  for (const d of current.days.filter((day) => day.exceeded)) {
    items.push({
      id: `dia:${d.date}`,
      severity: 'critical',
      kind: 'dia_irregular',
      title: `Apontamento irregular em ${dayLabel(d.date)}`,
      detail: `${d.diagnosis}.`,
      date: d.date,
      target: { screen: 'atividades', date: d.date },
    });
  }

  for (const d of demands.filter((x) => isOpenDemand(x) && x.metrics.reminder)) {
    items.push({
      id: `demanda:${d.id}`,
      severity: d.metrics.deadline === 'atrasada' || d.metrics.atRisk ? 'critical' : 'warning',
      kind: 'prazo_demanda',
      title: d.title,
      detail: d.metrics.reminder!,
      date: d.dueDate ?? today,
      target: { screen: 'demandas', demandId: d.id },
    });
  }

  if (today >= current.start && today <= current.end) {
    const { week } = current;
    const missing = Math.max(0, week.goal - week.total);
    const ready = week.conformDays === current.days.length;
    const status = ready
      ? 'Semana 100% preenchida, tudo pronto para apontar.'
      : `Semana ${week.fillPercent}% preenchida${missing ? `, faltam ${formatDuration(missing)}` : ''}.`;
    const isThursday = today === current.end;
    items.push({
      id: `apontamento:${current.end}`,
      severity: isThursday && !ready ? 'warning' : 'info',
      kind: 'apontamento',
      title: isThursday ? 'Hoje é dia de apontamento' : `Apontamento na quinta, ${formatDayMonth(current.end)}`,
      detail: status,
      date: current.end,
      target: { screen: 'painel' },
    });
  }

  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.date.localeCompare(b.date));
}

/** Notificações que pedem ação (entram na contagem do sino); as informativas não contam. */
export const attentionCount = (items: AppNotification[]) => items.filter((n) => n.severity !== 'info').length;

/**
 * Agenda em ordem de data: prazos e inícios das demandas ativas e os dois próximos
 * dias de apontamento (quinta do ciclo atual e do seguinte).
 */
export function buildAgenda(demands: DemandSummary[], today: ISODate): AgendaItem[] {
  const items: AgendaItem[] = [];

  const thisCycle = getCycle(today);
  for (const cycle of [thisCycle, getCycle(addDays(thisCycle.start, 7))]) {
    items.push({
      id: `apontamento:${cycle.end}`,
      date: cycle.end,
      kind: 'apontamento',
      title: 'Dia de apontamento',
      detail: `Fechamento do ciclo ${dayLabel(cycle.start)} → ${dayLabel(cycle.end)}`,
      target: { screen: 'painel' },
    });
  }

  for (const d of demands.filter(isOpenDemand)) {
    if (d.dueDate) {
      items.push({
        id: `prazo:${d.id}`,
        date: d.dueDate,
        kind: 'prazo_demanda',
        title: d.title,
        detail: `Prazo da demanda · ${formatDemandHours(d.metrics)} · ${DEADLINE_LABEL[d.metrics.deadline]}`,
        deadline: d.metrics.deadline,
        target: { screen: 'demandas', demandId: d.id },
      });
    }
    if (d.startDate > today) {
      items.push({
        id: `inicio:${d.id}`,
        date: d.startDate,
        kind: 'inicio_demanda',
        title: d.title,
        detail: `Início da demanda · ${d.metrics.target === null ? 'sem meta de horas' : `meta de ${formatDuration(d.metrics.target)}`}`,
        target: { screen: 'demandas', demandId: d.id },
      });
    }
  }

  const KIND_ORDER = { prazo_demanda: 0, apontamento: 1, inicio_demanda: 2 };
  return items.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, 'pt-BR'));
}
