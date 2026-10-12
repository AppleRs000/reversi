'use strict';
(function () {

/* =====================================================
 *  エンジン（ルール・CPU思考）
 *  盤面は長さ64の配列。0=空, 1=黒, 2=白
 * ===================================================== */
const EMPTY = 0, BLACK = 1, WHITE = 2;
const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

// 場所ごとの価値（角が高く、角の隣が低い）
const Q = [
  [120, -20, 20,  5],
  [-20, -40, -5, -5],
  [ 20,  -5, 15,  3],
  [  5,  -5,  3,  3],
];
const W = new Array(64);
for (let r = 0; r < 8; r++) {
  for (let c = 0; c < 8; c++) {
    W[r * 8 + c] = Q[Math.min(r, 7 - r)][Math.min(c, 7 - c)];
  }
}

function initialBoard() {
  const b = new Int8Array(64);
  b[27] = WHITE; b[28] = BLACK;
  b[35] = BLACK; b[36] = WHITE;
  return b;
}

// (index)に p が置いたとき裏返る石のindex配列
function getFlips(b, i, p) {
  if (b[i] !== EMPTY) return [];
  const r0 = i >> 3, c0 = i & 7, o = 3 - p, res = [];
  for (const [dr, dc] of DIRS) {
    let r = r0 + dr, c = c0 + dc, n = 0;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === o) { r += dr; c += dc; n++; }
    if (n > 0 && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === p) {
      for (let k = 1; k <= n; k++) res.push((r0 + dr * k) * 8 + c0 + dc * k);
    }
  }
  return res;
}

function legalMoves(b, p) {
  const m = [];
  for (let i = 0; i < 64; i++) {
    if (b[i] === EMPTY) {
      const f = getFlips(b, i, p);
      if (f.length) m.push({ i, f });
    }
  }
  return m;
}

function applyMove(b, mv, p) {
  const nb = b.slice();
  nb[mv.i] = p;
  for (const k of mv.f) nb[k] = p;
  return nb;
}

function count(b, p) {
  let n = 0;
  for (let i = 0; i < 64; i++) if (b[i] === p) n++;
  return n;
}

function evalWeights(b, p) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    if (b[i] === p) s += W[i];
    else if (b[i] !== EMPTY) s -= W[i];
  }
  return s;
}

function evalStrong(b, p) {
  let s = evalWeights(b, p);
  s += (legalMoves(b, p).length - legalMoves(b, 3 - p).length) * 6; // 着手可能数の差
  return s;
}

function negamax(b, p, depth, alpha, beta, evalFn) {
  if (depth <= 0) return evalFn(b, p);
  const moves = legalMoves(b, p);
  if (!moves.length) {
    if (!legalMoves(b, 3 - p).length) {            // 双方打てない＝終局
      return (count(b, p) - count(b, 3 - p)) * 100;
    }
    return -negamax(b, 3 - p, depth, -beta, -alpha, evalFn); // パス
  }
  moves.sort((x, y) => W[y.i] - W[x.i]);
  let best = -Infinity;
  for (const mv of moves) {
    const s = -negamax(applyMove(b, mv, p), 3 - p, depth - 1, -beta, -alpha, evalFn);
    if (s > best) best = s;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function search(b, p, moves, depth, evalFn, exactEmpties) {
  let empties = 0;
  for (let i = 0; i < 64; i++) if (b[i] === EMPTY) empties++;
  const d = empties <= exactEmpties ? 99 : depth; // 終盤は最後まで読み切る
  shuffle(moves);                                  // 同点ならランダム
  moves.sort((x, y) => W[y.i] - W[x.i]);
  let best = null, alpha = -Infinity;
  for (const mv of moves) {
    const s = -negamax(applyMove(b, mv, p), 3 - p, d - 1, -Infinity, -alpha, evalFn);
    if (best === null || s > alpha) { best = mv; alpha = s; }
  }
  return best;
}

function chooseCpuMove(b, p, level) {
  const moves = legalMoves(b, p);
  if (!moves.length) return null;
  if (level === 'weak') return moves[Math.floor(Math.random() * moves.length)];
  if (level === 'normal') return search(b, p, moves, 2, evalWeights, 0);
  return search(b, p, moves, 5, evalStrong, 8);
}

// Node（テスト）から使えるようにする
if (typeof document === 'undefined') {
  if (typeof module !== 'undefined') {
    module.exports = { EMPTY, BLACK, WHITE, initialBoard, getFlips, legalMoves, applyMove, count, chooseCpuMove };
  }
  return;
}

/* =====================================================
 *  UI
 * ===================================================== */
const $ = (id) => document.getElementById(id);
const MODES = {
  pvp:    { label: '2人対戦' },
  weak:   { label: 'CPU対戦：弱い' },
  normal: { label: 'CPU対戦：普通' },
  strong: { label: 'CPU対戦：強い' },
};
const STORAGE_KEY = 'reversi-records-v1';

/* ---- 勝敗数の保存 ---- */
function defaultRecords() {
  return {
    pvp:    { b: 0, w: 0, d: 0 },
    weak:   { w: 0, l: 0, d: 0 },
    normal: { w: 0, l: 0, d: 0 },
    strong: { w: 0, l: 0, d: 0 },
  };
}
function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return Object.assign(defaultRecords(), JSON.parse(raw));
  } catch (e) { /* 保存できない環境では無視 */ }
  return defaultRecords();
}
function saveRecords() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (e) { /* 無視 */ }
}
let records = loadRecords();

