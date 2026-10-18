// Adversários do computador. Não depende de navegador.
// Cada um mira no centro do alvo e erra conforme o nível: erro de mira (miliradianos),
// quanto compensa o vento (0 = ignora, 1 = perfeito) e quanto adianta a mira em alvo que anda.
import { ARROW, aimAt, crossPlane } from './physics.js';
import { targetPos } from './targets.js';

export const LEVELS = [
  {
    id: 'facil', title: 'Fácil', name: 'Tonico', desc: 'Atira rápido e sem muito cuidado. Ignora o vento.',
    color: 0x5fa8d3, skin: 0xe8b48a, hat: 0x7a5230,
    err: 9, windComp: 0.25, lead: 0.45, speed: 0.85, think: [1.4, 2.2],
  },
  {
    id: 'medio', title: 'Médio', name: 'Lia Certeira', desc: 'Boa de mira. Erra um pouco no vento e no alvo que anda.',
    color: 0xd96c3b, skin: 0xc68e62, hat: 0x2f4a2a,
    err: 4.6, windComp: 0.7, lead: 0.8, speed: 0.95, think: [1.8, 2.6],
  },
  {
    id: 'dificil', title: 'Difícil', name: 'Guilherme Tell', desc: 'Mestre do arco. Quase não erra.',
    color: 0x7c4dab, skin: 0xf0c9a0, hat: 0x1d1d1d,
    err: 2.2, windComp: 0.95, lead: 0.97, speed: 1, think: [2.0, 3.0],
  },
];

function gauss(rng) {
  const u = Math.max(1e-9, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Velocidade da flecha do computador saindo de (px,py,pz) no instante t0.
export function cpuShot(level, px, py, pz, def, t0, wind, rng = Math.random) {
  const speed = ARROW.max * level.speed;
  const now = targetPos(def, t0);
  // Previsão de onde o alvo estará quando a flecha chegar (adiantamento parcial).
  let aim = { x: now.x, y: now.y };
  if (def.move) {
    let tf = def.dist / speed;
    for (let i = 0; i < 3; i++) {
      const fut = targetPos(def, t0 + tf);
      aim = { x: now.x + (fut.x - now.x) * level.lead, y: now.y + (fut.y - now.y) * level.lead };
      const v = aimAt(px, py, pz, aim.x, aim.y, -def.dist, speed, null, t0);
      const c = crossPlane(px, py, pz, v.x, v.y, v.z, -def.dist, null, t0);
      if (c) tf = c.t;
    }
  }
  const believed = wind ? { x: wind.x * level.windComp, z: wind.z * level.windComp, gust: false } : null;
  const v = aimAt(px, py, pz, aim.x, aim.y, -def.dist, speed, believed, t0);
  // Erro de mira: gira a direção um pouco (mais em alvo que anda).
  const errRad = level.err / 1000 * (def.move ? 1.3 : 1);
  const yaw = gauss(rng) * errRad, pitch = gauss(rng) * errRad;
  const s = Math.hypot(v.x, v.y, v.z) * (1 + gauss(rng) * 0.004);
  let dx = v.x / s, dy = v.y / s, dz = v.z / s;
  // yaw em torno de Y
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  [dx, dz] = [dx * cy + dz * sy, -dx * sy + dz * cy];
  dy += pitch;
  const l = Math.hypot(dx, dy, dz);
  return { x: dx / l * s, y: dy / l * s, z: dz / l * s };
}
