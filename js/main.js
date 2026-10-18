// Liga o núcleo do jogo à tela, aos controles do Quest e ao mouse.
import * as THREE from '../vendor/three/three.module.js';
import { DT, speedForDraw, windAt } from './physics.js';
import { TARGETS } from './targets.js';
import { LEVELS, cpuShot } from './cpu.js';
import { ArcheryGame, PLAYER_POS, CPU_POS } from './game.js';
import { buildScene, buildTarget, makeArrow, makeBow, makeArcher } from './scene.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

const save = loadSave();
const sfx = new Sfx();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const PLAYER_FLETCH = 0xf2c518;

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildScene();
const scene = world.scene;
const rig = new THREE.Group();
scene.add(rig);
const BASE_FOV = 55;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.03, 400);
rig.add(camera);
const DESK_CAM = new THREE.Vector3(0, 1.6, 0.45);
const VR_HEAD_Z = 0.3;
const lookTarget = new THREE.Vector3(0, 1.4, -10);
function deskCamera() {
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.copy(DESK_CAM);
  camera.lookAt(lookTarget);
}
deskCamera();

const panel = new Panel(1.1);
panel.mesh.position.set(0, 1.45, -1.0);
scene.add(panel.mesh);
const fpsLabel = new Label(0.14);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);

const archer = makeArcher();
archer.group.position.set(CPU_POS.x + 0.12, 0, 0.6);
scene.add(archer.group);

const bow = makeBow();
scene.add(bow.group);

// ---------- Estado ----------
let app = 'menu';     // 'menu' | 'playing' | 'paused' | 'result'
let game = null;
let levelIndex = 0;
let screen = 'main';
let optionsBack = 'main';
let time = 0;
const board = { msg: '', sub: '' };
let target = null;            // visual do alvo atual {group, extras}
let shownTarget = 0;          // alvo que está na tela (o placar segue este)
const stuckMeshes = [];
const flyMesh = { player: makeArrow(PLAYER_FLETCH), cpu: makeArrow(LEVELS[0].color) };
flyMesh.player.visible = flyMesh.cpu.visible = false;
scene.add(flyMesh.player, flyMesh.cpu);
let lastResult = null;

// ---------- VR: controles ----------
const hands = { left: null, right: null };
const ctrls = [];
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl); rig.add(grip);
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xe2b04a }));
  laser.scale.z = 2; laser.visible = false;
  ctrl.add(laser);
  const entry = { ctrl, grip, laser, source: null, hand: null, prevButtons: [], hoverIndex: -1 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => {
    entry.source = e.data; entry.hand = e.data.handedness;
    if (entry.hand === 'left' || entry.hand === 'right') hands[entry.hand] = entry;
  });
  ctrl.addEventListener('disconnected', () => {
    if (entry.hand && hands[entry.hand] === entry) hands[entry.hand] = null;
    entry.source = null; entry.hand = null;
  });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
}
const bowHandName = () => save.bowHand === 'right' ? 'right' : 'left';
const stringHandName = () => save.bowHand === 'right' ? 'left' : 'right';
const stringHandMarker = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe8b48a }));
stringHandMarker.visible = false;
scene.add(stringHandMarker);

function pulse(handName, v, ms) {
  try { hands[handName]?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(v, ms); } catch { /* sem vibração */ }
}

function recenter() {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(-head.x, 0, VR_HEAD_Z - head.z);
}
let recenterIn = 0;
renderer.xr.addEventListener('sessionstart', () => { recenterIn = 5; camera.fov = BASE_FOV; updateHint(); });
renderer.xr.addEventListener('sessionend', () => { deskCamera(); vrDraw.active = false; sfx.creak(0); updateHint(); });

// ---------- Mouse (PC) ----------
const mouse = { ndc: new THREE.Vector2(0, 0), px: [window.innerWidth / 2, window.innerHeight / 2], down: false };
const deskDraw = { active: false, start: 0, amount: 0 };
const raycaster = new THREE.Raycaster();
const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