function recordText(mode) {
  const r = records[mode];
  return mode === 'pvp'
    ? `黒 ${r.b}勝 / 白 ${r.w}勝 / 引分 ${r.d}`
    : `${r.w}勝 ${r.l}敗 ${r.d}分`;
}

/* ---- 状態 ---- */
const S = {
  mode: 'pvp', human: BLACK,
  board: initialBoard(), turn: BLACK,
  over: true, paused: false, hints: false,
  last: -1, mustPass: false, moves: [],
  msg: '', notice: '', anim: null,
  timer: null, flashTimer: null,
};

/* ---- DOM ---- */
const cells = [];
const boardEl = $('board');
for (let i = 0; i < 64; i++) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.dataset.i = i;
  const disc = document.createElement('div');
  disc.className = 'disc';
  cell.appendChild(disc);
  boardEl.appendChild(cell);
  cells.push(cell);
}
boardEl.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (cell) onCellClick(Number(cell.dataset.i));
});

/* ---- ヘルパー ---- */
const isCpuMode = () => S.mode !== 'pvp';
const isCpuTurn = () => isCpuMode() && S.turn !== S.human;

function nameOf(color) {
  if (!isCpuMode()) return color === BLACK ? '黒' : '白';
  const c = color === BLACK ? '黒' : '白';
  return color === S.human ? `あなた（${c}）` : `CPU（${c}）`;
}

function setMsg(text) {
  S.msg = text;
  clearTimeout(S.flashTimer);
  const el = $('message');
  el.textContent = text;
  el.classList.remove('warn');
}
function flash(text) {
  const el = $('message');
  el.textContent = text;
  el.classList.add('warn');
  clearTimeout(S.flashTimer);
  S.flashTimer = setTimeout(() => {
    el.textContent = S.msg;
    el.classList.remove('warn');
  }, 1600);
}

/* ---- モーダル ---- */
function showModal(title, text, buttons) {
  $('modalTitle').textContent = title;
  $('modalText').textContent = text;
  const box = $('modalButtons');
  box.innerHTML = '';
  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.cls) btn.className = b.cls;
    btn.addEventListener('click', () => { hideModal(); if (b.onClick) b.onClick(); });
    box.appendChild(btn);
  }
  $('modal').hidden = false;
}
function hideModal() { $('modal').hidden = true; }
function ask(title, text, okLabel, onOk, danger) {
  showModal(title, text, [
    { label: okLabel, cls: danger ? 'danger' : 'primary', onClick: onOk },
    { label: 'キャンセル', cls: 'ghost' },
  ]);
}

