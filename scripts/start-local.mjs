// Início com dois cliques (iniciar.cmd no Windows, iniciar.sh no macOS e Linux): confere o Node, instala as
// dependências quando faltam ou mudaram, monta a tela e sobe o servidor com o navegador abrindo sozinho.
// Sem recursos novos do Node: precisa rodar numa versão antiga para conseguir avisar que ela é antiga.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** "23.6" de ">=23.6" (o `engines` do package.json). */
export function minimumNode(engines) {
  const match = /(\d+)(?:\.(\d+))?/.exec(engines ?? '');
  return match ? [Number(match[1]), Number(match[2] ?? 0)] : [0, 0];
}

export function isSupported(version, [major, minor]) {
  const [a, b] = version.replace(/^v/, '').split('.').map(Number);
  return a > major || (a === major && b >= minor);
}

/** Sem node_modules, ou com o package-lock.json mais novo que a última instalação: é preciso instalar. */
export function needsInstall(dir) {
  const installed = join(dir, 'node_modules', '.package-lock.json');
  if (!existsSync(installed)) return true;
  return statSync(join(dir, 'package-lock.json')).mtimeMs > statSync(installed).mtimeMs;
}

/** Roda um comando do npm na pasta do projeto; resolve com o código de saída. */
function npm(args, env = process.env) {
  return new Promise((resolve) => {
    // shell: no Windows o npm é um .cmd, que o Node só executa por um shell.
    const child = spawn(`npm ${args}`, { cwd: root, env, stdio: 'inherit', shell: true });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function main() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const minimum = minimumNode(pkg.engines && pkg.engines.node);
  if (!isSupported(process.version, minimum)) {
    console.error(`Este aplicativo precisa do Node.js ${minimum.join('.')} ou mais novo (você tem o ${process.version}).`);
    console.error('Instale a versão atual em https://nodejs.org e tente de novo.');
    return 1;
  }

  if (needsInstall(root)) {
    console.log('Instalando as dependências (só na primeira vez ou depois de uma atualização)…');
    const code = await npm('ci');
    if (code !== 0) {
      console.error('A instalação falhou. Se a rede da empresa usa proxy, configure o npm (npm config set proxy …).');
      return code;
    }
  }

  console.log('Montando a tela e iniciando o servidor. Feche esta janela para parar.');
  return npm('start', { ...process.env, OPEN_BROWSER: '1' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
