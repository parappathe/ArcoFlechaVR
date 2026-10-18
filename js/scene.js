// Cenário: campo de tiro com arco ao ar livre, alvos, arco, flechas, placar de madeira,
// bandeiras de vento e o arqueiro do computador. Tudo gerado por código.
import * as THREE from '../vendor/three/three.module.js';
import { BALE, ARROW } from './physics.js';
import { SWING_LEN } from './targets.js';

const SKY_TOP = 0x5c9fe0, SKY_HORIZON = 0xd9ecf7, GRASS = 0x5f9b3c;

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return { tex: t, canvas: c, ctx: g };
}

// Rng fixo para o cenário ser sempre igual.
function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_HORIZON);
  scene.fog = new THREE.Fog(SKY_HORIZON, 60, 170);

  // Céu em degradê (esfera por dentro).
  const skyGeo = new THREE.SphereGeometry(190, 24, 12);
  const top = new THREE.Color(SKY_TOP), hor = new THREE.Color(SKY_HORIZON);
  const cols = [];
  const pos = skyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, pos.getY(i) / 190);
    const c = hor.clone().lerp(top, Math.pow(k, 0.6));
    cols.push(c.r, c.g, c.b);
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));

  scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a2a, 1.5));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-20, 30, 10);
  scene.add(sun);

  // Grama com faixas de corte.
  const grass = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5f9b3c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#679f43'; g.fillRect(0, 0, w, h / 2);
    for (let i = 0; i < 1800; i++) {
      g.fillStyle = `rgba(${30 + Math.random() * 40},${80 + Math.random() * 60},20,0.25)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
  }, [40, 40]);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ map: grass.tex }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Linha de tiro, tapetes das raias e marcos de distância.
  const white = new THREE.MeshLambertMaterial({ color: 0xf4f1e8 });
  const line = new THREE.Mesh(new THREE.BoxGeometry(9, 0.01, 0.08), white);
  line.position.set(1, 0.005, -0.15);
  scene.add(line);
  const matMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
  for (const x of [0, 2.2]) {
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 1.4), matMat);
    mat.position.set(x, 0.02, 0.55);
    scene.add(mat);
  }
  const wood = new THREE.MeshLambertMaterial({ color: 0x8b5e34 });
  for (const d of [10, 20, 30, 40]) {
    const sign = canvasTex(128, 96, (g, w, h) => {
      g.fillStyle = '#f4f1e8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#2b2b2b'; g.font = 'bold 60px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(`${d}m`, w / 2, h / 2 + 4);
    });
    for (const x of [-3.2, 5.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), wood);
      post.position.set(x, 0.35, -d);
      scene.add(post);
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.37), new THREE.MeshLambertMaterial({ map: sign.tex }));
      plate.position.set(x, 0.85, -d + 0.04);
      scene.add(plate);
    }
  }

  // Muro de proteção atrás dos alvos.
  const wallTex = canvasTex(512, 128, (g, w, h) => {
    g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 32) { g.fillStyle = x % 64 ? '#74512f' : '#664527'; g.fillRect(x, 0, 30, h); }
  }, [6, 1]);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(30, 4, 0.4), new THREE.MeshLambertMaterial({ map: wallTex.tex }));
  wall.position.set(1, 2, -52);
  scene.add(wall);

  // Árvores (instanciadas) e morros ao longe.
  const r = rand(42);
  const spots = [];
  for (let i = 0; i < 160; i++) {
    const side = r() < 0.5 ? -1 : 1;
    let x, z;
    if (r() < 0.65) { x = side * (12 + r() * 40); z = 15 - r() * 90; }
    else { x = (r() - 0.5) * 100; z = -56 - r() * 40; }
    spots.push({ x, z, s: 0.8 + r() * 0.7 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 2, 6); trunkGeo.translate(0, 1, 0);
  const crownGeo = new THREE.ConeGeometry(1.6, 4.2, 7); crownGeo.translate(0, 4, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x5a3d22 }), spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
  const o = new THREE.Object3D(), col = new THREE.Color();
  spots.forEach((p, i) => {
    o.position.set(p.x, 0, p.z); o.scale.setScalar(p.s); o.rotation.y = r() * 6; o.updateMatrix();
    trunks.setMatrixAt(i, o.matrix); crowns.setMatrixAt(i, o.matrix);
    crowns.setColorAt(i, col.setHSL(0.27 + r() * 0.08, 0.45, 0.22 + r() * 0.1));
  });
  scene.add(trunks, crowns);
  const hillMat = new THREE.MeshLambertMaterial({ color: 0x6f9a55 });
  for (const [x, z, s] of [[-70, -120, 40], [10, -140, 55], [80, -110, 38], [-120, -40, 45], [130, -30, 50]]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    h.scale.y = 0.35; h.position.set(x, -1, z);
    scene.add(h);
  }

  // Bandeiras de vento: uma perto de você e duas perto do alvo.
  const flags = [];
  const flagMat = new THREE.MeshLambertMaterial({ color: 0xe8432e, side: THREE.DoubleSide });
  const addFlag = (x, z) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 6), white);
    pole.position.y = 1.5;
    g.add(pole);
    const pivot = new THREE.Group();
    pivot.position.y = 2.95;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.45, 6, 1), flagMat);
    cloth.position.set(0.4, -0.22, 0);
    pivot.add(cloth);
    g.add(pivot);
    scene.add(g);
    flags.push({ g, pivot, cloth, base: cloth.geometry.attributes.position.array.slice() });
  };
  addFlag(-1.8, -9);
  const farFlags = [];
  for (const x of [-3, 3]) { addFlag(x, -20); farFlags.push(flags[flags.length - 1]); }
  const windApi = {
    // w = {x, z} vento atual (m/s); dist = distância do alvo (as bandeiras de lá vão junto)
    update(w, dist, time) {
      for (const f of farFlags) f.g.position.z = -dist + 1.5;
      const s = Math.hypot(w.x, w.z);
      flags.forEach((f, k) => {
        const lift = Math.min(1, s / 4);
        const yaw = Math.atan2(-w.z, w.x);
        f.pivot.rotation.set(0, s > 0.05 ? yaw : 0, -(1 - lift) * 1.35);
        const p = f.cloth.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x0 = f.base[i * 3];
          p.setZ(i, Math.sin(time * (4 + s * 2) - x0 * 6 + k) * 0.05 * (x0 + 0.4) * (0.3 + lift));
        }
        p.needsUpdate = true;
      });
    },
  };

  // Placar de madeira.
  const board = canvasTex(1024, 640, () => {});
  const boardGroup = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 2.15, 0.12), wood);
  boardGroup.add(frame);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 1.94), new THREE.MeshBasicMaterial({ map: board.tex }));
  face.position.z = 0.065;
  boardGroup.add(face);
  for (const x of [-1.3, 1.3]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), wood);
    leg.position.set(x, -1.9, -0.05);
    boardGroup.add(leg);
  }
  boardGroup.position.set(4.6, 3.1, -8.5);
  boardGroup.rotation.y = -0.45;
  scene.add(boardGroup);

  // Alvo atual.
  const targetRoot = new THREE.Group();
  scene.add(targetRoot);

  return {
    scene, wind: windApi, targetRoot,
    board: { draw(info) { drawBoard(board.ctx, info); board.tex.needsUpdate = true; } },
  };
}

// Face do alvo (anéis oficiais) — uma textura só, reaproveitada.
let faceTex = null;
function targetFace() {
  if (faceTex) return faceTex;
  faceTex = canvasTex(512, 512, (g, w) => {
    const c = w / 2;
    const rings = ['#f4f1e8', '#f4f1e8', '#222222', '#222222', '#2f7fd1', '#2f7fd1', '#d9332b', '#d9332b', '#f2c518', '#f2c518'];
    for (let i = 0; i < 10; i++) {
      const rad = c * (10 - i) / 10;
      g.beginPath(); g.arc(c, c, rad, 0, Math.PI * 2);
      g.fillStyle = rings[i]; g.fill();
      g.lineWidth = 2; g.strokeStyle = i === 2 || i === 3 ? '#f4f1e8' : '#222'; g.stroke();
    }
    g.fillStyle = '#222'; g.fillRect(c - 6, c - 1, 12, 2); g.fillRect(c - 1, c - 6, 2, 12);
  }).tex;
  return faceTex;
}

// Monta o alvo (face + fardo de feno + suporte). Origem do grupo = centro da face.
export function buildTarget(def) {
  const g = new THREE.Group();
  const r = def.r;
  const side = r * BALE * 2;
  const strawTex = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#d8b65a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      c.strokeStyle = `rgba(${150 + Math.random() * 60},${110 + Math.random() * 50},40,0.6)`;
      c.beginPath(); const x = Math.random() * w, y = Math.random() * h;
      c.moveTo(x, y); c.lineTo(x + (Math.random() - 0.5) * 16, y + (Math.random() - 0.5) * 6); c.stroke();
    }
  });
  const bale = new THREE.Mesh(new THREE.BoxGeometry(side, side, 0.45), new THREE.MeshLambertMaterial({ map: strawTex.tex }));
  bale.position.z = -0.23;
  g.add(bale);
  const face = new THREE.Mesh(new THREE.CircleGeometry(r, 48), new THREE.MeshLambertMaterial({ map: targetFace() }));
  face.position.z = 0.002;
  g.add(face);
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const extras = new THREE.Group(); // partes que não se movem com o alvo
  if (!def.move || def.move.type === 'slide') {
    const legH = def.y - side / 2;
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, legH + 0.1, 0.08), wood);
      leg.position.set(sx * side * 0.35, -side / 2 - legH / 2, -0.3);
      g.add(leg);
    }
    if (def.move) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(def.move.amp * 2 + side + 0.6, 0.1, 0.25), new THREE.MeshLambertMaterial({ color: 0x555555 }));
      rail.position.set(0, 0.05, -def.dist - 0.3);
      extras.add(rail);
    }
  } else {
    // Pêndulo: pórtico com a corda.
    const pivotY = def.y + SWING_LEN;
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, pivotY + 0.2, 0.14), wood);
      post.position.set(sx * (def.move.amp + side), (pivotY + 0.2) / 2, -def.dist - 0.25);
      extras.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry((def.move.amp + side) * 2 + 0.3, 0.14, 0.14), wood);
    beam.position.set(0, pivotY + 0.1, -def.dist - 0.25);
    extras.add(beam);
    const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, SWING_LEN - side / 2, 6), new THREE.MeshLambertMaterial({ color: 0xcbb98a }));
    rope.position.set(0, side / 2 + (SWING_LEN - side / 2) / 2, -0.23);
    g.add(rope);
  }
  return { group: g, extras };
}

// Flecha: ponta na origem, haste para +Z (aponta para -Z).
export function makeArrow(fletch = 0xf2c518) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, ARROW.len, 6), new THREE.MeshLambertMaterial({ color: 0xd9c8a0 }));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = ARROW.len / 2;
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.04, 6), new THREE.MeshLambertMaterial({ color: 0x555555 }));
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.01;
  g.add(tip);
  const fm = new THREE.MeshLambertMaterial({ color: fletch, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const vane = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.09), fm);
    vane.position.set(0, 0.016, ARROW.len - 0.07);
    vane.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.rotation.z = i * Math.PI * 2 / 3;
    holder.add(vane);
    g.add(holder);
  }
  return g;
}

// Arco: punho na origem, flecha sai para -Z, corda atrás (+Z), pontas em ±Y.
export function makeBow(color = 0x6b3f1f) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const riser = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.32, 0.045), mat);
  g.add(riser);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.05), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  g.add(grip);
  const H = 0.64, BRACE = 0.2;
  for (const s of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, s * 0.15, 0), new THREE.Vector3(0, s * 0.45, -0.05), new THREE.Vector3(0, s * H, BRACE));
    const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.012, 5), mat);
    g.add(limb);
  }
  const strGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, H, BRACE), new THREE.Vector3(0, 0, BRACE), new THREE.Vector3(0, -H, BRACE)]);
  const string = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: 0xf4f1e8 }));
  g.add(string);
  const arrow = makeArrow();
  arrow.visible = false;
  g.add(arrow);
  return {
    group: g, arrow, H, BRACE,
    // pull: quanto a corda está puxada para trás (m). Mostra a flecha encaixada se nocked.
    setDraw(pull, nocked) {
      const p = string.geometry.attributes.position;
      p.setZ(1, BRACE + pull);
      p.needsUpdate = true;
      arrow.visible = nocked;
      arrow.position.set(0, 0, BRACE + pull - ARROW.len);
    },
  };
}

// Arqueiro do computador (na raia ao lado).
export function makeArcher() {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0b090 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x3b3326 });
  const hatMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.7, 3, 8), pants);
    leg.position.set(sx * 0.12, 0.45, 0);
    g.add(leg);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 10), shirt);
  torso.position.y = 1.22;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), skin);
  head.position.y = 1.64;
  g.add(head);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 16), hatMat);
  brim.position.y = 1.72;
  g.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.14, 12), hatMat);
  crown.position.y = 1.8;
  g.add(crown);
  // Braço do arco esticado para a frente, arco na mão.
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.55, 3, 6), skin);
  armL.rotation.x = Math.PI / 2;
  armL.position.set(-0.12, 1.42, -0.32);
  g.add(armL);
  const bow = makeBow(0x3d2a1a);
  bow.group.position.set(-0.12, 1.45, -0.62);
  g.add(bow.group);
  const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.4, 3, 6), skin);
  armR.rotation.x = Math.PI / 2;
  g.add(armR);
  return {
    group: g, bow,
    setLook(lv) { shirt.color.setHex(lv.color); skin.color.setHex(lv.skin); hatMat.color.setHex(lv.hat); },
    // draw 0..1 (puxando a corda); nocked: flecha no arco
    pose(draw, nocked) {
      const pull = draw * 0.55;
      bow.setDraw(pull, nocked);
      armR.position.set(-0.1, 1.45, (-0.62 + bow.BRACE + pull) / 2);
    },
  };
}

function drawBoard(g, info) {
  const w = 1024, h = 640;
  g.fillStyle = '#efe4c8'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#8b5e34'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
  g.textBaseline = 'middle';
  g.fillStyle = '#3b2a17'; g.font = 'bold 44px sans-serif'; g.textAlign = 'left';
  g.fillText(info.title || '', 36, 50);
  g.textAlign = 'left'; g.font = 'bold 30px sans-serif'; g.fillStyle = '#8b3a1a';
  g.fillText(info.windText || '', 36, 96);
  // Tabela: nomes + 10 alvos + total
  const x0 = 230, cw = 62, y0 = 145;
  g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#6b5236';
  for (let i = 0; i < 10; i++) {
    if (i === info.current) { g.fillStyle = 'rgba(242,197,24,0.45)'; g.fillRect(x0 + i * cw, y0 - 24, cw, 175); g.fillStyle = '#6b5236'; }
    g.fillText(String(i + 1), x0 + i * cw + cw / 2, y0);
  }
  g.fillText('TOTAL', x0 + 10 * cw + 70, y0);
  const row = (y, name, pts, total, color) => {
    g.fillStyle = color; g.fillRect(28, y - 30, 12, 60);
    g.fillStyle = '#2b1f12'; g.font = 'bold 32px sans-serif'; g.textAlign = 'left';
    g.fillText(name, 52, y);
    g.textAlign = 'center'; g.font = 'bold 30px sans-serif';
    for (let i = 0; i < 10; i++) {
      const a = pts[i];
      if (a && a.length) g.fillText(String(a.reduce((s, x) => s + x, 0)), x0 + i * cw + cw / 2, y);
    }
    g.font = 'bold 44px sans-serif'; g.fillStyle = '#8b3a1a';
    g.fillText(String(total), x0 + 10 * cw + 70, y);
  };
  row(205, 'Você', info.points?.[0] || [], info.totals?.[0] ?? 0, '#f2c518');
  row(278, info.cpuName || 'CPU', info.points?.[1] || [], info.totals?.[1] ?? 0, info.cpuColor || '#888');
  g.strokeStyle = '#c9b48a'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(28, 328); g.lineTo(w - 28, 328); g.stroke();
  // Flechas do alvo atual
  g.textAlign = 'left'; g.fillStyle = '#3b2a17'; g.font = 'bold 30px sans-serif';
  g.fillText(info.arrowsLine || '', 36, 376);
  g.fillStyle = '#8b3a1a'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center';
  g.fillText(info.msg || '', w / 2, 470);
  g.fillStyle = '#5a4630'; g.font = '30px sans-serif';
  g.fillText(info.sub || '', w / 2, 556);
}