function setMouse(e) {
  mouse.px = [e.clientX, e.clientY];
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
}
renderer.domElement.addEventListener('pointermove', setMouse);
renderer.domElement.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  setMouse(e);
  mouse.down = true;
  if (panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    doAction(panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv)));
    return;
  }
  if (app === 'playing' && game?.canPlayerShoot()) { deskDraw.active = true; deskDraw.start = time; }
});
window.addEventListener('pointerup', () => {
  mouse.down = false;
  if (!deskDraw.active) return;
  deskDraw.active = false;
  sfx.creak(0);
  if (deskDraw.amount > 0.08 && game?.canPlayerShoot()) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const d = raycaster.ray.direction;
    camera.getWorldPosition(tmpV);
    const v = speedForDraw(deskDraw.amount);
    game.shoot(0, tmpV.x + d.x * 0.3, tmpV.y - 0.06 + d.y * 0.3, tmpV.z + d.z * 0.3, d.x * v, d.y * v, d.z * v);
  }
  deskDraw.amount = 0;
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') togglePause();
  if (e.key === 'f' || e.key === 'F') { save.fps = !save.fps; storeSave(save); }
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- VR: arco e corda ----------
const vrDraw = { active: false, amount: 0, pull: 0, hapticT: 0 };
const P_b = new THREE.Vector3(), P_s = new THREE.Vector3(), head = new THREE.Vector3();
const fwd = new THREE.Vector3(), up = new THREE.Vector3(), xAxis = new THREE.Vector3(), zAxis = new THREE.Vector3();
const basis = new THREE.Matrix4();
const restNock = new THREE.Vector3();

function updateVRBow(dt) {
  const be = hands[bowHandName()], se = hands[stringHandName()];
  bow.group.visible = !!be;
  stringHandMarker.visible = !!se;
  if (se) { se.grip.getWorldPosition(P_s); stringHandMarker.position.copy(P_s); }
  if (!be) return;
  be.grip.getWorldPosition(P_b);
  be.grip.getWorldQuaternion(tmpQ);
  up.set(0, 0, -1).applyQuaternion(tmpQ); // eixo -Z do controle = ao longo do que a mão segura
  if (vrDraw.active && se) fwd.subVectors(P_b, P_s).normalize();
  else {
    camera.getWorldPosition(head);
    fwd.subVectors(P_b, head);
    fwd.y *= 0.3;
    fwd.normalize();
  }
  up.addScaledVector(fwd, -up.dot(fwd));
  if (up.lengthSq() < 1e-4) up.set(0, 1, 0).addScaledVector(fwd, -fwd.y);
  up.normalize();
  zAxis.copy(fwd).negate();
  xAxis.crossVectors(up, zAxis);
  basis.makeBasis(xAxis, up, zAxis);
  bow.group.position.copy(P_b);
  bow.group.quaternion.setFromRotationMatrix(basis);

  const canShoot = app === 'playing' && !!game?.canPlayerShoot() && !panel.visible;
  const trig = !!se?.source?.gamepad?.buttons?.[0]?.pressed;
  restNock.copy(P_b).addScaledVector(zAxis, bow.BRACE);
  if (!vrDraw.active && trig && !vrDraw.trigWas && canShoot && se && P_s.distanceTo(restNock) < 0.22) {
    vrDraw.active = true;
    pulse(stringHandName(), 0.4, 30);
  }
  vrDraw.trigWas = trig;
  if (vrDraw.active) {
    tmpV.subVectors(P_s, P_b);
    vrDraw.pull = clamp(tmpV.dot(zAxis) - bow.BRACE, 0, 0.7);
    vrDraw.amount = clamp(vrDraw.pull / 0.6, 0, 1);
    bow.setDraw(vrDraw.pull, true);
    sfx.creak(vrDraw.amount);
    vrDraw.hapticT -= dt;
    if (vrDraw.hapticT <= 0) {
      vrDraw.hapticT = 0.08;
      pulse(stringHandName(), 0.08 + vrDraw.amount * 0.5, 60);
      pulse(bowHandName(), vrDraw.amount * 0.25, 60);
    }
    if (!trig) {
      vrDraw.active = false;
      sfx.creak(0);
      if (vrDraw.amount > 0.08 && game?.canPlayerShoot()) {
        const v = speedForDraw(vrDraw.amount);
        tmpV.copy(P_b).addScaledVector(fwd, 0.05);
        game.shoot(0, tmpV.x, tmpV.y, tmpV.z, fwd.x * v, fwd.y * v, fwd.z * v);
        pulse(stringHandName(), 1, 90);
        pulse(bowHandName(), 0.7, 90);
      }
    }
  } else bow.setDraw(0, canShoot);
}

// ---------- Partida ----------
function startMatch(i) {
  levelIndex = i;
  const lv = LEVELS[i];
  archer.setLook(lv);
  scene.remove(flyMesh.cpu);
  flyMesh.cpu = makeArrow(lv.color); flyMesh.cpu.visible = false; scene.add(flyMesh.cpu);
  game = new ArcheryGame({ level: lv, onEvent });
  app = 'playing';
  panel.hide();
  onEvent('targetStart', { index: 0 });
  updateHint();
}

function clearStuck() {
  for (const m of stuckMeshes) m.parent?.remove(m);
  stuckMeshes.length = 0;
}

function showTarget(index) {
  shownTarget = index;
  if (target) { world.targetRoot.remove(target.group); scene.remove(target.extras); }
  clearStuck();
  target = buildTarget(TARGETS[index]);
  world.targetRoot.add(target.group);
  scene.add(target.extras);
  const def = TARGETS[index];
  lookTarget.set(0, def.y + Math.min(1.2, def.dist * 0.02), -def.dist);
  if (!renderer.xr.isPresenting) camera.lookAt(lookTarget);
}

const Z_NEG = new THREE.Vector3(0, 0, -1);
function addStuck(s) {
  const lv = LEVELS[levelIndex];
  const m = makeArrow(s.who === 0 ? PLAYER_FLETCH : lv.color);
  const dir = new THREE.Vector3(s.vx, s.vy, s.vz).normalize();
  if (s.where === 'face' || s.where === 'bale') {
    const a = target.group.rotation.z;
    const lx = s.dx * Math.cos(a) + s.dy * Math.sin(a), ly = -s.dx * Math.sin(a) + s.dy * Math.cos(a);
    dir.applyAxisAngle(new THREE.Vector3(0, 0, 1), -a);
    m.quaternion.setFromUnitVectors(Z_NEG, dir);
    m.position.set(lx, ly, 0).addScaledVector(dir, 0.12);
    target.group.add(m);
  } else if (s.where === 'ground') {
    m.quaternion.setFromUnitVectors(Z_NEG, dir);
    m.position.set(s.x, s.y, s.z).addScaledVector(dir, 0.15);
    scene.add(m);
  } else return;
  stuckMeshes.push(m);
}

function windText(w) {
  if (!w) return 'Sem vento';
  const s = Math.hypot(w.x, w.z);
  return `Vento ${w.x > 0 ? '→' : '←'} ${s.toFixed(1)} m/s${w.gust ? ' (rajadas)' : ''}`;
}

function drawBoard() {
  const lv = LEVELS[levelIndex];
  if (!game) {
    world.board.draw({ title: 'Arco e Flecha', windText: '', msg: board.msg, sub: board.sub, current: -1 });
    return;
  }
  const m = game.match;
  const i = shownTarget;
  const cur = (side) => {
    const a = m.points[side][i];
    return a.length ? a.join(' · ') : '—';
  };
  world.board.draw({
    title: m.tiebreak ? 'Desempate' : `Alvo ${i + 1} de 10 · ${TARGETS[i].name}`,
    windText: windText(game.wind),
    points: m.points, totals: [m.total(0), m.total(1)], current: i,
    cpuName: lv.name, cpuColor: '#' + lv.color.toString(16).padStart(6, '0'),
    arrowsLine: m.tiebreak ? 'Uma flecha cada: ganha quem chegar mais perto do centro' : `Neste alvo: Você ${cur(0)}   ·   ${lv.name} ${cur(1)}`,
    msg: board.msg, sub: board.sub,
  });
}

function onEvent(type, d) {
  const lv = LEVELS[levelIndex];
  switch (type) {
    case 'targetStart':
      showTarget(d.index);
      board.msg = `Alvo ${d.index + 1}: ${TARGETS[d.index].dist} m`;
      board.sub = TARGETS[d.index].move ? 'Este alvo se mexe' : '';
      break;
    case 'turn':
      board.msg = d.who === 0 ? `Sua vez: ${d.left} ${d.left === 1 ? 'flecha' : 'flechas'}` : `Vez de ${lv.name}`;
      board.sub = d.who === 0 ? (renderer.xr.isPresenting ? 'Gatilho perto da corda, puxe e solte' : 'Segure o botão do mouse, mire e solte') : '';
      break;
    case 'shoot': sfx.release(d.who === 1 ? 0.6 : 0); sfx.whoosh(d.who === 1 ? 0.6 : 0); break;
    case 'hit': {
      const s = game.stuck[game.stuck.length - 1];
      addStuck(s);
      const name = d.who === 0 ? 'Você' : lv.name;
      if (d.where === 'face') { sfx.thunk(clamp(s.x / 3, -1, 1)); if (d.points === 10) sfx.bullseye(); }
      else if (d.where === 'bale') sfx.thunk(0);
      else sfx.thud(0);
      board.msg = d.where === 'face' ? (d.points === 10 ? `${name}: 10, na mosca!` : `${name}: ${d.points}`) : `${name}: errou o alvo`;
      board.sub = d.tiebreak && d.where === 'face' ? `${(d.dist * 100).toFixed(1)} cm do centro` : '';
      break;
    }
    case 'targetDone': {
      const m = game.match;
      board.msg = `Alvo ${d.index + 1}: Você ${m.targetTotal(0, d.index)} x ${m.targetTotal(1, d.index)} ${lv.name}`;
      board.sub = `Total: ${m.total(0)} x ${m.total(1)}`;
      break;
    }
    case 'tiebreak':
      clearStuck();
      board.msg = 'Empate! Desempate';
      board.sub = 'Uma flecha cada no último alvo';
      break;
    case 'over': {
      const m = game.match;
      const won = d.winner === 0;
      const id = lv.id;
      if (won) save.wins[id] = (save.wins[id] || 0) + 1;
      save.best[id] = Math.max(save.best[id] || 0, m.total(0));
      storeSave(save);
      lastResult = { won, level: levelIndex, totals: [m.total(0), m.total(1)], tiebreak: !!m.tiebreak };
      board.msg = won ? 'Vitória!' : `${lv.name} venceu`;
      board.sub = `${m.total(0)} x ${m.total(1)}`;
      sfx.fanfare(won);
      if (won) sfx.cheer();
      setTimeout(() => { if (app === 'playing') { app = 'result'; showScreen('result'); } }, 1800);
      break;
    }
  }
  drawBoard();
}

function togglePause() {
  if (app === 'playing') { app = 'paused'; deskDraw.active = false; vrDraw.active = false; sfx.creak(0); showScreen('pause'); }
  else if (app === 'paused' && screen === 'pause') { app = 'playing'; panel.hide(); }
}

// ---------- Telas do menu ----------
const PW = 1024;
function showScreen(name) { screen = name; panel.show((p) => SCREENS[name](p)); updateHint(); }

const SCREENS = {
  main(p) {
    p.title('Arco e Flecha', 58);
    p.text('10 alvos, 3 flechas em cada. Quem somar mais pontos vence.', PW / 2, 108, { size: 26, color: '#c3b08d' });
    LEVELS.forEach((lv, i) => {
      const w = save.wins[lv.id] || 0, best = save.best[lv.id];
      p.row(140 + i * 104, {
        num: i + 1, name: `${lv.name} · ${lv.title}`, style: lv.title, desc: lv.desc,
        status: w ? 'beaten' : 'open', action: 'play:' + i, color: '#' + lv.color.toString(16).padStart(6, '0'),
        tag: w ? `★ ${w} ${w === 1 ? 'vitória' : 'vitórias'}${best != null ? ` · recorde ${best}` : ''}` : (best != null ? `recorde ${best}` : 'Jogar ▶'),
      });
    });
    const vr = renderer.xr.isPresenting;
    p.text(vr ? 'Arco na mão ' + (save.bowHand === 'left' ? 'esquerda' : 'direita') + '. Aperte o gatilho com a outra mão perto da corda, puxe e solte.'
      : 'PC: segure o botão do mouse para puxar, mire e solte. No Quest, use "Entrar em VR".', PW / 2, 470, { size: 22, color: '#c3b08d' });
    p.button('Opções', 'options', PW / 2 - 160, 560, 320, 76);
  },
  options(p) {
    p.title('Opções', 58);
    const line = (y, label, items, current, key) => {
      p.text(label, 50, y + 34, { size: 30, align: 'left', bold: true });
      const x0 = 420, w = (PW - 50 - x0 - (items.length - 1) * 10) / items.length;
      items.forEach(([val, txt], i) => p.button(txt, `set:${key}:${val}`, x0 + i * (w + 10), y, w, 68, { on: String(current) === String(val), size: 28 }));
    };
    line(140, 'Mão do arco', [['left', 'Esquerda'], ['right', 'Direita']], save.bowHand, 'bowHand');
    line(240, 'Mostrar FPS', [[1, 'Sim'], [0, 'Não']], save.fps ? 1 : 0, 'fps');
    p.text('A outra mão puxa a corda (VR).', PW / 2, 380, { size: 24, color: '#c3b08d' });
    p.button('Voltar', 'back', PW / 2 - 160, 560, 320, 76, { on: true });
  },
  pause(p) {
    p.title('Pausa', 70);
    p.text(`Você ${game.match.total(0)} x ${game.match.total(1)} ${LEVELS[levelIndex].name}`, PW / 2, 140, { size: 36 });
    const vr = renderer.xr.isPresenting;
    const items = [['Continuar', 'resume'], ...(vr ? [['Recentralizar', 'recenter']] : []), ['Opções', 'options'], ['Desistir da partida', 'quit']];
    items.forEach(([t, a], i) => p.button(t, a, PW / 2 - 230, 200 + i * 104, 460, 84, { on: i === 0 }));
  },
  result(p) {
    const r = lastResult, lv = LEVELS[r.level];
    p.title(r.won ? 'Vitória!' : 'Derrota', 90);
    p.text(`Você ${r.totals[0]} x ${r.totals[1]} ${lv.name}`, PW / 2, 180, { size: 44 });
    p.text(r.tiebreak ? 'Decidido no desempate.' : r.won ? `Você venceu no nível ${lv.title}.` : 'Tente de novo: o vento muda a cada partida.', PW / 2, 240, { size: 28, color: '#c3b08d' });
    const btns = [];
    if (r.won && r.level < LEVELS.length - 1) btns.push([`Próximo nível: ${LEVELS[r.level + 1].title}`, 'play:' + (r.level + 1)]);
    btns.push([r.won ? 'Jogar de novo' : 'Tentar de novo', 'play:' + r.level]);
    btns.push(['Menu', 'menu']);
    btns.forEach(([t, a], i) => p.button(t, a, PW / 2 - 260, 310 + i * 110, 520, 88, { on: i === 0 }));
  },
};

function doAction(a) {
  if (!a) return;
  sfx.unlock();
  sfx.click();
  if (a.startsWith('play:')) { startMatch(Number(a.slice(5))); return; }
  if (a.startsWith('set:')) {
    const [, key, val] = a.split(':');
    if (key === 'bowHand') save.bowHand = val;
    else if (key === 'fps') save.fps = val === '1';
    storeSave(save);
    showScreen('options');
    return;
  }
  switch (a) {
    case 'options': optionsBack = screen; showScreen('options'); break;
    case 'back': showScreen(optionsBack === 'options' ? 'main' : optionsBack); break;
    case 'menu': case 'quit': goMenu(); break;
    case 'resume': app = 'playing'; panel.hide(); updateHint(); break;
    case 'recenter': recenter(); break;
  }
}

function goMenu() {
  app = 'menu';
  game = null;
  clearStuck();
  if (!target) showTarget(1);
  board.msg = 'Escolha um adversário';
  board.sub = '';
  drawBoard();
  showScreen('main');
}

function onSelect(entry) {
  sfx.unlock();
  if (panel.visible && entry.hoverIndex >= 0) doAction(panel.actionAt(entry.hoverIndex));
}

function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp) continue;
    if (gp.buttons[5]?.pressed && !e.prevButtons[5]) togglePause();
    e.prevButtons = gp.buttons.map(b => b.pressed);
  }
}

