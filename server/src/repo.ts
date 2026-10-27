import type { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_DAILY_GOAL,
  getCycle,
  type Activity,
  type ActivityInput,
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
      INSERT INTO activities (date, start_minute, end_minute, project, description, notes, status)
      VALUES (:date, :startMinute, :endMinute, :project, :description, :notes, :status)`),
    update: db.prepare(`
      UPDATE activities SET date = :date, start_minute = :startMinute, end_minute = :endMinute,
        project = :project, description = :description, notes = :notes, status = :status,
        updated_at = CURRENT_TIMESTAMP
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