/* ---- 描画 ---- */
function render() {
  const anim = S.anim; S.anim = null;
  const active = !S.over && !S.paused;
  const humanTurn = active && !isCpuTurn();
  const hintSet = new Set(S.hints && humanTurn ? S.moves.map((m) => m.i) : []);

  const pendingFlips = [];
  for (let i = 0; i < 64; i++) {
    const v = S.board[i];
    const disc = cells[i].firstChild;
    disc.className = 'disc' + (v === BLACK ? ' black' : v === WHITE ? ' white' : '');
    cells[i].classList.toggle('last', i === S.last);
    cells[i].classList.toggle('hint', hintSet.has(i));
    if (anim) {
      if (anim.flipped.has(i)) pendingFlips.push(i);
      else if (anim.placed === i) pendingFlips.push(-i - 1);
    }
  }
  if (pendingFlips.length) {
    void boardEl.offsetWidth; // アニメーションを再始動
    for (const k of pendingFlips) {
      if (k >= 0) {
        const d = cells[k].firstChild;
        d.style.setProperty('--from', S.board[k] === BLACK ? 'var(--white-bg)' : 'var(--black-bg)');
        d.classList.add('flip');
      } else {
        cells[-k - 1].firstChild.classList.add('drop');
      }
    }
  }

  $('countBlack').textContent = count(S.board, BLACK);
  $('countWhite').textContent = count(S.board, WHITE);
  $('nameBlack').textContent = nameOf(BLACK);
  $('nameWhite').textContent = nameOf(WHITE);
  $('panelBlack').classList.toggle('active', !S.over && S.turn === BLACK);
  $('panelWhite').classList.toggle('active', !S.over && S.turn === WHITE);

  $('gameModeLabel').textContent = MODES[S.mode].label;
  $('recordChip').textContent = '勝敗　' + recordText(S.mode);

  $('pauseOverlay').hidden = !S.paused;
  $('passBtn').disabled = !humanTurn;
  $('passBtn').classList.toggle('attn', humanTurn && S.mustPass);
  $('assistBtn').disabled = S.over;
  $('assistBtn').textContent = 'アシスト：' + (S.hints ? 'ON' : 'OFF');
  $('assistBtn').setAttribute('aria-pressed', String(S.hints));
  $('resignBtn').disabled = !active;
  $('pauseBtn').disabled = S.over;
  $('pauseBtn').textContent = S.paused ? '再開' : '一時停止';
  $('stopBtn').disabled = S.over;
  $('againBtn').hidden = !S.over;
}

/* ---- 進行 ---- */
function schedule(fn, ms) {
  clearTimeout(S.timer);
  S.timer = setTimeout(fn, ms);
}

function startGame() {
  clearTimeout(S.timer);
  S.board = initialBoard();
  S.turn = BLACK;
  S.over = false; S.paused = false;
  S.last = -1; S.mustPass = false; S.notice = ''; S.anim = null;
  $('menu').hidden = true;
  $('game').hidden = false;
  hideModal();
  beginTurn();
}

function beginTurn() {
  clearTimeout(S.timer);
  if (S.over) return;
  S.moves = legalMoves(S.board, S.turn);
  S.mustPass = false;

  if (S.moves.length === 0) {
    if (legalMoves(S.board, 3 - S.turn).length === 0) { finish('normal'); return; }
    S.mustPass = true;
    if (isCpuTurn()) {
      setMsg(`${nameOf(S.turn)}は置ける場所がないのでパスします`);
      render();
      schedule(() => passTurn(`${nameOf(S.turn)}はパスしました。`), 1000);
    } else {
      setMsg(`${nameOf(S.turn)}は置ける場所がありません。「パス」を押してください`);
      render();
    }
    return;
  }

  const base = isCpuTurn() ? `${nameOf(S.turn)}が考え中…` : `${nameOf(S.turn)}の番です`;
  setMsg((S.notice ? S.notice + ' ' : '') + base);
  S.notice = '';
  render();
  if (isCpuTurn()) schedule(cpuMove, 550);
}

function playMove(mv) {
  const p = S.turn;
  S.board = applyMove(S.board, mv, p);
  S.last = mv.i;
  S.anim = { flipped: new Set(mv.f), placed: mv.i };
  S.turn = 3 - p;
  beginTurn();
}

function cpuMove() {
  if (S.over || S.paused || !isCpuTurn()) return;
  const mv = chooseCpuMove(S.board, S.turn, S.mode);
  if (mv) playMove(mv);
}

function passTurn(notice) {
  S.notice = notice || '';
  S.turn = 3 - S.turn;
  beginTurn();
}

function onCellClick(i) {
  if (S.over || S.paused || isCpuTurn()) return;
  if (S.mustPass) { flash('置ける場所がありません。「パス」を押してください'); return; }
  const mv = S.moves.find((m) => m.i === i);
  if (!mv) { flash('そこには置けません'); return; }
  playMove(mv);
}

