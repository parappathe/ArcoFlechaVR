# ArcoFlechaVR

Arco e flecha em VR para o Meta Quest 3, no navegador do óculos (WebXR), sem instalar nada.
Partida de 10 alvos contra o computador, que tem 3 níveis. Também joga no PC com o mouse.
Tudo em português.

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos **https://parappathe.github.io/ArcoFlechaVR/** (ou a
página inicial https://parappathe.github.io/) e apertar "Entrar em VR". Para atualizar o site:
commitar e rodar `python publicar.py ArcoFlechaVR` na pasta `C:\claude code`.

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8768` (é o que o painel de
visualização usa, via `.claude/launch.json`). Use o `serve.py` e não o `python -m http.server`:
ele manda o navegador não guardar cache.

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Arco | Na mão esquerda (ou direita, nas Opções) | Aparece no canto da tela |
| Atirar | A outra mão vai até a corda, aperta e segura o gatilho, puxa para trás e solta o gatilho. Quanto mais puxa, mais forte. A flecha sai na linha da mão da corda até o arco | Segurar o botão do mouse puxa a corda (barra de força e zoom de mira), mirar com o mouse, soltar atira |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| FPS | Opções → Mostrar FPS | Tecla F |

Vibração: aumenta enquanto puxa e dá um tranco ao soltar. O jogador é posto na linha de tiro
ao entrar no VR; "Recentralizar" na pausa faz de novo.

### Regras

10 alvos em sequência; em cada um você atira 3 flechas e depois o computador atira 3. Anéis
valem de 10 (centro) a 1; fora do alvo, 0. Ganha quem somar mais. Empate: uma flecha de
desempate cada no último alvo, ganha quem chegar mais perto do centro (repete se empatar).

Alvos (em `js/targets.js`): 10 m, 15 m, 20 m, 20 m com vento, 25 m menor, 20 m andando,
30 m com vento forte, 25 m pêndulo, 25 m pequeno andando rápido, 40 m com rajadas. O lado do
vento é sorteado a cada partida; o placar e as bandeiras mostram direção e força.

Adversários (em `js/cpu.js`): Tonico (Fácil), Lia Certeira (Médio), Guilherme Tell (Difícil).
Média por flecha nos testes: cerca de 4,1 / 6,6 / 8,5. Vitórias e recorde por nível ficam
salvos no navegador (localStorage, chave `arcoflechavr.v1`).

## Como testar

- `node tests/run.js` (ou `npm test`): pontuação dos anéis, força da corda, mira calculada
  acerta sem e com vento, vento desvia, flecha rápida não atravessa, alvos que se mexem,
  ordem de tiro, desempate, níveis em ordem (Difícil > Médio > Fácil, com faixas de média) e
  uma partida inteira computador x computador. Tem que terminar com "Tudo certo".
- No navegador (console): `ppvr.startMatch(1); ppvr.dev.autoplay = true; ppvr.dev.advance(60)`
  joga 60 s na hora, com o jogador atirando como o nível Médio. `advance` existe porque o
  painel de visualização escondido não anima a página.
- **Só dá para testar no óculos:** pegar e puxar a corda, posição do arco na mão, força e
  direção das flechas, vibração, conforto e FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", mira e barra de força do PC |
| `js/physics.js` | Voo da flecha (gravidade de jogo 6 m/s², arrasto, vento), colisão com alvo/fardo/chão, anéis, mira calculada (`aimAt`). Sem navegador |
| `js/targets.js` | Os 10 alvos, sorteio do vento e posição do alvo no tempo. Sem navegador |
| `js/cpu.js` | Os 3 adversários (`LEVELS`) e o tiro do computador (`cpuShot`). Sem navegador |
| `js/match.js` | Placar, ordem de tiro e desempate. Sem navegador |
| `js/game.js` | `ArcheryGame`: uma partida em passos fixos de 1/240 s. Sem navegador |
| `js/main.js` | Liga tudo: render, arco e corda no VR, mouse, menus, placar, sons |
| `js/scene.js` | Campo, céu, árvores, bandeiras de vento, placar de madeira, alvos, arco, flechas e o arqueiro do computador |
| `js/ui.js` | Painel de menu 3D (mesmo do PingPongVR, com cores de madeira) |
| `js/audio.js` | Sons sintetizados (corda, disparo, flecha cravando, torcida) |
| `js/save.js` | Vitórias, recordes e opções salvos |
| `serve.py` | Servidor local sem cache (`--https` para testar no Quest pela rede de casa) |
| `tests/run.js` | Testes automáticos |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: metros, linha de tiro em z = 0, alvos em -Z, jogador em x = 0, computador em
x = 2,2 (raia à direita). No VR a cabeça fica em z = 0,3.

## Regras e convenções do projeto

- `physics.js`, `targets.js`, `cpu.js`, `match.js` e `game.js` não podem usar navegador nem
  Three.js: os testes rodam no Node.
- Mexeu em física, alvos ou adversários: rodar `node tests/run.js`.
- Dificuldade de um adversário: `err` (erro de mira em miliradianos), `windComp` (0 a 1, quanto
  compensa o vento), `lead` (quanto adianta no alvo que anda), `speed` (fração da força máxima),
  `think` (tempo mirando).
- Flechas por alvo: `arrows` no `ArcheryGame` (padrão 3).

## Decisões

- Mesmo caminho do PingPongVR (WebXR no navegador, publicado no GitHub Pages), com visual
  próprio ao ar livre.
- Gravidade de jogo mais fraca que a real (6 em vez de 9,81) para os alvos longe não exigirem
  mirar muito acima; a flecha sai a até 58 m/s.
- No VR, a direção do tiro vem só das posições das duas mãos (corda → arco), como num arco
  real; a orientação do controle só serve para desenhar o arco de pé.
- 3 flechas por alvo e jogador sempre atira primeiro em cada alvo.
- Todos os níveis liberados desde o começo (o menu mostra vitórias e recorde de cada um).

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: alcance para pegar a corda (22 cm do ponto de encaixe), força
  das flechas, conforto, FPS.
- No PC o arqueiro do computador fica fora da tela (está ao lado do jogador); dá para
  acompanhar pelo placar e pela flecha chegando ao alvo. No VR basta olhar para a direita.
