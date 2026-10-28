import type { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_DAILY_GOAL,
  getCycle,
  type Activity,
  type ActivityInput,
  type Demand,
  type DemandBlocker,
  type DemandBlockerInput,
  type DemandEvent,
  type DemandEventInput,
  type DemandInput,
  type ISODate,
} from '@acomp/shared';

interface ActivityRow {
  id: number;
  date: string;
  start_minute: number;
  end_minute: number;
  project: string;
  description: string;
  notes: string;
  status: Activity['status'];
  demand_id: number | null;
}

interface DemandRow {
  id: number;
  title: string;
  description: string;
  external_ids: string;
  system: string;
  kind: Demand['kind'];
  priority: Demand['priority'];
  progress_percent: number;
  target_minutes: number | null;
  start_date: string;
  due_date: string | null;
  status: Demand['status'];
  branch: string;
  pr_url: string;
  environment: Demand['environment'];
}

interface EventRow {
  id: number;
  demand_id: number;
  date: string;
  kind: DemandEvent['kind'];
  text: string;
}

interface BlockerRow {
  id: number;
  demand_id: number;
  owner: string;
  description: string;
  since: string;
  resolved_at: string | null;
}

const toActivity = (r: ActivityRow): Activity => ({
  id: r.id,
  date: r.date,
  startMinute: r.start_minute,
  endMinute: r.end_minute,
  project: r.project,
  description: r.description,
  notes: r.notes,
  status: r.status,
  demandId: r.demand_id,
});

const toDemand = (r: DemandRow): Demand => ({
  id: r.id,
  title: r.title,
  description: r.description,
  externalIds: JSON.parse(r.external_ids) as string[],
  system: r.system,
  kind: r.kind,
  priority: r.priority,
  progressPercent: r.progress_percent,
  targetMinutes: r.target_minutes,
  startDate: r.start_date,
  dueDate: r.due_date,
  status: r.status,
  branch: r.branch,
  prUrl: r.pr_url,
  environment: r.environment,
});

/** Parâmetros nomeados de INSERT/UPDATE de demandas (a lista de IDs vai como JSON). */
const demandParams = (d: DemandInput) => ({
  title: d.title,
  description: d.description,
  externalIds: JSON.stringify(d.externalIds),
  system: d.system,
  kind: d.kind,
  priority: d.priority,
  progressPercent: d.progressPercent,
  targetMinutes: d.targetMinutes,
  startDate: d.startDate,
  dueDate: d.dueDate,
  status: d.status,
  branch: d.branch,
  prUrl: d.prUrl,
  environment: d.environment,
});

const toEvent = (r: EventRow): DemandEvent => ({
  id: r.id,
  demandId: r.demand_id,
  date: r.date,
  kind: r.kind,
  text: r.text,
});

const toBlocker = (r: BlockerRow): DemandBlocker => ({
  id: r.id,
  demandId: r.demand_id,
  owner: r.owner,
  description: r.description,
  since: r.since,
  resolvedAt: r.resolved_at,
});

const DEFAULT_GOAL_KEY = 'default_daily_goal_minutes';

export type Repo = ReturnType<typeof createRepo>;