/* ---- 終局 ---- */
function finish(kind, loser) {
  clearTimeout(S.timer);
  S.over = true; S.paused = false; S.moves = []; S.mustPass = false;

  const b = count(S.board, BLACK), w = count(S.board, WHITE);
  let winner;
  if (kind === 'resign') winner = 3 - loser;
  else winner = b > w ? BLACK : w > b ? WHITE : 0;

  const r = records[S.mode];
  if (!isCpuMode()) {
    if (winner === BLACK) r.b++; else if (winner === WHITE) r.w++; else r.d++;
  } else {
    if (winner === 0) r.d++; else if (winner === S.human) r.w++; else r.l++;
  }
  saveRecords();

  let title, text;
  if (kind === 'resign') {
    title = `${nameOf(winner)}の勝ち！`;
    text = `${nameOf(loser)}が降参しました。\n（黒 ${b} - 白 ${w}）`;
  } else if (winner === 0) {
    title = '引き分け';
    text = `黒 ${b} - 白 ${w}`;
  } else {
    title = isCpuMode()
      ? (winner === S.human ? 'あなたの勝ち！' : 'CPUの勝ち…')
      : `${nameOf(winner)}の勝ち！`;
    text = `黒 ${b} - 白 ${w}`;
  }
  setMsg(title + '　' + text.replace('\n', ' '));
  render();
  showModal(title, text + '\n\n' + recordText(S.mode), [
    { label: 'もう一度', cls: 'primary', onClick: startGame },
    { label: 'メニューへ', onClick: showMenu },
    { label: '盤面を見る', cls: 'ghost' },
  ]);
}

/* ---- ボタン ---- */
$('passBtn').addEventListener('click', () => {
  if (S.over || S.paused || isCpuTurn()) return;
  if (S.moves.length > 0) { flash('置ける場所があるのでパスできません'); return; }
  passTurn(`${nameOf(S.turn)}がパスしました。`);
});

$('assistBtn').addEventListener('click', () => {
  S.hints = !S.hints;
  render();
});

$('resignBtn').addEventListener('click', () => {
  if (S.over || S.paused) return;
  const loser = isCpuMode() ? S.human : S.turn;
  ask('降参しますか？', `${nameOf(loser)}の負けとして記録されます。`, '降参する', () => {
    if (!S.over) finish('resign', loser);
  }, true);
});

function togglePause() {
  if (S.over) return;
  S.paused = !S.paused;
  if (S.paused) {
    clearTimeout(S.timer);
    setMsg('一時停止中');
    render();
  } else {
    beginTurn();
  }
}
$('pauseBtn').addEventListener('click', togglePause);
$('resumeBtn').addEventListener('click', togglePause);

$('stopBtn').addEventListener('click', () => {
  if (S.over) return;
  ask('対局を停止しますか？', '勝敗には記録されません。', '停止する', () => {
    if (S.over) return;
    clearTimeout(S.timer);
    S.over = true; S.paused = false; S.moves = []; S.mustPass = false;
    setMsg('対局を停止しました（記録なし）');
    render();
    showModal('対局を停止しました', '勝敗には記録されていません。', [
      { label: '最初からやり直す', cls: 'primary', onClick: startGame },
      { label: 'メニューへ', onClick: showMenu },
      { label: '盤面を見る', cls: 'ghost' },
    ]);
  }, true);
});

$('quitBtn').addEventListener('click', () => {
  if (S.over) { showMenu(); return; }
  ask('終了しますか？', 'メニューに戻ります。対局中の場合、この対局は記録されません。', '終了する', showMenu, true);
});

$('againBtn').addEventListener('click', startGame);

/* ---- メニュー ---- */
function renderRecordTable() {
  const t = $('recordTable');
  t.innerHTML = '';
  for (const key of Object.keys(MODES)) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    const td = document.createElement('td');
    th.textContent = MODES[key].label;
    td.textContent = recordText(key);
    tr.append(th, td);
    t.appendChild(tr);
  }
}

function showMenu() {
  clearTimeout(S.timer);
  S.over = true; S.paused = false;
  hideModal();
  $('game').hidden = true;
  $('menu').hidden = false;
  renderRecordTable();
}

function updateSideRow() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  $('sideRow').hidden = mode === 'pvp';
}
document.querySelectorAll('input[name="mode"]').forEach((el) => el.addEventListener('change', updateSideRow));

$('startBtn').addEventListener('click', () => {
  S.mode = document.querySelector('input[name="mode"]:checked').value;
  S.human = Number(document.querySelector('input[name="side"]:checked').value);
  startGame();
});

$('resetRecords').addEventListener('click', () => {
  ask('勝敗数をリセットしますか？', 'すべてのモードの勝敗数が0に戻ります。', 'リセットする', () => {
    records = defaultRecords();
    saveRecords();
    renderRecordTable();
  }, true);
});

updateSideRow();
renderRecordTable();

})();
