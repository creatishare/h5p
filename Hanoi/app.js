// ============================================================
// 客户端桥接 —— 不要修改 / 删除（详见 开发日志.md）
// 真正的"早定义"在 Hanoi.html <head> 的内联 <script> 里；这里是
// 幂等兜底（重复赋值无副作用 —— 方便单独打开 app.js 调试时仍然有这些方法）。
// ============================================================
window.SendMessageToJs = window.SendMessageToJs || function () {};
if (!window.SetIframeUrl) {
  var __setIframeUrlHandled = false;
  window.SetIframeUrl = function (url) {
    if (__setIframeUrlHandled) return;
    __setIframeUrlHandled = true;
    window.SendMessageToU3d && window.SendMessageToU3d("PageLoaded");
    window.OnIframeLoad && window.OnIframeLoad();
    if (url && url !== location.href) {
      location.href = url;
    }
  };
}
window.ShowClose = window.ShowClose || function () {};
window.HideClose = window.HideClose || function () {};

// ============================================================
// 调色板 —— 与原版一致的暖色调
// ============================================================
const PALETTE = [
  "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7",
  "#fd79a8", "#a29bfe", "#fdcb6e", "#00cec9",
  "#e17055", "#6c5ce7",
];
function diskBg(size) { return PALETTE[(size - 1) % PALETTE.length]; }

// ============================================================
// 全局状态（手动 + 3 关阶梯解锁，玩法忠实于原版 Hanoi.html）
// 关卡映射：level 1 → 2 盘，level 2 → 3 盘，level 3 → 4 盘
// ============================================================
const TOTAL_LEVELS = 3;
function levelToN(level) { return level + 1; }

const state = {
  currentLevel: 1,
  // 顺序解锁：单调递增，重置当前关不会回收已经解锁的更高关。
  maxUnlocked: 1,
  solved: new Set(),       // 已通关的 level 集合
  N: 2,                    // 派生字段：= levelToN(currentLevel)
  towers: { A: [], B: [], C: [] },
  steps: 0,
  selectedPeg: null,
  gameActive: false,
  // 操作记录
  logEntries: [],
  // 音效
  sound: true,
  audioContext: null,
  // 短动画（点击-放置）期间锁住所有交互，与 climb-s 同源
  _animating: false,
  _animationToken: 0,
  // 拖动
  pendingDrag: null,
  isDragging: false,
  dragSrcPeg: null,
  dragSize: null,
};

function isUnlocked(level) {
  return level <= state.maxUnlocked;
}

const DRAG_THRESHOLD = 5;

// 单次"点击-放置"动画时长（毫秒）；自动模式会按 speed 滑块再缩放
const BASE_LIFT_MS = 130;
const BASE_SLIDE_MS = 200;
const BASE_DROP_MS = 130;
const BASE_TOTAL_MS = BASE_LIFT_MS + BASE_SLIDE_MS + BASE_DROP_MS;

function minSteps(n) { return Math.pow(2, n) - 1; }

// ============================================================
// 元素引用
// ============================================================
const els = {
  speech: document.querySelector("#speechBubble"),
  goalN: document.querySelector("#goalN"),
  statSteps: document.querySelector("#statSteps"),
  statMin: document.querySelector("#statMin"),
  recordHint: document.querySelector("#recordHint"),
  logArea: document.querySelector("#logArea"),
  levelButtons: document.querySelector("#levelButtons"),
  actionStatus: document.querySelector("#actionStatus"),
  resetBtn: document.querySelector("#resetBtn"),
  winSub: document.querySelector("#winSub"),
  winNextBtn: document.querySelector("#winNextBtn"),
  scene: document.querySelector("#stageScene"),
  flyingDisk: document.querySelector("#flyingDisk"),
  dragGhost: document.querySelector("#dragGhost"),
  winOverlay: document.querySelector("#winOverlay"),
  winSteps: document.querySelector("#winSteps"),
  winMin: document.querySelector("#winMin"),
  winExtra: document.querySelector("#winExtra"),
  winRestartBtn: document.querySelector("#winRestartBtn"),
  soundToggle: document.querySelector("#soundToggle"),
  soundOn: document.querySelector("#soundToggle .sound-on"),
  soundOff: document.querySelector("#soundToggle .sound-off"),
  hintsTab: document.querySelector("#hintsTab"),
  hintsDialog: document.querySelector("#hintsDialog"),
  hintsClose: document.querySelector("#hintsClose"),
  hintsOk: document.querySelector("#hintsOk"),
  disksA: document.querySelector("#disks-A"),
  disksB: document.querySelector("#disks-B"),
  disksC: document.querySelector("#disks-C"),
};

