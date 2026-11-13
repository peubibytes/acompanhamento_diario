import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { motionOK } from '../motion';
import { MoonIcon, SunIcon } from './icons';

type Theme = 'light' | 'dark';

// A mesma chave é lida por um script inline no index.html, antes do React carregar,
// para a página já abrir no tema escolhido (sem piscar o tema do sistema).
const STORAGE_KEY = 'tema';
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** Tema efetivo: o escolhido pelo usuário ou, se nenhum, o do sistema. */
function currentTheme(): Theme {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return darkQuery.matches ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Sem escolha salva, acompanha mudanças do tema do sistema.
  useEffect(() => {
    const onChange = () => setTheme(currentTheme());
    darkQuery.addEventListener('change', onChange);
    return () => darkQuery.removeEventListener('change', onChange);
  }, []);

  const apply = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Armazenamento indisponível (ex.: navegação privada): vale só nesta sessão.
    }
    setTheme(next);
  };

  /** Os dois temas se cruzam (View Transitions), onde o navegador sabe fazer; senão, troca direto. */
  const toggle = () => {
    if (motionOK() && typeof document.startViewTransition === 'function') document.startViewTransition(() => flushSync(apply));
    else apply();
  };

  const label = theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="press grid size-9 shrink-0 place-items-center rounded-control text-chrome-ink-2 outline-none hover:bg-white/10 hover:text-chrome-ink focus-visible:ring-2 focus-visible:ring-chrome-ink"
    >
      <span key={theme} className="pop grid">
        {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </span>
    </button>
  );
}
