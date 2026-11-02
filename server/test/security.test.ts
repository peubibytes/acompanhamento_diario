import assert from 'node:assert/strict';
import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { openDb } from '../src/db.ts';
import { createRepo } from '../src/repo.ts';
import { allowedHostsFromEnv, hostnameOf } from '../src/security.ts';

let server: Server;
let port = 0;

/** Chamada crua: o `fetch` do Node não deixa trocar `Host` nem `Origin`, e aqui precisamos dos dois. */
function raw(path: string, opts: { method?: string; host?: string; origin?: string; body?: string; port?: number } = {}) {
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; json: any }>((resolve, reject) => {
    const headers: Record<string, string> = { Host: opts.host ?? `localhost:${port}` };
    if (opts.origin !== undefined) headers.Origin = opts.origin;
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = String(Buffer.byteLength(opts.body));
    }
    const req = request({ host: '127.0.0.1', port: opts.port ?? port, path, method: opts.method ?? 'GET', headers }, (res) => {
      let text = '';
      res.on('data', (c) => (text += c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, json: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    req.end(opts.body);
  });
}

before(async () => {
  server = createApp({ repo: createRepo(openDb(':memory:')) }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  port = (server.address() as AddressInfo).port;
});

after(() => server.close());

describe('proteções da API local', () => {
  it('não anuncia o framework e envia os cabeçalhos básicos', async () => {
    const res = await raw('/api/demands');
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-powered-by'], undefined);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
  });

  it('aceita chamadas sem Origin e a própria origem (localhost, 127.0.0.1 e o Vite em dev)', async () => {
    assert.equal((await raw('/api/demands')).status, 200);
    assert.equal((await raw('/api/demands', { origin: `http://localhost:${port}` })).status, 200);
    assert.equal((await raw('/api/demands', { host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` })).status, 200);
    // O Vite repassa o Host original da página (:5173) ao proxy; Host e Origin continuam iguais.
    assert.equal((await raw('/api/demands', { host: 'localhost:5173', origin: 'http://localhost:5173' })).status, 200);
  });

  it('recusa uma página de outro site, em leitura e em escrita', async () => {
    const read = await raw('/api/demands', { origin: 'https://exemplo.invalid' });
    assert.equal(read.status, 403);
    assert.match(read.json.error, /Origem não permitida/);

    const write = await raw('/api/demands', {
      method: 'POST',
      origin: 'https://exemplo.invalid',
      body: JSON.stringify({ category: 'treinamento', title: 'Curso fictício' }),
    });
    assert.equal(write.status, 403);
    // Nada foi gravado.
    assert.deepEqual((await raw('/api/demands')).json, []);
  });

  it('recusa outra porta local, "null" e Origin malformado', async () => {
    assert.equal((await raw('/api/demands', { origin: `http://localhost:${port + 1}` })).status, 403);
    assert.equal((await raw('/api/demands', { origin: 'null' })).status, 403);
    assert.equal((await raw('/api/demands', { origin: 'não é uma url' })).status, 403);
  });

  it('recusa Host de fora da máquina (DNS rebinding), mesmo com Origin igual ao Host', async () => {
    const res = await raw('/api/demands', { host: `exemplo.invalid:${port}`, origin: `http://exemplo.invalid:${port}` });
    assert.equal(res.status, 403);
    assert.match(res.json.error, /Host não permitido/);
    assert.equal((await raw('/api/demands', { host: `exemplo.invalid:${port}` })).status, 403);
  });

  it('limita o corpo JSON das rotas comuns', async () => {
    const big = JSON.stringify({ category: 'treinamento', title: 'x', description: 'a'.repeat(200_000) });
    const res = await raw('/api/demands', { method: 'POST', body: big });
    assert.equal(res.status, 413);
    assert.match(res.json.error, /grande demais/);
    // O tamanho normal segue valendo.
    const ok = await raw('/api/demands', { method: 'POST', body: JSON.stringify({ category: 'treinamento', title: 'Curso fictício' }) });
    assert.equal(ok.status, 201);
  });

  it('libera nomes extras de host só quando configurados', async () => {
    const repo = createRepo(openDb(':memory:'));
    const other = createApp({ repo, allowedHosts: ['meu-pc'] }).listen(0, '127.0.0.1');
    await new Promise((resolve) => other.once('listening', resolve));
    const otherPort = (other.address() as AddressInfo).port;
    try {
      const ok = await raw('/api/demands', { port: otherPort, host: `meu-pc:${otherPort}`, origin: `http://meu-pc:${otherPort}` });
      assert.equal(ok.status, 200);
      const denied = await raw('/api/demands', { port: otherPort, host: `outro-pc:${otherPort}` });
      assert.equal(denied.status, 403);
    } finally {
      other.close();
    }
  });
});

describe('configuração do acesso', () => {
  it('hostnameOf tira a porta e entende IPv6', () => {
    assert.equal(hostnameOf('Localhost:3001'), 'localhost');
    assert.equal(hostnameOf('127.0.0.1'), '127.0.0.1');
    assert.equal(hostnameOf('[::1]:3001'), '[::1]');
  });

  it('ALLOWED_HOSTS e HOST explícito liberam nomes; curingas não', () => {
    assert.deepEqual(allowedHostsFromEnv({}), []);
    assert.deepEqual(allowedHostsFromEnv({ ALLOWED_HOSTS: 'meu-pc, 192.168.0.10 ,' }), ['meu-pc', '192.168.0.10']);
    assert.deepEqual(allowedHostsFromEnv({ HOST: '192.168.0.10' }), ['192.168.0.10']);
    assert.deepEqual(allowedHostsFromEnv({ HOST: '0.0.0.0' }), []);
    assert.deepEqual(allowedHostsFromEnv({ HOST: '::' }), []);
  });
});
