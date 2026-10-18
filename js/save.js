// Progresso e opções, salvos no navegador.
const KEY = 'arcoflechavr.v1';
const DEFAULTS = {
  wins: {},        // vitórias por nível: { facil: 2, ... }
  best: {},        // melhor total por nível
  bowHand: 'left', // mão que segura o arco: 'left' | 'right'
  fps: false,
};

export function loadSave() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}
