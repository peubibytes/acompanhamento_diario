// Varredura anti-vazamento: falha se o git rastrear dados que não podem estar no repositório
// (planilhas, bancos) ou se um arquivo de texto trouxer número de chamado com cara de real ou um
// e-mail. Node puro, sem dependências. Uso: npm run check:sensitive
//
// Imprime só arquivo, linha e o tipo do achado, nunca o valor: o log do CI de um repositório público
// não pode virar o vazamento.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Arquivos que não entram no repositório, pela extensão (ou pela pasta de dados). */
const FORBIDDEN_FILE = /(\.(xlsx|xlsm|xls|csv|db|sqlite3?|db-wal|db-shm|db-journal)$)|(^|\/)server\/data\//i;

/**
 * Números de chamado: prefixo + dígitos. Os fictícios do projeto são pequenos (SCTASK0000001,
 * INC0001) ou o exemplo da tela (SCTASK0012345); os reais têm 6 dígitos significativos ou mais.
 */
const TICKET = /\b(SCTASK|RITM|INC|REQ|CHG|PRB|STRY|TASK)(\d{6,})\b/gi;
const REAL_TICKET_FROM = 100_000;

/** E-mails de exemplo e os que o GitHub e a Anthropic usam em autoria. */
const EMAIL = /[a-z0-9._%+-]+@([a-z0-9-]+\.)+[a-z]{2,}/gi;
const EMAIL_OK = /@(example\.(com|org|net)|users\.noreply\.github\.com|anthropic\.com)$/i;

/** Arquivo binário: tem byte nulo nos primeiros KB. */
const isBinary = (buffer) => buffer.subarray(0, 8000).includes(0);

/** @param {{ path: string, content: Buffer | string }[]} files */
export function findProblems(files) {
  const problems = [];
  for (const { path, content } of files) {
    if (FORBIDDEN_FILE.test(path)) {
      problems.push(`${path}: arquivo de dados rastreado pelo git (planilha ou banco não entram no repositório)`);
      continue;
    }
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
    if (isBinary(buffer)) continue;
    const lines = buffer.toString('utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(TICKET)) {
        if (Number(m[2]) >= REAL_TICKET_FROM) {
          problems.push(`${path}:${i + 1}: número de chamado com cara de real (${m[1].toUpperCase()} + ${m[2].length} dígitos); use um fictício, como ${m[1].toUpperCase()}0000001`);
        }
      }
      for (const m of line.matchAll(EMAIL)) {
        if (!EMAIL_OK.test(m[0])) problems.push(`${path}:${i + 1}: endereço de e-mail (use @example.com em exemplos)`);
      }
    });
  }
  return problems;
}

function trackedFiles() {
  const list = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return list.split('\0').filter(Boolean);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = trackedFiles();
  const problems = findProblems(
    paths.map((path) => ({ path, content: FORBIDDEN_FILE.test(path) ? '' : readFileSync(path) })),
  );
  if (problems.length > 0) {
    console.error(`Varredura anti-vazamento: ${problems.length} problema(s).\n`);
    for (const p of problems) console.error(`  ✖ ${p}`);
    process.exit(1);
  }
  console.log(`Varredura anti-vazamento: ${paths.length} arquivos rastreados, nenhum problema.`);
}