function setAnimating(on) {
  state._animating = on;
  document.body.classList.toggle("is-animating", on);
}

// ============================================================
// 初始化
// ============================================================
function init() {
  // 默认从第 1 关（2 盘）开始
  state.currentLevel = 1;
  state.maxUnlocked = 1;
  state.solved = new Set();
  state.N = levelToN(state.currentLevel);
  bindEvents();
  initGame();
  notifyClientPageLoaded();
}

function notifyClientPageLoaded() {
  if (typeof window.SendMessageToU3d === "function") {
    window.SendMessageToU3d("PageLoaded");
  }
}

function initGame() {
  // 取消所有 in-flight 动画
  state._animationToken++;
  setAnimating(false);
  cancelDrag();

  // 派生 N
  state.N = levelToN(state.currentLevel);

  // 重建塔
  state.towers = { A: [], B: [], C: [] };
  for (let i = state.N; i >= 1; i--) state.towers.A.push(i);
  state.steps = 0;
  state.selectedPeg = null;
  state.logEntries = [];
  state.gameActive = true;

  els.winOverlay.classList.remove("show");

  renderLevels();
  renderTowers();
  renderStats();
  renderGoal();
  renderHintN1();
  renderLog();
  renderActionStatus();

  setSpeech("点击顶部圆盘选中，再点击目标柱放置（也可以拖动）", "info");
}

// ============================================================
// 渲染
// ============================================================
function renderTowers() {
  const maxN = state.N;
  ["A", "B", "C"].forEach((peg) => {
    const wrap = els[`disks${peg}`];
    if (!wrap) return;
    wrap.innerHTML = "";
    state.towers[peg].forEach((size, idx) => {
      const isTop = idx === state.towers[peg].length - 1;
      const d = document.createElement("div");
      d.className = "disk";
      if (isTop && state.gameActive && !state._animating) {
        d.classList.add("is-top");
      }
      if (isTop && state.selectedPeg === peg) d.classList.add("lifted");
      if (isTop && state.isDragging && state.dragSrcPeg === peg) d.classList.add("dragging");
      d.style.width = `${diskWidthPct(size, maxN)}%`;
      d.style.height = `${diskHeightPx(maxN)}px`;
      d.style.background = diskBg(size);
      d.textContent = size;
      // 拖动起手：pointerdown 在顶层 disk 上
      if (isTop && state.gameActive && !state._animating) {
        d.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          state.pendingDrag = { peg, diskEl: d, startX: e.clientX, startY: e.clientY };
        });
      }
      wrap.appendChild(d);
    });
    const zone = document.getElementById(`peg-${peg}`);
    zone.classList.remove("selected-hint", "drag-over");
    if (state.gameActive && state.selectedPeg && state.selectedPeg !== peg) {
      zone.classList.add("selected-hint");
    }
  });
}

function renderStats() {
  els.statSteps.textContent = state.steps;
  els.statMin.textContent = state.gameActive ? minSteps(state.N) : "—";
}

function renderGoal() {
  els.goalN.textContent = state.N;
}

// 关卡 chip：渲染 1..TOTAL_LEVELS，三种状态：active / done / locked
function renderLevels() {
  const levels = Array.from({ length: TOTAL_LEVELS }, (_, i) => i + 1);
  els.levelButtons.innerHTML = levels
    .map((level) => {
      const active = level === state.currentLevel ? "active" : "";
      const done = state.solved.has(level) ? "done" : "";
      const unlocked = isUnlocked(level);
      const locked = unlocked ? "" : "locked";
      const N = levelToN(level);
      const aria = unlocked
        ? `第 ${level} 关（${N} 个圆盘）`
        : `第 ${level} 关（未解锁）`;
      const dis = unlocked ? "" : 'disabled aria-disabled="true"';
      return `<button class="level-button ${active} ${done} ${locked}" type="button" data-level="${level}" aria-label="${aria}" ${dis}>${level}</button>`;
    })
    .join("");
}

