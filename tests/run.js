// Testes automáticos: node tests/run.js  (tem que terminar com "Tudo certo")
import { DT, makeArrow, flightStep, ringScore, speedForDraw, aimAt, crossPlane, ARROW } from '../js/physics.js';
import { TARGETS, makeWinds, targetPos } from '../js/targets.js';
import { LEVELS, cpuShot } from '../js/cpu.js';
import { Match } from '../js/match.js';
import { ArcheryGame } from '../js/game.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU: ' + msg); } }
const section = (n) => console.log(n);
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function fly(a, tgt, wind = null, t0 = 0) {
  for (let t = 0; t < 5; t += DT) { const r = flightStep(a, DT, wind, t0 + t, tgt); if (r) return r; }
  return null;
}

section('Física e pontuação');
{
  ok(ringScore(0, 0.6) === 10 && ringScore(0.059, 0.6) === 10 && ringScore(0.061, 0.6) === 9, 'anel 10 tem 1/10 do raio');
  ok(ringScore(0.599, 0.6) === 1 && ringScore(0.61, 0.6) === 0, 'borda vale 1, fora vale 0');
  ok(speedForDraw(0) === ARROW.min && Math.abs(speedForDraw(1) - ARROW.max) < 1e-9 && speedForDraw(0.5) > speedForDraw(0.3), 'força da corda');
}
{
  // Mira calculada acerta o centro sem vento e com vento; sem compensar, o vento desvia.
  const tgt = { x: 0, y: 1.3, z: -30, r: 0.5 };
  const v = aimAt(0, 1.5, 0, 0, 1.3, -30, 50, null, 0);
  const r = fly(makeArrow(0, 1.5, 0, v.x, v.y, v.z), tgt);
  ok(r && r.where === 'face' && r.points === 10, `tiro calculado sem vento deveria dar 10 (deu ${r && r.points})`);
  const wind = { x: 4, z: 0 };
  const r2 = fly(makeArrow(0, 1.5, 0, v.x, v.y, v.z), tgt, wind);
  ok(r2 && r2.dx > 0.15, `vento de 4 m/s para a direita deveria desviar a flecha (desvio ${r2 && r2.dx.toFixed(2)} m)`);
  const vw = aimAt(0, 1.5, 0, 0, 1.3, -30, 50, wind, 0);
  const r3 = fly(makeArrow(0, 1.5, 0, vw.x, vw.y, vw.z), tgt, wind);
  ok(r3 && r3.points === 10, 'mira compensando o vento deveria dar 10');
}
{
  // Flecha rapidíssima não atravessa o alvo; erro fora do fardo passa e cai no chão.
  const tgt = { x: 0, y: 1.3, z: -10, r: 0.6 };
  const r = fly(makeArrow(0, 1.3, 0, 0, 0.5, -120), tgt);
  ok(r && r.where === 'face', 'flecha rápida deveria cravar no alvo');
  const r2 = fly(makeArrow(0, 1.3, 0, 8, 1, -40), tgt);
  ok(r2 && r2.where === 'ground', `flecha bem errada deveria cair no chão (${r2 && r2.where})`);
}
{
  // Alvos: os que andam mudam de lugar; o pêndulo sobe nas pontas.
  const slide = TARGETS.find(t => t.move?.type === 'slide');
  ok(Math.abs(targetPos(slide, slide.move.period / 4).x - slide.move.amp) < 1e-6, 'alvo deslizante chega à amplitude');
  const sw = TARGETS.find(t => t.move?.type === 'swing');
  const p = targetPos(sw, sw.move.period / 4);
  ok(Math.abs(p.x - sw.move.amp) < 1e-6 && p.y > sw.y, 'pêndulo vai para o lado e sobe');
  ok(TARGETS.length === 10, '10 alvos');
  const w = makeWinds(seeded(3));
  ok(w.filter(Boolean).length === TARGETS.filter(t => t.wind).length, 'vento só nos alvos com vento');
}

section('Partida');
{
  const m = new Match({ targets: 2, arrows: 3 });
  const seq = [];
  for (const [s, p] of [[0, 10], [0, 9], [0, 8], [1, 7], [1, 7], [1, 7], [0, 5], [0, 5], [0, 5], [1, 6], [1, 6], [1, 6]]) seq.push(m.shot(s, p));
  ok(seq.join(',') === 'next,next,switch,next,next,targetDone,next,next,switch,next,next,over', `ordem de tiro (${seq.join(',')})`);
  ok(m.total(0) === 42 && m.total(1) === 39 && m.winner === 0, 'total e vencedor');
  ok(m.shot(1, 10) === null, 'depois do fim não aceita flecha');
}
{
  const m = new Match({ targets: 1, arrows: 1 });
  m.shot(0, 8); const r = m.shot(1, 8);
  ok(r === 'tiebreak' && m.tiebreak, 'empate leva ao desempate');
  m.shot(0, 9, 0.1); ok(m.shot(1, 9, 0.1) === 'tiebreak', 'desempate empatado repete');
  m.shot(0, 7, 0.3); const fin = m.shot(1, 9, 0.05);
  ok(fin === 'over' && m.winner === 1, 'no desempate ganha quem chega mais perto do centro');
}

section('Adversários');
{
  // Média de pontos por flecha de cada nível, em muitos tiros em todos os alvos.
  const avg = LEVELS.map((lv, li) => {
    const rng = seeded(11 + li);
    let sum = 0, n = 0;
    for (let k = 0; k < 40; k++) {
      const winds = makeWinds(rng);
      TARGETS.forEach((def, i) => {
        const t0 = rng() * 10;
        const v = cpuShot(lv, 2.2, 1.5, 0, def, t0, winds[i], rng);
        const a = makeArrow(2.2, 1.5, 0, v.x, v.y, v.z);
        let r = null;
        for (let t = 0; t < 5 && !r; t += DT) r = flightStep(a, DT, winds[i], t0 + t, targetPos(def, t0 + t));
        sum += r ? r.points : 0; n++;
      });
    }
    return sum / n;
  });
  console.log('  média por flecha: ' + LEVELS.map((l, i) => `${l.title} ${avg[i].toFixed(2)}`).join(' · '));
  ok(avg[0] < avg[1] && avg[1] < avg[2], 'Difícil > Médio > Fácil');
  ok(avg[0] > 3.5 && avg[0] < 6.5, 'Fácil entre 3,5 e 6,5 por flecha');
  ok(avg[2] > 8 && avg[2] < 9.6, 'Difícil entre 8 e 9,6 por flecha');
}
{
  // Partida inteira computador x computador termina, com 30 flechas de cada lado.
  const rng = seeded(5);
  let hits = 0;
  const g = new ArcheryGame({ level: LEVELS[2], playerBot: LEVELS[0], rng, onEvent: (t) => { if (t === 'hit') hits++; } });
  let steps = 0;
  while (g.state !== 'over' && steps < 240 * 60 * 20) { g.step(); steps++; }
  ok(g.state === 'over', 'partida termina');
  ok(g.match.points[0].flat().length === 30 && g.match.points[1].flat().length === 30, '30 flechas de cada lado');
  ok(hits >= 60, 'eventos de acerto para todas as flechas');
  console.log(`  Fácil (jogador) ${g.match.total(0)} x ${g.match.total(1)} Difícil · ${(steps * DT / 60).toFixed(1)} min de jogo`);
}

console.log(fails ? `\n${fails} de ${count} verificações falharam.` : `\nTudo certo (${count} verificações).`);
process.exit(fails ? 1 : 0);
