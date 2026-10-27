// Gera docs/Documentacao-Tecnica.pdf a partir de documentacao.html usando o
// Microsoft Edge ou o Google Chrome em modo headless. Uso: npm run docs:pdf
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = fileURLToPath(new URL('./documentacao.html', import.meta.url));
const output = fileURLToPath(new URL('../Documentacao-Tecnica.pdf', import.meta.url));

const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/microsoft-edge',
].filter(Boolean);

const browser = candidates.find((path) => existsSync(path));
if (!browser) {
  console.error('Nenhum navegador encontrado. Defina BROWSER com o caminho do Edge ou do Chrome.');
  process.exit(1);
}

execFileSync(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  '--virtual-time-budget=10000', // tempo para carregar as fontes
  `--print-to-pdf=${output}`,
  pathToFileURL(source).href,
], { stdio: 'ignore' });

console.log(`PDF gerado: ${output} (${Math.round(statSync(output).size / 1024)} KB)`);
