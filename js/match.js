// Placar e ordem de tiro. Não depende de navegador.
// Lados: 0 = jogador, 1 = computador. Em cada alvo o jogador atira primeiro.
export class Match {
  constructor({ targets = 10, arrows = 3 } = {}) {
    this.nTargets = targets;
    this.arrows = arrows;
    this.target = 0;
    this.turn = 0;
    this.left = arrows;
    this.points = [[], []];          // points[lado][alvo] = [pontos de cada flecha]
    for (let i = 0; i < targets; i++) { this.points[0].push([]); this.points[1].push([]); }
    this.tiebreak = null;            // {dist: [d0, d1], round}
    this.over = false;
    this.winner = null;
  }

  total(side) { return this.points[side].reduce((s, a) => s + a.reduce((x, y) => x + y, 0), 0); }
  targetTotal(side, i) { return this.points[side][i].reduce((x, y) => x + y, 0); }

  // Registra uma flecha. dist = distância ao centro (Infinity se errou).
  // Devolve o que aconteceu: 'next' (mesmo lado atira de novo), 'switch' (vez do outro),
  // 'targetDone', 'tiebreak' (empate: começa o desempate), 'over'.
  shot(side, points, dist = Infinity) {
    if (this.over || side !== this.turn) return null;
    if (this.tiebreak) {
      this.tiebreak.dist[side] = dist;
      if (side === 0) { this.turn = 1; return 'switch'; }
      const [a, b] = this.tiebreak.dist;
      if (a === b) { this.tiebreak = { dist: [null, null], round: this.tiebreak.round + 1 }; this.turn = 0; return 'tiebreak'; }
      this.over = true; this.winner = a < b ? 0 : 1;
      return 'over';
    }
    this.points[side][this.target].push(points);
    this.left--;
    if (this.left > 0) return 'next';
    if (side === 0) { this.turn = 1; this.left = this.arrows; return 'switch'; }
    // Os dois atiraram neste alvo.
    if (this.target + 1 < this.nTargets) {
      this.target++; this.turn = 0; this.left = this.arrows;
      return 'targetDone';
    }
    const a = this.total(0), b = this.total(1);
    if (a === b) { this.tiebreak = { dist: [null, null], round: 1 }; this.turn = 0; this.left = 1; return 'tiebreak'; }
    this.over = true; this.winner = a > b ? 0 : 1;
    return 'over';
  }
}