// ---------- Raio do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = vr && panel.visible && !!e.source;
    if (!e.laser.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(tmpQ);
    rayDir.set(0, 0, -1).applyQuaternion(tmpQ);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.scale.z = hit ? hit.distance : 2;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else renderer.domElement.style.cursor = app === 'playing' && !vr ? 'none' : 'default';
  if (panel.visible) panel.setHover(hover);
}

// ---------- HTML (PC) ----------
const hintEl = document.getElementById('hint');
const fpsEl = document.getElementById('fps');
const crossEl = document.getElementById('cross');
const powerEl = document.getElementById('power');
const powerFill = powerEl.firstElementChild;
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.textContent = app === 'playing'
    ? 'Segure o botão do mouse para puxar a corda, mire e solte · Esc pausa'
    : 'Clique nas opções do painel · No Quest, use o botão "Entrar em VR"';
}

const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now();
let fpsFrames = 0, fpsTime = 0;
const tPos = {};

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  pollButtons();
  if (dev.autoplay) autoplay();

  // Arco do jogador
  if (vr && bow.group.parent === camera) { scene.add(bow.group); bow.group.scale.setScalar(1); }
  if (vr) updateVRBow(dt);
  else {
    if (bow.group.parent !== camera) { camera.add(bow.group); bow.group.position.set(-0.17, -0.13, -0.5); bow.group.rotation.set(0, 0.12, 0.22); bow.group.scale.setScalar(0.35); bow.group.visible = true; }
    if (deskDraw.active) {
      deskDraw.amount = clamp((time - deskDraw.start) / 1.0, 0, 1);
      sfx.creak(deskDraw.amount);
    }
    const canShoot = app === 'playing' && !!game?.canPlayerShoot();
    bow.setDraw(deskDraw.amount * 0.35, canShoot);
    // Zoom de mira enquanto puxa
    const def = game ? game.def : null;
    const zoomFov = def ? THREE.MathUtils.radToDeg(2 * Math.atan(2.5 / def.dist)) : BASE_FOV;
    const k = deskDraw.amount * deskDraw.amount * (3 - 2 * deskDraw.amount);
    const fov = lerp(BASE_FOV, Math.min(BASE_FOV, zoomFov), k);
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    crossEl.style.display = canShoot && !panel.visible ? 'block' : 'none';
    crossEl.style.transform = `translate(${mouse.px[0]}px, ${mouse.px[1]}px)`;
    powerEl.style.display = deskDraw.active ? 'block' : 'none';
    powerFill.style.width = `${Math.round(deskDraw.amount * 100)}%`;
  }

  // Jogo
  if (app === 'playing' && game) {
    acc += dt;
    const n = Math.min(16, Math.floor(acc / DT));
    for (let i = 0; i < n; i++) game.step();
    acc -= n * DT;
  } else acc = 0;

  // Alvo, flecha voando, arqueiro e vento
  if (game && target) {
    game.targetNow();
    const p = game._tgt;
    target.group.position.set(p.x, p.y, p.z);
    target.group.rotation.z = p.angle || 0;
  } else if (target) {
    const def = TARGETS[1];
    target.group.position.set(0, def.y, -def.dist);
  }
  flyMesh.player.visible = flyMesh.cpu.visible = false;
  if (game?.arrow) {
    const a = game.arrow, m = game.arrowOwner === 0 ? flyMesh.player : flyMesh.cpu;
    m.visible = true;
    m.position.set(a.px, a.py, a.pz);
    tmpV.set(a.vx, a.vy, a.vz).normalize();
    m.quaternion.setFromUnitVectors(Z_NEG, tmpV);
  }
  let cpuDraw = 0, cpuNocked = false;
  if (game && game.match.turn === 1) {
    cpuNocked = game.state === 'aim';
    if (game.state === 'aim') cpuDraw = clamp(1 - game.timer / 1.1, 0, 1);
  }
  archer.pose(cpuDraw, cpuNocked);
  const tdef = game ? game.def : TARGETS[1];
  archer.group.rotation.y = Math.atan2(CPU_POS.x - (game ? game._tgt.x || 0 : 0), tdef.dist);
  world.wind.update(game ? windAt(game.wind, game.time) : { x: 0, z: 0 }, tdef.dist, time);

  updateMenuRays();

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
  renderer.render(scene, camera);
}

// Para testes no console: ppvr.startMatch(0); ppvr.dev.autoplay = true; ppvr.dev.advance(60)
const dev = { autoplay: false };
function autoplay() {
  if (!game?.canPlayerShoot()) return;
  const v = cpuShot(LEVELS[1], PLAYER_POS.x, PLAYER_POS.y, PLAYER_POS.z, game.def, game.time, game.wind);
  game.shoot(0, PLAYER_POS.x, PLAYER_POS.y, PLAYER_POS.z, v.x, v.y, v.z);
}
dev.advance = (sec) => { for (let i = 0; i < sec * 72; i++) { lastT = performance.now() - 1000 / 72; frame(); } };
window.ppvr = { get game() { return game; }, save, startMatch, doAction, dev, camera };

goMenu();
renderer.setAnimationLoop(frame);
