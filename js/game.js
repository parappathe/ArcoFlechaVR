// Núcleo de uma partida: tempo, alvo atual, vento, flecha em voo, vez de quem e o
// computador atirando. Não depende de navegador: main.js liga à tela e os testes rodam
// computador contra computador com ele.
import { DT, makeArrow, flightStep } from './physics.js';
import { TARGETS, makeWinds, targetPos } from './targets.js';
import { cpuShot } from './cpu.js';
import { Match } from './match.js';

export const PLAYER_POS = { x: 0, y: 1.5, z: 0 };   // de onde sai a flecha no modo PC e nos testes
export const CPU_POS = { x: 2.2, y: 1.5, z: 0 };    // raia do computador, à direita

export class ArcheryGame {
  // level: adversário (LEVELS[i]). playerBot: outro nível controlando o jogador (só nos testes).
  constructor({ level, playerBot = null, rng = Math.random, arrows = 3, onEvent = null }) {
    this.level = level;
    this.bot = playerBot;
    this.rng = rng;
    this.onEvent = onEvent;
    this.match = new Match({ targets: TARGETS.length, arrows });
    this.winds = makeWinds(rng);
    this.time = 0;
    this.arrow = null;        // flecha voando
    this.arrowOwner = null;
    this.stuck = [];          // flechas paradas no alvo atual: {who, where, dx, dy, x, y, z, vx, vy, vz}
    this.last = null;         // resultado da última flecha
    this._tgt = {};
    this._enter('intro', 1.6);
    this.emit('targetStart', { index: 0 });
  }

  emit(type, data = {}) { this.onEvent?.(type, data); }

  get targetIndex() { return this.match.target; }
  get def() { return TARGETS[this.match.target]; }
  get wind() { return this.winds[this.match.target]; }
  get turn() { return this.match.turn; }
  targetNow() { return targetPos(this.def, this.time, this._tgt); }

  _enter(state, timer = 0) { this.state = state; this.timer = timer; }

  // O jogador humano pode atirar agora?
  canPlayerShoot() { return this.state === 'aim' && this.match.turn === 0 && !this.bot; }

  shoot(who, px, py, pz, vx, vy, vz) {
    if (this.state !== 'aim' || this.match.turn !== who) return false;
    this.arrow = makeArrow(px, py, pz, vx, vy, vz);
    this.arrowOwner = who;
    this._enter('flight');
    this.emit('shoot', { who, speed: Math.hypot(vx, vy, vz) });
    return true;
  }

  step() {
    this.time += DT;
    if (this.state === 'over') return;
    if (this.timer > 0) { this.timer -= DT; if (this.timer > 0) return; }

    switch (this.state) {
      case 'intro':
        this._enter('aim', this.match.turn === 1 || this.bot ? this._think() : 0);
        this.emit('turn', { who: this.match.turn, left: this.match.left });
        break;
      case 'aim': {
        // Vez de um robô (computador, ou o jogador nos testes): atira quando acaba de "pensar".
        const who = this.match.turn;
        const brain = who === 1 ? this.level : this.bot;
        if (!brain) break;
        const from = who === 1 ? CPU_POS : PLAYER_POS;
        const v = cpuShot(brain, from.x, from.y, from.z, this.def, this.time, this.wind, this.rng);
        this.shoot(who, from.x, from.y, from.z, v.x, v.y, v.z);
        break;
      }
      case 'flight': {
        const res = flightStep(this.arrow, DT, this.wind, this.time, this.targetNow());
        if (res) this._landed(res);
        break;
      }
      case 'result':
        this._next();
        break;
      case 'targetDone':
        this.stuck = [];
        this.emit('targetStart', { index: this.match.target });
        this._enter('intro', 1.2);
        break;
    }
  }

  _think() { const [a, b] = (this.match.turn === 1 ? this.level : this.bot).think; return a + (b - a) * this.rng(); }

  _landed(res) {
    const a = this.arrow, who = this.arrowOwner;
    const tie = !!this.match.tiebreak;
    this.stuck.push({ who, ...res, x: a.px, y: a.py, z: a.pz, vx: a.vx, vy: a.vy, vz: a.vz });
    this.arrow = null;
    this.last = { who, ...res };
    this.outcome = this.match.shot(who, res.points, res.dist);
    this.emit('hit', { who, ...res, tiebreak: tie });
    this._enter('result', this.outcome === 'next' ? 0.6 : this.outcome === 'switch' ? 1.2 : 2.4);
  }

  _next() {
    const o = this.outcome;
    if (o === 'over') { this._enter('over'); this.emit('over', { winner: this.match.winner }); return; }
    if (o === 'targetDone') { this._enter('targetDone'); this.emit('targetDone', { index: this.match.target - 1 }); return; }
    if (o === 'tiebreak') {
      this.stuck = [];
      this.emit('tiebreak', { round: this.match.tiebreak.round });
    }
    this._enter('aim', this.match.turn === 1 || this.bot ? this._think() : 0);
    this.emit('turn', { who: this.match.turn, left: this.match.tiebreak ? 1 : this.match.left });
  }
}