// 底部 action 状态文字：根据当前关卡 + 解锁情况切换文案
function renderActionStatus() {
  if (!els.actionStatus) return;
  const cur = state.currentLevel;
  const solvedCount = state.solved.size;
  if (solvedCount === TOTAL_LEVELS) {
    els.actionStatus.innerHTML = `🎉 全部 <strong>${TOTAL_LEVELS}</strong> 关已通关`;
    return;
  }
  if (state.solved.has(cur) && cur < TOTAL_LEVELS) {
    els.actionStatus.innerHTML = `本关已完成，点上方关卡 <strong>${cur + 1}</strong> 继续挑战`;
    return;
  }
  els.actionStatus.innerHTML = `当前 <strong>第 ${cur} 关</strong> · ${state.N} 个圆盘 · 最少 ${minSteps(state.N)} 步`;
}

function completeLevel(level) {
  state.solved.add(level);
  state.maxUnlocked = Math.max(state.maxUnlocked, Math.min(TOTAL_LEVELS, level + 1));
  renderLevels();
  renderActionStatus();
}

// 把"提示" dialog 里所有 .hint-n1 占位都填成当前的 N−1。
// 在 initGame 末尾 + dialog 打开时都会调一次，确保始终最新。
function renderHintN1() {
  const n1 = Math.max(0, state.N - 1);
  document.querySelectorAll(".hint-n1").forEach((el) => {
    el.textContent = n1;
  });
}

function renderLog() {
  if (!state.logEntries.length) {
    els.logArea.innerHTML = `<div class="log-empty">点击或拖动顶层圆盘开始</div>`;
    els.recordHint.textContent = "暂无操作";
    return;
  }
  els.recordHint.textContent = `共 ${state.logEntries.length} 步`;
  els.logArea.innerHTML = state.logEntries
    .map((e, idx) => {
      const isLatest = idx === 0;
      return `<div class="log-row ${isLatest ? "is-latest" : ""}">
        <span class="log-num">${e.step}</span>
        <span class="log-chip" style="background:${diskBg(e.disk)}">${e.disk}</span>
        <span class="log-txt"><b>${e.from}</b> → <b>${e.to}</b></span>
      </div>`;
    })
    .join("");
}

// 尺寸：盘子宽度 %。
// 约定：size=1 是顶部（最小），size=maxN 是底部（最大）。
// 固定步长 16% —— 最大盘永远 88%，每小一号缩 16%。
// 这样 N=2 → 顶 72% / 底 88%（小盘大盘相差不悬殊）；
//      N=3 → 56% / 72% / 88%；
//      N=4 → 40% / 56% / 72% / 88%。
function diskWidthPct(size, maxN) {
  const maxP = 88;
  const stepP = 16;
  return Math.max(20, maxP - (maxN - size) * stepP);
}

// 盘子高度：N ∈ {2,3,4} 全部用同一个舒适的高度
function diskHeightPx(_maxN) {
  return 28;
}

// ============================================================
// 文案 / 反馈
// ============================================================
function setSpeech(msg, type) {
  els.speech.textContent = msg;
  els.speech.classList.remove("is-ok", "is-err", "is-tip");
  if (type === "ok") els.speech.classList.add("is-ok");
  else if (type === "err") els.speech.classList.add("is-err");
  else if (type === "tip") els.speech.classList.add("is-tip");
}

// ============================================================
// 业务：点击 / 选中 / 移动
// ============================================================
function handlePegClick(peg) {
  if (state._animating || !state.gameActive) return;

  if (state.selectedPeg === null) {
    if (!state.towers[peg].length) {
      setSpeech("该柱没有圆盘", "err");
      playSound("error");
      return;
    }
    state.selectedPeg = peg;
    const topSize = state.towers[peg][state.towers[peg].length - 1];
    setSpeech(`已选中圆盘 ${topSize}，再点击目标柱放置`, "tip");
    renderTowers();
  } else {
    const from = state.selectedPeg;
    state.selectedPeg = null;
    if (from === peg) {
      // 取消选中
      setSpeech("取消选中", "info");
      renderTowers();
      return;
    }
    tryMove(from, peg, /*animate=*/true);
  }
}

function canMove(from, to) {
  if (!state.towers[from].length) return { ok: false, reason: "该柱没有圆盘" };
  const top = state.towers[from][state.towers[from].length - 1];
  if (state.towers[to].length && state.towers[to][state.towers[to].length - 1] < top) {
    return { ok: false, reason: "不能将大盘放在小盘上！" };
  }
  return { ok: true };
}

