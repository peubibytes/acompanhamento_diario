// A API real (Express + SQLite em memória) numa porta livre do loopback. O `fetch` da tela usa
// caminhos relativos (/api/...); aqui eles são apontados para esse servidor.

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { ISODate } from '@acomp/shared';
import { vi } from 'vitest';
import { createApp } from '../../server/src/app.ts';
import { openDb } from '../../server/src/db.ts';
import { createRepo } from '../../server/src/repo.ts';

export interface TestApi {
  /** Chamada direta à API, para preparar dados sem passar pela tela. */
  call: <T = unknown>(method: string, path: string, body?: unknown) => Promise<T>;
  close: () => Promise<void>;
}

export async function startApi(today: ISODate): Promise<TestApi> {
  const repo = createRepo(openDb(':memory:'));
  const server: Server = createApp({ repo, today: () => today }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
    realFetch(typeof input === 'string' && input.startsWith('/') ? `${base}${input}` : input, init),
  );

  const call = async <T,>(method: string, path: string, body?: unknown): Promise<T> => {
    const res = await realFetch(`${base}/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return (res.status === 204 ? undefined : await res.json()) as T;
  };

  return {
    call,
    close: async () => {
      vi.unstubAllGlobals();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
