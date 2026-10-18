// Voo da flecha e pontuação. Não depende de navegador (roda no Node nos testes).
// Unidades: metros, segundos. O jogador fica na linha de tiro em z = 0 e atira para -Z.

export const DT = 1 / 240;
export const G = 6.0;            // gravidade de jogo (a real é 9,81): menos mira "por cima" nos alvos longe
const K_DRAG = 0.0012;           // arrasto da flecha (em relação ao ar)
const K_WIND = 0.55;             // empurrão lateral do vento
export const ARROW = { min: 16, max: 58, len: 0.78 };
export const BALE = 1.3;         // fardo de feno atrás do alvo: metade do lado = raio do alvo × BALE

// Velocidade da flecha conforme o quanto a corda foi puxada (0..1).
export function speedForDraw(d) {
  const k = Math.max(0, Math.min(1, d));
  return ARROW.min + (ARROW.max - ARROW.min) * Math.pow(k, 0.85);
}

// Vento no instante t. w = {x, z, gust}: rajadas variam a força.
export function windAt(w, t) {
  if (!w) return { x: 0, z: 0 };
  const k = w.gust ? 1 + 0.55 * Math.sin(t * 1.3) + 0.3 * Math.sin(t * 3.7 + 1) : 1;
  return { x: w.x * k, z: w.z * k };
}

export function makeArrow(px, py, pz, vx, vy, vz) { return { px, py, pz, vx, vy, vz }; }

export function stepArrow(a, dt, wx, wz) {
  const rx = a.vx - wx, ry = a.vy, rz = a.vz - wz;
  const s = Math.hypot(rx, ry, rz);
  a.vx += (-K_DRAG * s * rx + K_WIND * wx) * dt;
  a.vy += (-K_DRAG * s * ry - G) * dt;
  a.vz += (-K_DRAG * s * rz + K_WIND * wz) * dt;
  a.px += a.vx * dt; a.py += a.vy * dt; a.pz += a.vz * dt;
}

// Pontos pela distância ao centro: 10 anéis de mesma largura.
export function ringScore(d, radius) {
  if (d > radius) return 0;
  return Math.max(1, 10 - Math.floor(d / (radius / 10)));
}

// Avança a flecha um passo e testa colisões. tgt = {x, y, z, r} (posição do alvo agora).
// Devolve null (continua voando) ou {where: 'face'|'bale'|'ground'|'lost', points, dist, dx, dy}.
export function flightStep(a, dt, wind, t, tgt) {
  const oz = a.pz, ox = a.px, oy = a.py;
  const w = windAt(wind, t);
  stepArrow(a, dt, w.x, w.z);
  if (oz > tgt.z && a.pz <= tgt.z) {
    const f = (oz - tgt.z) / (oz - a.pz);
    const x = ox + (a.px - ox) * f, y = oy + (a.py - oy) * f;
    const dx = x - tgt.x, dy = y - tgt.y;
    const d = Math.hypot(dx, dy);
    const bale = tgt.r * BALE;
    if (d <= tgt.r) return stick(a, x, y, tgt.z, { where: 'face', points: ringScore(d, tgt.r), dist: d, dx, dy });
    if (Math.abs(dx) <= bale && Math.abs(dy) <= bale) return stick(a, x, y, tgt.z, { where: 'bale', points: 0, dist: d, dx, dy });
  }
  if (a.py <= 0) return stick(a, a.px, 0, a.pz, { where: 'ground', points: 0, dist: Infinity });
  if (a.pz < tgt.z - 30 || Math.abs(a.px) > 80) return { where: 'lost', points: 0, dist: Infinity };
  return null;
}

function stick(a, x, y, z, res) { a.px = x; a.py = y; a.pz = z; return res; }

// Onde a flecha cruza o plano z = zPlane (sem alvo). Usado para mirar.
export function crossPlane(px, py, pz, vx, vy, vz, zPlane, wind, t0) {
  const a = makeArrow(px, py, pz, vx, vy, vz);
  let t = 0;
  while (t < 4) {
    const oz = a.pz, ox = a.px, oy = a.py;
    const w = windAt(wind, t0 + t);
    stepArrow(a, DT, w.x, w.z);
    t += DT;
    if (oz > zPlane && a.pz <= zPlane) {
      const f = (oz - zPlane) / (oz - a.pz);
      return { x: ox + (a.px - ox) * f, y: oy + (a.py - oy) * f, t: t - DT * (1 - f) };
    }
    if (a.py < -5) break;
  }
  return null;
}

// Direção para acertar o ponto (tx, ty, tz) com a velocidade dada, considerando o vento.
export function aimAt(px, py, pz, tx, ty, tz, speed, wind, t0) {
  let ax = tx, ay = ty;
  let v = null;
  for (let i = 0; i < 6; i++) {
    const dx = ax - px, dy = ay - py, dz = tz - pz;
    const l = Math.hypot(dx, dy, dz);
    v = { x: dx / l * speed, y: dy / l * speed, z: dz / l * speed };
    const c = crossPlane(px, py, pz, v.x, v.y, v.z, tz, wind, t0);
    if (!c) { ay += 2; continue; }
    const ex = tx - c.x, ey = ty - c.y;
    if (Math.hypot(ex, ey) < 0.003) break;
    ax += ex; ay += ey;
  }
  return v;
}