// 尝试移动；若 animate=true 走"点击-放置"飞行动画；否则瞬时落位
function tryMove(from, to, animate) {
  if (!state.gameActive || from === to) return false;
  const check = canMove(from, to);
  if (!check.ok) {
    setSpeech(check.reason, "err");
    playSound("error");
    renderTowers();
    return false;
  }
  if (animate) {
    setAnimating(true);
    const token = ++state._animationToken;
    animateMove(from, to, BASE_TOTAL_MS).then(() => {
      if (token !== state._animationToken) return;
      commitMove(from, to);
      setAnimating(false);
    });
  } else {
    commitMove(from, to);
  }
  return true;
}

function commitMove(from, to) {
  const disk = state.towers[from].pop();
  state.towers[to].push(disk);
  state.steps++;
  state.logEntries.unshift({ step: state.steps, from, to, disk });
  renderTowers();
  renderStats();
  renderLog();
  setSpeech(`圆盘 ${disk}：${from} → ${to}`, "ok");
  playSound("move", state.steps);
  if (state.towers.C.length === state.N) handleWin();
}

// ============================================================
// 飞行动画（点击-放置 / 自动模式）
// ============================================================
function animateMove(from, to, totalMs) {
  return new Promise((resolve) => {
    const top = state.towers[from][state.towers[from].length - 1];
    if (top == null) return resolve();

    const srcPos = computeDiskTopPos(from, state.towers[from].length - 1);
    const dstPos = computeDiskTopPos(to, state.towers[to].length);

    const maxN = state.N;
    const diskHpx = diskHeightPx(maxN);
    // 估算飞行时的盘子像素宽度：以 disks-wrap 宽度为基础
    const wrapEl = els[`disks${from}`];
    const wrapWidth = wrapEl ? wrapEl.getBoundingClientRect().width : 120;
    const widthPx = Math.max(28, Math.round((diskWidthPct(top, maxN) / 100) * wrapWidth));

    const ghost = els.flyingDisk;
    ghost.textContent = top;
    ghost.style.background = diskBg(top);
    ghost.style.width = `${widthPx}px`;
    ghost.style.height = `${diskHpx}px`;
    ghost.style.fontSize = `${Math.max(10, Math.min(14, Math.round(diskHpx * 0.55)))}px`;
    ghost.style.left = `${srcPos.x - widthPx / 2}px`;
    ghost.style.bottom = `${srcPos.y}px`;
    ghost.classList.add("is-flying");

    // 隐藏 from 顶层 disk 的视觉（保留 layout，避免触发整体重排）
    // ⚠ disks-wrap 是 flex-direction: column-reverse —— DOM 里"最后一个"孩子
    //    才是视觉上的顶部 disk，第一个孩子在底部。
    const wrap = els[`disks${from}`];
    const topDiskEl = wrap?.lastElementChild;
    if (topDiskEl) topDiskEl.style.visibility = "hidden";

    const liftY = computeClearanceY();
    // 按 totalMs 切三段
    const liftMs  = Math.max(20, Math.round(totalMs * (BASE_LIFT_MS  / BASE_TOTAL_MS)));
    const slideMs = Math.max(30, Math.round(totalMs * (BASE_SLIDE_MS / BASE_TOTAL_MS)));
    const dropMs  = Math.max(20, Math.round(totalMs * (BASE_DROP_MS  / BASE_TOTAL_MS)));

    tweenTo(ghost, { left: srcPos.x - widthPx / 2, bottom: liftY }, liftMs)
      .then(() => tweenTo(ghost, { left: dstPos.x - widthPx / 2, bottom: liftY }, slideMs))
      .then(() => tweenTo(ghost, { left: dstPos.x - widthPx / 2, bottom: dstPos.y }, dropMs))
      .then(() => {
        ghost.classList.remove("is-flying");
        if (topDiskEl) topDiskEl.style.visibility = "";
        resolve();
      });
  });
}