export function createRepo(db: DatabaseSync) {
  const q = {
    byRange: db.prepare(
      'SELECT * FROM activities WHERE date BETWEEN ? AND ? ORDER BY date, start_minute, id',
    ),
    byId: db.prepare('SELECT * FROM activities WHERE id = ?'),
    insert: db.prepare(`
      INSERT INTO activities (date, start_minute, end_minute, project, description, notes, status, demand_id)
      VALUES (:date, :startMinute, :endMinute, :project, :description, :notes, :status, :demandId)`),
    update: db.prepare(`
      UPDATE activities SET date = :date, start_minute = :startMinute, end_minute = :endMinute,
        project = :project, description = :description, notes = :notes, status = :status,
        demand_id = :demandId, updated_at = CURRENT_TIMESTAMP
      WHERE id = :id`),
    remove: db.prepare('DELETE FROM activities WHERE id = ?'),
    overlaps: db.prepare(`
      SELECT * FROM activities
      WHERE date = ? AND start_minute < ? AND end_minute > ? AND id <> ?
      ORDER BY start_minute`),
    distinctDates: db.prepare('SELECT DISTINCT date FROM activities'),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ),
    getCycleGoal: db.prepare('SELECT daily_goal_minutes FROM cycle_goals WHERE cycle_start = ?'),
    setCycleGoal: db.prepare(`
      INSERT INTO cycle_goals (cycle_start, daily_goal_minutes) VALUES (?, ?)
      ON CONFLICT(cycle_start) DO UPDATE SET daily_goal_minutes = excluded.daily_goal_minutes`),
    keepCycleGoal: db.prepare(
      'INSERT OR IGNORE INTO cycle_goals (cycle_start, daily_goal_minutes) VALUES (?, ?)',
    ),
    clearLaterGoals: db.prepare('DELETE FROM cycle_goals WHERE cycle_start > ?'),

    demands: db.prepare('SELECT * FROM demands ORDER BY id'),
    demandById: db.prepare('SELECT * FROM demands WHERE id = ?'),
    insertDemand: db.prepare(`
      INSERT INTO demands (title, description, external_ids, system, kind, priority, progress_percent,
        target_minutes, start_date, due_date, status, branch, pr_url, environment)
      VALUES (:title, :description, :externalIds, :system, :kind, :priority, :progressPercent,
        :targetMinutes, :startDate, :dueDate, :status, :branch, :prUrl, :environment)`),
    updateDemand: db.prepare(`
      UPDATE demands SET title = :title, description = :description, external_ids = :externalIds,
        system = :system, kind = :kind, priority = :priority, progress_percent = :progressPercent,
        target_minutes = :targetMinutes, start_date = :startDate, due_date = :dueDate, status = :status,
        branch = :branch, pr_url = :prUrl, environment = :environment, updated_at = CURRENT_TIMESTAMP
      WHERE id = :id`),
    removeDemand: db.prepare('DELETE FROM demands WHERE id = ?'),
    linkedActivities: db.prepare(
      'SELECT * FROM activities WHERE demand_id IS NOT NULL ORDER BY date, start_minute, id',
    ),
    activitiesOfDemand: db.prepare(
      'SELECT * FROM activities WHERE demand_id = ? ORDER BY date DESC, start_minute DESC, id DESC',
    ),

    events: db.prepare('SELECT * FROM demand_events ORDER BY date DESC, id DESC'),
    eventsOfDemand: db.prepare('SELECT * FROM demand_events WHERE demand_id = ? ORDER BY date DESC, id DESC'),
    eventById: db.prepare('SELECT * FROM demand_events WHERE id = ? AND demand_id = ?'),
    insertEvent: db.prepare(`
      INSERT INTO demand_events (demand_id, date, kind, text) VALUES (:demandId, :date, :kind, :text)`),
    updateEvent: db.prepare(`
      UPDATE demand_events SET date = :date, kind = :kind, text = :text WHERE id = :id AND demand_id = :demandId`),
    removeEvent: db.prepare('DELETE FROM demand_events WHERE id = ? AND demand_id = ?'),

    blockers: db.prepare('SELECT * FROM demand_blockers ORDER BY since DESC, id DESC'),
    blockersOfDemand: db.prepare(
      'SELECT * FROM demand_blockers WHERE demand_id = ? ORDER BY resolved_at IS NOT NULL, since DESC, id DESC',
    ),
    blockerById: db.prepare('SELECT * FROM demand_blockers WHERE id = ? AND demand_id = ?'),
    insertBlocker: db.prepare(`
      INSERT INTO demand_blockers (demand_id, owner, description, since, resolved_at)
      VALUES (:demandId, :owner, :description, :since, :resolvedAt)`),
    updateBlocker: db.prepare(`
      UPDATE demand_blockers SET owner = :owner, description = :description, since = :since,
        resolved_at = :resolvedAt
      WHERE id = :id AND demand_id = :demandId`),
    removeBlocker: db.prepare('DELETE FROM demand_blockers WHERE id = ? AND demand_id = ?'),
  };

  const defaultGoal = (): number => {
    const row = q.getSetting.get(DEFAULT_GOAL_KEY) as { value: string } | undefined;
    return row ? Number(row.value) : DEFAULT_DAILY_GOAL;
  };

  return {
    listActivities(from: ISODate, to: ISODate): Activity[] {
      return (q.byRange.all(from, to) as unknown as ActivityRow[]).map(toActivity);
    },

    getActivity(id: number): Activity | undefined {
      const row = q.byId.get(id) as ActivityRow | undefined;
      return row && toActivity(row);
    },

    createActivity(input: ActivityInput): Activity {
      const { lastInsertRowid } = q.insert.run({ ...input });
      return this.getActivity(Number(lastInsertRowid))!;
    },

    updateActivity(id: number, input: ActivityInput): Activity | undefined {
      const { changes } = q.update.run({ ...input, id });
      return changes ? this.getActivity(id) : undefined;
    },

    deleteActivity(id: number): boolean {
      return q.remove.run(id).changes > 0;
    },

    /** Atividades do mesmo dia cujo horário se sobrepõe ao intervalo informado. */
    findOverlaps(a: Pick<Activity, 'date' | 'startMinute' | 'endMinute'>, ignoreId = 0): Activity[] {
      return (q.overlaps.all(a.date, a.endMinute, a.startMinute, ignoreId) as unknown as ActivityRow[]).map(
        toActivity,
      );
    },

    listDemands(): Demand[] {
      return (q.demands.all() as unknown as DemandRow[]).map(toDemand);
    },

    getDemand(id: number): Demand | undefined {
      const row = q.demandById.get(id) as DemandRow | undefined;
      return row && toDemand(row);
    },

    createDemand(input: DemandInput): Demand {
      const { lastInsertRowid } = q.insertDemand.run(demandParams(input));
      return this.getDemand(Number(lastInsertRowid))!;
    },

    updateDemand(id: number, input: DemandInput): Demand | undefined {
      const { changes } = q.updateDemand.run({ ...demandParams(input), id });
      return changes ? this.getDemand(id) : undefined;
    },

    /**
     * Remove a demanda; as atividades vinculadas permanecem, sem vínculo (ON DELETE SET NULL),
     * e a linha do tempo e os impedimentos vão junto (ON DELETE CASCADE).
     */
    deleteDemand(id: number): boolean {
      return q.removeDemand.run(id).changes > 0;
    },

    /** Todas as atividades vinculadas a alguma demanda (para calcular as horas de cada uma). */
    listLinkedActivities(): Activity[] {
      return (q.linkedActivities.all() as unknown as ActivityRow[]).map(toActivity);
    },

    /** Atividades de uma demanda, das mais recentes para as mais antigas. */
    listDemandActivities(id: number): Activity[] {
      return (q.activitiesOfDemand.all(id) as unknown as ActivityRow[]).map(toActivity);
    },

    /** Eventos de todas as demandas (para resumir a linha do tempo de cada uma). */
    listAllEvents(): DemandEvent[] {
      return (q.events.all() as unknown as EventRow[]).map(toEvent);
    },

    /** Linha do tempo de uma demanda, da mais recente para a mais antiga. */
    listDemandEvents(demandId: number): DemandEvent[] {
      return (q.eventsOfDemand.all(demandId) as unknown as EventRow[]).map(toEvent);
    },

    getEvent(demandId: number, id: number): DemandEvent | undefined {
      const row = q.eventById.get(id, demandId) as EventRow | undefined;
      return row && toEvent(row);
    },

    createEvent(demandId: number, input: DemandEventInput): DemandEvent {
      const { lastInsertRowid } = q.insertEvent.run({ demandId, date: input.date, kind: input.kind, text: input.text });
      return this.getEvent(demandId, Number(lastInsertRowid))!;
    },

    updateEvent(demandId: number, id: number, input: DemandEventInput): DemandEvent | undefined {
      const { changes } = q.updateEvent.run({ id, demandId, date: input.date, kind: input.kind, text: input.text });
      return changes ? this.getEvent(demandId, id) : undefined;
    },

    deleteEvent(demandId: number, id: number): boolean {
      return q.removeEvent.run(id, demandId).changes > 0;
    },

    /** Impedimentos de todas as demandas (para contar os abertos e os dias de espera). */
    listAllBlockers(): DemandBlocker[] {
      return (q.blockers.all() as unknown as BlockerRow[]).map(toBlocker);
    },

    /** Impedimentos de uma demanda: abertos primeiro, depois os resolvidos. */
    listDemandBlockers(demandId: number): DemandBlocker[] {
      return (q.blockersOfDemand.all(demandId) as unknown as BlockerRow[]).map(toBlocker);
    },

    getBlocker(demandId: number, id: number): DemandBlocker | undefined {
      const row = q.blockerById.get(id, demandId) as BlockerRow | undefined;
      return row && toBlocker(row);
    },

    createBlocker(demandId: number, input: DemandBlockerInput): DemandBlocker {
      const { lastInsertRowid } = q.insertBlocker.run({ demandId, ...input });
      return this.getBlocker(demandId, Number(lastInsertRowid))!;
    },

    updateBlocker(demandId: number, id: number, input: DemandBlockerInput): DemandBlocker | undefined {
      const { changes } = q.updateBlocker.run({ id, demandId, ...input });
      return changes ? this.getBlocker(demandId, id) : undefined;
    },

    deleteBlocker(demandId: number, id: number): boolean {
      return q.removeBlocker.run(id, demandId).changes > 0;
    },

    defaultGoal,

    goalForCycle(cycleStart: ISODate): number {
      const row = q.getCycleGoal.get(cycleStart) as { daily_goal_minutes: number } | undefined;
      return row ? row.daily_goal_minutes : defaultGoal();
    },

    /**
     * Define a meta de um ciclo. Com `makeDefault` (ciclo atual ou futuro), ela passa a
     * valer também para os próximos ciclos; os anteriores que ainda seguiam o padrão
     * antigo têm a meta congelada antes da troca.
     */
    setCycleGoal(cycleStart: ISODate, minutes: number, makeDefault: boolean): void {
      db.exec('BEGIN');
      try {
        if (makeDefault) {
          const previous = defaultGoal();
          const rows = q.distinctDates.all() as { date: string }[];
          const pastCycles = new Set(rows.map((r) => getCycle(r.date).start).filter((s) => s < cycleStart));
          for (const start of pastCycles) q.keepCycleGoal.run(start, previous);
          q.clearLaterGoals.run(cycleStart);
          q.setSetting.run(DEFAULT_GOAL_KEY, String(minutes));
        }
        q.setCycleGoal.run(cycleStart, minutes);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
