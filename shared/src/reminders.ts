// Lembretes (notificações do sino) e agenda: reúnem o que antes ficava espalhado
// pelo painel em alertas, para que o usuário veja só quando quiser.

import { addDays, daysBetween, formatDayMonth, getCycle, todayISO, WEEKDAY_SHORT, weekdayOf, type ISODate } from './cycle.ts';
import { DEADLINE_LABEL, isOpenDemand, type CycleDemand, type DeadlineStatus, type DemandSummary } from './demands.ts';
import type { CycleSummary } from './metrics.ts';
import { formatDuration } from './time.ts';

export type Severity = 'critical' | 'warning' | 'info';

/** Para onde o lembrete leva; a interface traduz em rota. */
export type ReminderTarget =
  | { screen: 'apontamentos'; date: ISODate }
  | { screen: 'demandas'; demandId: number }
  | { screen: 'painel' }
  | { screen: 'dados' };

export interface AppNotification {
  id: string;
  severity: Severity;
  kind: 'dia_irregular' | 'prazo_demanda' | 'apontamento' | 'pasta_sincronizada' | 'exportacao';
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

/** Serviço que sincroniza a pasta do banco. */
export type SyncedFolder = 'OneDrive' | 'Dropbox' | 'Google Drive' | 'iCloud Drive';

/** Onde estão os dados e quando foram exportados (`GET /api/storage`). */
export interface StorageStatus {
  /** A pasta do banco (ou dos backups) é sincronizada por este serviço; nulo se não é. */
  syncedFolder: SyncedFolder | null;
  /** Há demandas ou apontamentos (sem eles, não há o que exportar). */
  hasData: boolean;
  /** Momento (ISO) da última exportação; nulo se nunca houve. */
  lastExportAt: string | null;
}

/** A partir de quantos dias sem exportar o lembrete aparece (informativo) e passa a pedir atenção. */
export const EXPORT_REMINDER_DAYS = 7;
export const EXPORT_WARNING_DAYS = 14;

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const dayLabel = (iso: ISODate) => `${WEEKDAY_SHORT[weekdayOf(iso)]} ${formatDayMonth(iso)}`;

type CycleSummaryItem = DemandSummary & CycleDemand;

/** Só os ciclos têm prazo; as tarefas (chamados, reuniões, treinamentos) não entram aqui. */
const openCycles = (demands: DemandSummary[]) =>
  demands.filter((d): d is CycleSummaryItem => d.category === 'ciclo' && isOpenDemand(d));

/**
 * Notificações do momento, das mais graves para as informativas:
 * dias irregulares do ciclo atual, prazos dos ciclos (demandas), o dia de apontamento e, com `storage`,
 * os cuidados com os dados (pasta sincronizada e exportação periódica).
 * `current` deve ser o resumo do ciclo que contém `today`.
 */
export function buildNotifications(
  current: CycleSummary,
  demands: DemandSummary[],
  today: ISODate,
  storage?: StorageStatus,
): AppNotification[] {
  const items: AppNotification[] = storage ? dataNotifications(storage, today) : [];

  for (const d of current.days.filter((day) => day.exceeded)) {
    items.push({
      id: `dia:${d.date}`,
      severity: 'critical',
      kind: 'dia_irregular',
      title: `Apontamento irregular em ${dayLabel(d.date)}`,
      detail: `${d.diagnosis}.`,
      date: d.date,
      target: { screen: 'apontamentos', date: d.date },
    });
  }

  for (const d of openCycles(demands).filter((x) => x.metrics.reminder)) {
    items.push({
      id: `demanda:${d.id}`,
      severity: d.metrics.deadline === 'atrasada' ? 'critical' : 'warning',
      kind: 'prazo_demanda',
      title: d.label,
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

/**
 * Cuidados com os dados, que ficam só nesta máquina: a pasta sincronizada (o OneDrive e afins podem
 * corromper o banco) e a exportação periódica (os backups ficam no mesmo disco do banco).
 */
export function dataNotifications(storage: StorageStatus, today: ISODate): AppNotification[] {
  const items: AppNotification[] = [];

  if (storage.syncedFolder) {
    items.push({
      id: 'dados:pasta',
      severity: 'warning',
      kind: 'pasta_sincronizada',
      title: `Seus dados estão numa pasta do ${storage.syncedFolder}`,
      detail: `A sincronização pode corromper o banco, que é gravado em mais de um arquivo ao mesmo tempo. Exporte os dados, feche o aplicativo e mova a pasta dele (com o banco) para fora do ${storage.syncedFolder}.`,
      date: today,
      target: { screen: 'dados' },
    });
  }

  if (storage.hasData) {
    const last = storage.lastExportAt ? todayISO(new Date(storage.lastExportAt)) : null;
    const days = last ? daysBetween(last, today) : null;
    if (days === null || days >= EXPORT_REMINDER_DAYS) {
      items.push({
        id: 'dados:exportacao',
        severity: days === null || days >= EXPORT_WARNING_DAYS ? 'warning' : 'info',
        kind: 'exportacao',
        title: 'Exporte seus dados',
        detail:
          last === null
            ? 'Você ainda não exportou. Os backups ficam no mesmo disco do banco: guarde uma cópia em outro lugar.'
            : `A última exportação foi há ${days} dias (${formatDayMonth(last)}). Guarde uma cópia nova fora desta máquina.`,
        date: today,
        target: { screen: 'dados' },
      });
    }
  }

  return items;
}

/** Notificações que pedem ação (entram na contagem do sino); as informativas não contam. */
export const attentionCount = (items: AppNotification[]) => items.filter((n) => n.severity !== 'info').length;

/**
 * Agenda em ordem de data: prazos e inícios dos ciclos abertos e os dois próximos
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
      detail: `Fechamento do período ${dayLabel(cycle.start)} → ${dayLabel(cycle.end)}`,
      target: { screen: 'painel' },
    });
  }

  for (const d of openCycles(demands)) {
    if (d.dueDate) {
      items.push({
        id: `prazo:${d.id}`,
        date: d.dueDate,
        kind: 'prazo_demanda',
        title: d.label,
        detail: `Prazo do ciclo · ${formatDuration(d.metrics.logged)} apontadas · ${DEADLINE_LABEL[d.metrics.deadline]}`,
        deadline: d.metrics.deadline,
        target: { screen: 'demandas', demandId: d.id },
      });
    }
    if (d.startDate > today) {
      items.push({
        id: `inicio:${d.id}`,
        date: d.startDate,
        kind: 'inicio_demanda',
        title: d.label,
        detail: 'Início do ciclo',
        target: { screen: 'demandas', demandId: d.id },
      });
    }
  }

  const KIND_ORDER = { prazo_demanda: 0, apontamento: 1, inicio_demanda: 2 };
  return items.sort((a, b) => a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, 'pt-BR'));
}