function tweenTo(el, target, duration) {
  return new Promise((resolve) => {
    if (duration <= 0) {
      el.style.left = `${target.left}px`;
      el.style.bottom = `${target.bottom}px`;
      resolve();
      return;
    }
    const startLeft = parseFloat(el.style.left) || 0;
    const startBottom = parseFloat(el.style.bottom) || 0;
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - t) * (1 - t); // ease-out-quad
      el.style.left = `${startLeft + (target.left - startLeft) * e}px`;
      el.style.bottom = `${startBottom + (target.bottom - startBottom) * e}px`;
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

// 某根柱子上 stackIndex 处盘子的中心 X / 顶面 Y（在 stage-scene 坐标系下）
function computeDiskTopPos(peg, stackIndex) {
  const wrap = els[`disks${peg}`];
  if (!wrap || !els.scene) return { x: 0, y: 0 };
  const sceneRect = els.scene.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const x = wrapRect.left - sceneRect.left + wrapRect.width / 2;
  const wrapBottomFromSceneBottom = sceneRect.bottom - wrapRect.bottom;
  const h = diskHeightPx(state.N);
  const gap = 2;
  const y = wrapBottomFromSceneBottom + stackIndex * (h + gap);
  return { x, y };
}

function computeClearanceY() {
  const sceneRect = els.scene.getBoundingClientRect();
  return Math.round(sceneRect.height * 0.7);
}

// ============================================================
// 通关
// ============================================================
function handleWin() {
  state.gameActive = false;
  const lvl = state.currentLevel;
  completeLevel(lvl);

  const mn = minSteps(state.N);
  const isFinal = lvl >= TOTAL_LEVELS;
  els.winSteps.textContent = state.steps;
  els.winMin.textContent = mn;
  els.winExtra.textContent = state.steps - mn;
  els.winSub.textContent = isFinal
    ? "恭喜你，三关全部通关！"
    : `第 ${lvl} 关已完成，下一关已解锁。`;
  els.winNextBtn.textContent = isFinal ? "完成" : "下一关";
  els.winOverlay.classList.add("show");
  playSound(isFinal || state.steps === mn ? "finish" : "complete");
}

// ============================================================
// 拖动（pointerdown 在 disk 上 → pointermove 超阈值激活 → pointerup 放下）
// ============================================================
function activateDrag() {
  if (!state.pendingDrag || state.isDragging) return;
  if (!state.gameActive || state._animating) return;
  const { peg, diskEl, startX, startY } = state.pendingDrag;
  if (!state.towers[peg].length) return;
  const size = state.towers[peg][state.towers[peg].length - 1];
  state.dragSrcPeg = peg;
  state.dragSize = size;
  state.isDragging = true;
  state.selectedPeg = null;

  const ghost = els.dragGhost;
  ghost.textContent = size;
  const r = diskEl.getBoundingClientRect();
  ghost.style.width = `${r.width}px`;
  ghost.style.height = `${r.height}px`;
  ghost.style.background = diskBg(size);
  ghost.style.fontSize = getComputedStyle(diskEl).fontSize;
  ghost.classList.add("is-active");
  moveGhost(startX, startY);
  renderTowers();
}

function moveGhost(x, y) {
  els.dragGhost.style.left = `${x}px`;
  els.dragGhost.style.top = `${y}px`;
}

function cancelDrag() {
  state.pendingDrag = null;
  if (!state.isDragging) return;
  state.isDragging = false;
  els.dragGhost.classList.remove("is-active");
  ["A", "B", "C"].forEach((p) => {
    document.getElementById(`peg-${p}`).classList.remove("drag-over");
  });
  state.dragSrcPeg = null;
  state.dragSize = null;
  renderTowers();
}

function endDrag(toPeg) {
  const wasDragging = state.isDragging;
  const fromPeg = state.dragSrcPeg;
  els.dragGhost.classList.remove("is-active");
  state.isDragging = false;
  state.pendingDrag = null;
  ["A", "B", "C"].forEach((p) => {
    document.getElementById(`peg-${p}`).classList.remove("drag-over");
  });
  state.dragSrcPeg = null;
  state.dragSize = null;
  if (wasDragging && fromPeg && toPeg && toPeg !== fromPeg) {
    // 拖放后立刻落位（不再播飞行动画）
    tryMove(fromPeg, toPeg, /*animate=*/false);
  } else {
    renderTowers();
  }
}

document.addEventListener("pointermove", (e) => {
  if (state.pendingDrag && !state.isDragging) {
    const dx = e.clientX - state.pendingDrag.startX;
    const dy = e.clientY - state.pendingDrag.startY;
    if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) activateDrag();
  }
  if (!state.isDragging) return;
  moveGhost(e.clientX, e.clientY);
  ["A", "B", "C"].forEach((p) => {
    const z = document.getElementById(`peg-${p}`);
    const r = z.getBoundingClientRect();
    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    z.classList.toggle("drag-over", over && p !== state.dragSrcPeg);
  });
});

document.addEventListener("pointerup", (e) => {
  if (state.isDragging) {
    let toPeg = null;
    ["A", "B", "C"].forEach((p) => {
      const r = document.getElementById(`peg-${p}`).getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) toPeg = p;
    });
    endDrag(toPeg);
  } else {
    // 仅 pendingDrag 没升级为真拖动 → 普通点击，留给 peg-zone click 处理
    state.pendingDrag = null;
  }
});

