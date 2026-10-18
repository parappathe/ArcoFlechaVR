// Os 10 alvos da partida, do mais fácil ao mais difícil. Não depende de navegador.
// dist: distância da linha de tiro (m) · r: raio do alvo (m) · y: altura do centro
// move: null | {type: 'slide' | 'swing', amp (m, para cada lado), period (s)}
// wind: força do vento lateral em m/s (o lado é sorteado a cada partida) · gust: rajadas

export const TARGETS = [
  { dist: 10, r: 0.6, y: 1.3, move: null, wind: 0, name: 'Aquecimento' },
  { dist: 15, r: 0.6, y: 1.3, move: null, wind: 0, name: '15 metros' },
  { dist: 20, r: 0.55, y: 1.3, move: null, wind: 0, name: '20 metros' },
  { dist: 20, r: 0.55, y: 1.3, move: null, wind: 3, name: 'Primeiro vento' },
  { dist: 25, r: 0.42, y: 1.3, move: null, wind: 1, name: 'Alvo menor' },
  { dist: 20, r: 0.5, y: 1.3, move: { type: 'slide', amp: 1.5, period: 6 }, wind: 0, name: 'Alvo andando' },
  { dist: 30, r: 0.5, y: 1.3, move: null, wind: 4, name: 'Vento forte' },
  { dist: 25, r: 0.45, y: 1.5, move: { type: 'swing', amp: 1.2, period: 3.4 }, wind: 1.5, name: 'Pêndulo' },
  { dist: 25, r: 0.36, y: 1.3, move: { type: 'slide', amp: 2.2, period: 3.2 }, wind: 0, name: 'Alvo rápido' },
  { dist: 40, r: 0.45, y: 1.4, move: null, wind: 4, gust: true, name: 'Final: 40 m com rajadas' },
];

export const SWING_LEN = 2.2; // comprimento da corda do pêndulo

// Vento sorteado para a partida (lado e pequena variação).
export function makeWinds(rng = Math.random) {
  return TARGETS.map(t => {
    if (!t.wind) return null;
    const side = rng() < 0.5 ? -1 : 1;
    return { x: side * t.wind * (0.85 + rng() * 0.3), z: (rng() - 0.5) * t.wind * 0.3, gust: !!t.gust };
  });
}

// Posição do centro do alvo no instante t.
export function targetPos(def, t, out = {}) {
  out.z = -def.dist; out.r = def.r;
  const m = def.move;
  if (!m) { out.x = 0; out.y = def.y; out.angle = 0; return out; }
  const ph = Math.sin(2 * Math.PI * t / m.period);
  if (m.type === 'slide') { out.x = m.amp * ph; out.y = def.y; out.angle = 0; return out; }
  // Pêndulo: pendurado em SWING_LEN acima do centro em repouso.
  const maxAng = Math.asin(Math.min(0.95, m.amp / SWING_LEN));
  const ang = maxAng * ph;
  out.angle = ang;
  out.x = SWING_LEN * Math.sin(ang);
  out.y = def.y + SWING_LEN * (1 - Math.cos(ang));
  return out;
}
