// Layout em serpentina (boustrófedon) para o mapa da linha do tempo: começa na esquerda e vai
// até a direita; ao chegar no limite, desce e volta da direita para a esquerda, e assim por diante.

export interface SnakeCell {
  /** Posição na sequência (0 = primeiro). */
  index: number;
  row: number;
  /** Coluna na grade, de 0 (esquerda) a `columns - 1`. */
  col: number;
  /** Sentido da linha em que o nó está: nas pares vai para a direita, nas ímpares para a esquerda. */
  direction: 'ltr' | 'rtl';
  /** Há linha chegando pelo lado de onde se vem (nó que não abre a linha). */
  hasIncoming: boolean;
  /** Há linha saindo para o lado de onde se vai (nó que não fecha a linha nem a sequência). */
  hasOutgoing: boolean;
  /**
   * O nó fecha a linha e a sequência continua: ali a linha faz a curva para baixo. É o lado em
   * que a curva fica (`right` nas linhas que vão para a direita, `left` nas que voltam).
   */
  turn: 'right' | 'left' | null;
}

/** Colunas que cabem na largura, entre `min` e `max` (nunca menos que 1). */
export function snakeColumns(width: number, nodeWidth = 112, min = 2, max = 8): number {
  return Math.max(1, Math.min(max, Math.max(min, Math.floor(width / nodeWidth))));
}

export function snakeLayout(count: number, columns: number): SnakeCell[] {
  const cols = Math.max(1, Math.floor(columns));
  const cells: SnakeCell[] = [];
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / cols);
    const pos = index % cols;
    const direction = row % 2 === 0 ? 'ltr' : 'rtl';
    const last = index === count - 1;
    const endOfRow = pos === cols - 1;
    cells.push({
      index,
      row,
      col: direction === 'ltr' ? pos : cols - 1 - pos,
      direction,
      hasIncoming: pos > 0,
      hasOutgoing: !endOfRow && !last,
      turn: endOfRow && !last ? (direction === 'ltr' ? 'right' : 'left') : null,
    });
  }
  return cells;
}