document.addEventListener("pointercancel", () => cancelDrag());

// ============================================================
// 事件绑定
// ============================================================
function bindEvents() {
  // peg click
  ["A", "B", "C"].forEach((p) => {
    document.getElementById(`peg-${p}`).addEventListener("click", () => {
      if (state.isDragging) return; // drag just completed
      handlePegClick(p);
    });
  });

  // level chips（点击未锁定的关卡可切关）
  els.levelButtons.addEventListener("click", (event) => {
    if (state._animating) return;
    const btn = event.target.closest("[data-level]");
    if (!btn) return;
    const lvl = Number(btn.dataset.level);
    if (!isUnlocked(lvl)) {
      setSpeech("这一关还没解锁哦～", "tip");
      playSound("error");
      return;
    }
    if (lvl === state.currentLevel && state.gameActive) return; // 同关无需重启
    state.currentLevel = lvl;
    initGame();
  });

  // reset button —— 重置本关
  els.resetBtn.addEventListener("click", () => {
    initGame();
  });

  // 重玩本关
  els.winRestartBtn.addEventListener("click", () => {
    els.winOverlay.classList.remove("show");
    initGame();
  });

  // 下一关 / 完成
  els.winNextBtn.addEventListener("click", () => {
    els.winOverlay.classList.remove("show");
    if (state.currentLevel < TOTAL_LEVELS) {
      state.currentLevel += 1;
      initGame();
    }
    // 最后一关：仅关闭弹窗，停留在通关画面
  });

  // sound toggle
  if (els.soundToggle) {
    els.soundToggle.addEventListener("click", () => {
      state.sound = !state.sound;
      els.soundToggle.setAttribute("aria-pressed", String(state.sound));
      if (els.soundOn) els.soundOn.style.display = state.sound ? "" : "none";
      if (els.soundOff) els.soundOff.style.display = state.sound ? "none" : "";
      if (state.sound) playSound("toggle");
    });
  }

  // hints dialog
  if (els.hintsTab && els.hintsDialog) {
    const openHints = (e) => {
      e?.preventDefault?.();
      // 打开前再同步一次 n-1，避免 dialog 渲染时 state 已经变了但 DOM 还是老值
      renderHintN1();
      if (!els.hintsDialog.open) els.hintsDialog.showModal();
    };
    const closeHints = () => els.hintsDialog.close();
    els.hintsTab.addEventListener("click", openHints);
    if (els.hintsClose) els.hintsClose.addEventListener("click", closeHints);
    if (els.hintsOk) els.hintsOk.addEventListener("click", closeHints);
  }
}

window.addEventListener("resize", () => {
  if (state._animating) return;
  renderTowers();
});

init();

// ============================================================
// Web Audio 合成音效（无外部资源）
// ============================================================
function getAudioContext() {
  if (!state.sound) return null;
  if (!state.audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    state.audioContext = new AudioCtor();
  }
  if (state.audioContext.state === "suspended") {
    state.audioContext.resume();
  }
  return state.audioContext;
}

function playTone(frequency, startOffset = 0, duration = 0.12, type = "sine", volume = 0.08) {
  const audio = getAudioContext();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const start = audio.currentTime + startOffset;
  const end = start + duration;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function playSound(kind, index) {
  if (!state.sound) return;

  if (kind === "error") {
    playTone(180, 0, 0.1, "square", 0.045);
    playTone(140, 0.1, 0.12, "square", 0.035);
    return;
  }

  if (kind === "move") {
    const base = 360 + ((index || 0) % 5) * 50;
    playTone(base, 0, 0.06, "triangle", 0.045);
    playTone(base + 200, 0.05, 0.07, "triangle", 0.04);
    return;
  }

  if (kind === "complete") {
    playTone(520, 0, 0.09, "triangle", 0.07);
    playTone(660, 0.1, 0.11, "triangle", 0.07);
    playTone(820, 0.22, 0.16, "triangle", 0.075);
    return;
  }

  if (kind === "finish") {
    playTone(520, 0, 0.1, "triangle", 0.07);
    playTone(660, 0.11, 0.1, "triangle", 0.07);
    playTone(820, 0.22, 0.12, "triangle", 0.075);
    playTone(1040, 0.36, 0.22, "triangle", 0.075);
    return;
  }

  if (kind === "toggle") {
    playTone(640, 0, 0.08, "sine", 0.055);
  }
}
