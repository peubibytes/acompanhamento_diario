# 0018 — Movimento: animações curtas, com tokens, que nunca atrasam um clique

- **Data:** 2026-11-10
- **Status:** aceita
- **Contexto:** PLANO.md, seção 7 (Estilo visual → Movimento), v0.16

## Contexto

A aplicação quase não se movia: telas, listas e painéis apareciam e sumiam de uma vez, os gráficos nasciam prontos e
cada componente tinha a sua própria duração (0,15 s aqui, 0,35 s ali, 0,8 s no anel). A gestão pediu uma aplicação
"mais animada e fluida". O risco conhecido é o oposto: animação que enfeita, atrasa quem usa todo dia e incomoda quem
é sensível a movimento.

## Decisão

1. **O movimento explica, não enfeita.** Cada animação responde a uma pergunta de quem usa: de onde isto veio
   (painel que entra da direita e sai por onde entrou), o que mudou (o fundo da aba desliza até a escolhida, o número
   sobe até o valor) ou o que acabou de chegar (a tela, a lista, as barras do gráfico).
2. **Tokens, como nas cores e nos tamanhos** (`web/src/index.css`): quatro durações (`--dur-1` 120 ms, resposta a um
   toque; `--dur-2` 200 ms, entra e sai; `--dur-3` 320 ms, troca de tela; `--dur-4` 650 ms, gráficos) e três curvas
   (`--ease-out` nas entradas, `--ease-in` nas saídas, `--ease-spring` só em selos e ícones). Nenhuma duração ou
   curva solta no código: usa-se uma classe (`rise`, `page-in`, `stagger`, `grow-y`, `grow-x`, `pop`, `press`,
   `hint-in`, `slide-in`/`slide-out`, `fade-in`/`fade-out`, `toast-out`, `swap-in`, `donut-in`, `skeleton`).
3. **Nada atrasa um clique.** As entradas duram no máximo 320 ms e as saídas, 200 ms. Ao fechar o painel deslizante,
   o foco e a rolagem da página voltam na hora; só a imagem do painel fica até a animação acabar (e não recebe
   cliques). Uma lista em sequência para de atrasar no décimo item (270 ms).
4. **Só entra quem chegou.** A entrada de uma tela roda ao trocar de tela (a chave é o caminho), não ao mudar a data
   ou um filtro; a de uma lista, quando a lista é montada, não a cada atualização dos dados.
5. **"Reduzir movimento" é respeitado em tudo.** No CSS, o bloco `prefers-reduced-motion: reduce` desliga animações e
   transições (inclusive a troca de tema); no JavaScript, `motionOK()` (`web/src/motion.ts`) decide o mesmo para o
   que o CSS não alcança (contagem do número, saída do painel e dos avisos). Sem movimento, tudo acontece na hora,
   como antes. O mesmo vale onde o ambiente não sabe responder (os testes em jsdom).
6. **Sem dependência nova.** CSS (keyframes e transições), a View Transitions API para a troca de tema (onde o
   navegador não tem, a troca é direta) e três hooks pequenos: `useCountUp`, `useSlidingThumb` e `useExit`.
7. **O texto acessível não anima.** O anel conta de 0 até o valor, mas o `aria-label` traz o valor final desde o
   início; o fundo deslizante das abas é decorativo (`aria-hidden`) e a aba escolhida continua em `aria-selected`.

## Onde aparece

- **Troca de tela:** o conteúdo chega de leve, de baixo.
- **Controles segmentados** (escala, visões do Painel, abas de Demandas, filtros): o fundo desliza até a opção.
- **Painel deslizante:** sai animado, ainda com o conteúdo; o fundo escurecido acompanha.
- **Avisos (toasts):** saem encolhendo, em vez de sumir.
- **Gráficos:** as barras crescem da linha de base, uma depois da outra (Dia útil e Tempo por categoria); a rosca
  da Distribuição gira ao aparecer; o anel de % se desenha e o número conta; as barrinhas dos dias em Apontamentos
  crescem da esquerda.
- **Listas** (Demandas, Apontamentos, Lembretes): os itens chegam em sequência; o detalhe de uma demanda expandida
  entra de leve.
- **Pequenos sinais:** o contador do sino "pula" quando muda; o nome do período troca com um esmaecer; o ícone do
  tema "pula" ao trocar e os dois temas se cruzam; botões afundam um pouco ao pressionar; o "carregando" vira um
  brilho que atravessa o bloco.

## Consequências

- Quem cria um componente novo escolhe uma classe da lista, não uma duração. Faltando uma, ela entra em
  `index.css`, com o comentário do que anima.
- Um teste de tela que confira o fechamento do painel com movimento ligado precisa esperar a saída (200 ms); os
  testes atuais rodam sem `matchMedia`, portanto sem movimento.
- O Kanban (decisão 0017) já trazia o seu movimento (os cartões deslizam ao reordenar, `useFlip`) e segue as mesmas
  regras: mesma curva, respeito a "reduzir movimento". Os botões do cartão ganham a resposta ao toque (`press`).
