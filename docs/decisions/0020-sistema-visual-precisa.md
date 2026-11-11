# 0020 — Sistema visual "Precisa": tokens novos, cores com significado e números como dado

- **Data:** 2026-11-11
- **Status:** aceita
- **Contexto:** PLANO.md, seções 3, 6, 7, 9, 12 e 14, v0.18; substitui o item 3 da decisão 0019 (quais cores cada tipo
  recebe)

## Contexto

A aplicação funcionava e era consistente, mas parecia genérica. Um diagnóstico das sete telas, nos dois temas, em 1280
e 390 px, com um banco fictício, apontou dez problemas. Os que mais pesavam:

- **O vermelho de alarme dominava.** Um dia acima da meta virava uma barra vermelha cheia; uma semana normal parecia
  uma emergência (Painel, Apontamentos, Detalhes e Lembretes).
- **A mesma cor dizia coisas diferentes.** Na Distribuição o ciclo era verde; no Rendimento e no seletor de
  categoria, laranja.
- **Sem hierarquia tipográfica.** Mais de 200 usos de `text-xs`/`2xs`, 159 `font-semibold` e rótulos em caixa-alta
  espalhados: tudo pequeno e quase tudo em negrito.
- **Pílula em tudo.** Botão, filtro, selo e status tinham a mesma forma, e os raios soltos (`rounded-xl`, `2xl`)
  superavam os tokens.
- **Tema escuro sem camadas:** o cartão quase sumia no fundo.
- **Celular:** nomes de demanda cortados em Apontamentos, controles demais antes do gráfico no Painel, a tabela de
  Detalhes mostrando as colunas menos úteis.
- **Identidade:** o índigo padrão do Tailwind, Inter, nada próprio.

Foram propostas três direções (Precisa, Calma e Calorosa), com paleta nos dois temas, tipografia, raios e maquetes do
Painel e do Kanban. Foi escolhida a **Precisa**: densa e exata, para uma ferramenta aberta várias vezes por dia.

## Decisão

1. **Tokens novos em `web/src/index.css`** (nada de valor solto nos componentes):
   - **Fontes:** Geist no texto e Geist Mono para o número como dado (`.num`). `.tabular` segue existindo para
     algarismos alinhados na fonte do texto (datas, contagens dentro de frases). As duas vêm do Google Fonts, como a
     Inter vinha; servir os arquivos localmente fica para depois.
   - **Escala:** `text-2xs` 11 · `xs` 12 · `sm` 13 · `base` 14 · `lg` 16 · `2xl` 20 · `display` 28 px.
   - **Raios:** `rounded-badge` 4 (selos, contagens), `rounded-control` 6 (botões, campos, chips, abas),
     `rounded-card` 10 (cartões, painéis). `rounded-full` só no que é redondo (pontos, anéis, barras de progresso,
     contador do sino). `rounded-lg/xl/2xl` apontam para os valores novos enquanto restarem no código.
   - **Bordas e sombras:** borda fina visível nos dois temas separa os blocos; sombra só no que flutua
     (`--shadow-pop`). O escuro tem três camadas com passos visíveis (fundo, superfície, superfície elevada).
   - **Cores:** neutros levemente frios; uma só cor de destaque, o íris (`#5b5bd6` / `#8b8cf0`), na ação principal,
     no foco e no item escolhido.
2. **Cor com significado (teoria das cores).** Toda cor carrega um sentido e vai para o que combina com ele:
   - Tipos de demanda, sobre os mesmos 5 tons já validados para daltonismo: **treinamento azul** (conhecimento),
     **chamado laranja** (ação e resposta, sem o alarme do vermelho), **ciclo verde** (crescimento), **reunião
     amarelo** (comunicação) e **atividade rosa** (cuidado e apoio). A cor de um tipo é a mesma em gráficos,
     seletor de categoria, Kanban, listas e relatório, e o ícone do tipo usa a variante `-ink`.
   - **Dados sem categoria** (horas do dia, progresso) usam o azul-escuro `--bar` (`#24336b` / `#4b62b0`), não cinza.
   - **Vermelho só no que passou da meta:** a barra vai até a meta em `--bar` e só o excesso fica hachurado
     (`.hatch-critical`); o selo e o ícone acompanham. O texto ao redor não repete a cor.
   - Verde e amarelo também são cores de status; status sempre vem com ícone e rótulo próprios.
3. **Cada forma tem um papel.** Botão: `.btn-primary`, `-secondary`, `-ghost`, `-danger`, `-icon` e `.btn-sm`, todos
   com o raio de controle. Selo: `.badge` (retângulo de cantos curtos). Chip de filtro: `.chip`, com borda em
   repouso. Indicadores: `.kpi-label` (caixa normal, discreto) e `.kpi-value` (Geist Mono). As classes de componente
   ficam em `@layer components`, para os utilitários do Tailwind valerem por cima.
4. **Caixa-alta sai dos rótulos.** Títulos de grupo, cabeçalhos de tabela e rótulos de indicador ficam em caixa
   normal, menores e mais claros; o número carrega o peso.
5. **Estados vazios dizem o que fazer** (a coluna do Kanban diz o que recebe; a lista de Demandas e o dia sem
   apontamento dizem onde registrar o primeiro).
6. **Não muda:** rotas, banco, regras de negócio, o Markdown copiado do relatório, o movimento (decisão 0018) e o
   comportamento do seletor de categoria (decisão 0019).

## Onde aparece

- **Apontamentos:** abas dos dias com a barra em `--bar` até a meta e só o excesso em vermelho; no celular, o nome da
  demanda com a largura toda e o horário embaixo; ícones na cor do tipo.
- **Painel:** excesso hachurado no Dia útil; KPIs em Geist Mono; Distribuição com a cor do tipo (tons do tipo para
  demandas do mesmo tipo); Rendimento com o ícone da categoria na maior parte de cada dia; no celular, duas faixas de
  controles em vez de três.
- **Kanban:** status como selo, coluna vazia com uma frase própria, sem o cabeçalho repetido no celular.
- **Demandas:** o começo da descrição embaixo do nome (cinco chamados deixam de ser cinco números iguais).
- **Detalhes:** no celular, o dia da semana na coluna da data e a meta oculta, para horas, diferença e apontamentos
  caberem sem rolar; o diagnóstico sem repetir o vermelho.
- **Lembretes:** gravidade escrita com um ponto na cor, sem uma fileira de selos vermelhos.
- **Relatório:** ícones na cor do tipo, indicadores em Geist Mono, selos e ações da fundação.

## Consequências

- Escolher uma cor passa a exigir um porquê: o comentário do token em `index.css` registra o significado.
- Contraste conferido nos dois temas (texto ≥ 4,5:1; bordas de campo e barras ≥ 3:1) e sem rolagem horizontal em
  1280, 390, 360 e 320 px em todas as telas. Um ajuste saiu dessa auditoria: o verde de texto do tema claro foi de
  `#1a7f37` para `#177135` (4,47 → 5,36:1 sobre o fundo suave).
- A Geist Mono é mais larga que a fonte do texto: só entra no número, nunca na frase em volta (um campo que mistura
  data e texto, como "Nenhuma ainda", usa `.tabular`).
- Com 13 px no `text-sm`, cabe mais em cada tela; quem precisar de letra maior usa o zoom do navegador.
- Os nomes `rounded-lg/xl/2xl` ainda existem em alguns componentes; trocá-los pelos nomes do sistema é limpeza, sem
  efeito visual.
