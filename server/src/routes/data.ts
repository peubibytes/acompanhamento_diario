// Seus dados: exportar, importar e o estado dos backups.

import type { Express } from 'express';
import type { RouteContext } from '../http.ts';
import { ImportError } from '../transfer.ts';

export function registerDataRoutes(app: Express, { repo, today, backups }: RouteContext) {
  /** Todos os dados em JSON (arquivo para baixar), com a versão do esquema. */
  app.get('/api/export', (_req, res) => {
    const file = repo.exportData();
    res.setHeader('Content-Disposition', `attachment; filename="acompanhamento-${today()}.json"`);
    res.json(file);
  });

  /**
   * Importa uma exportação. Só em banco vazio; com `?replace=true`, substitui o que existe depois de
   * guardar um backup (`pre-importacao-…`). Qualquer erro desfaz tudo: o banco fica como estava.
   */
  app.post('/api/import', (req, res) => {
    const replace = req.query.replace === 'true';
    try {
      if (replace && backups && !repo.isEmpty()) backups.createExtra('pre-importacao');
      res.json(repo.importData(req.body, replace));
    } catch (err) {
      if (err instanceof ImportError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  });

  /** O último backup diário, para a tela mostrar. */
  app.get('/api/backups', (_req, res) => {
    res.json(backups?.status() ?? { last: null, count: 0, keep: 0 });
  });
}
