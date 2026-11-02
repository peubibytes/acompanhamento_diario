// Proteções baratas para uma API local: sem login, ela só deve responder à própria aplicação.
// Ver a seção "Acesso e segurança" do PLANO.

import type { RequestHandler } from 'express';

/** Nomes que sempre apontam para a própria máquina. */
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/** Tamanho máximo do corpo JSON das rotas comuns (a maior declaração tem ~4 mil caracteres). */
export const JSON_LIMIT = '100kb';

/** Só a importação (o banco inteiro em JSON) pode mais que isso. */
export const IMPORT_LIMIT = '50mb';

/** "host:porta" → "host" (preserva o IPv6 entre colchetes). */
export function hostnameOf(hostHeader: string): string {
  const text = hostHeader.trim().toLowerCase();
  if (text.startsWith('[')) return text.slice(0, text.indexOf(']') + 1);
  return text.split(':')[0];
}

/**
 * Recusa requisições que não vieram da própria aplicação:
 * - `Host` precisa ser a própria máquina (ou um nome liberado em `allowedHosts`): barra o
 *   "DNS rebinding", em que o domínio de uma página maliciosa passa a apontar para 127.0.0.1;
 * - `Origin`, quando existe (o navegador o envia em chamadas entre sites e em escritas), precisa ser
 *   o mesmo `host:porta` do `Host`: barra uma página qualquer chamando a API local. O Vite em
 *   desenvolvimento repassa o `Host` original, então a página em :5173 também passa.
 * Requisições sem `Origin` (curl, testes, a navegação normal) seguem.
 */
export function localOnly(allowedHosts: readonly string[] = []): RequestHandler {
  const allowed = new Set([...LOOPBACK, ...allowedHosts.map((h) => h.trim().toLowerCase()).filter(Boolean)]);
  return (req, res, next) => {
    const host = req.headers.host;
    if (!host || !allowed.has(hostnameOf(host))) {
      return res.status(403).json({ error: 'Host não permitido. Acesse pelo endereço local ou libere o nome em ALLOWED_HOSTS.' });
    }
    const origin = req.headers.origin;
    if (origin !== undefined) {
      let originHost: string | null = null;
      try {
        originHost = new URL(origin).host.toLowerCase();
      } catch {
        // "null" (página isolada) e valores malformados caem na recusa abaixo.
      }
      if (originHost !== host.toLowerCase()) {
        return res.status(403).json({ error: 'Origem não permitida.' });
      }
    }
    next();
  };
}

/** Cabeçalhos que não custam nada: sem adivinhar tipo de arquivo e sem enviar a origem em links. */
export const baseHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
};

/** Hosts liberados a mais, de `ALLOWED_HOSTS` (separados por vírgula) e do `HOST` explícito. */
export function allowedHostsFromEnv(env: NodeJS.ProcessEnv): string[] {
  const extra = (env.ALLOWED_HOSTS ?? '').split(',');
  const bind = env.HOST && !['0.0.0.0', '::'].includes(env.HOST) ? [env.HOST] : [];
  return [...extra, ...bind].map((h) => h.trim()).filter(Boolean);
}
