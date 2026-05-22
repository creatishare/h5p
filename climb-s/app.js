// ============================================================
// 客户端桥接 —— 不要修改 / 删除（详见 开发日志.md）
// 客户端依赖 SetIframeUrl 才能打开 H5；删除会导致页面打不开。
//
// ⚠ 真正的"早定义"在 index.html <head> 的内联 <script> 里，这里是
//    幂等兜底（同样的赋值再做一次，方便单独打开 app.js 调试时仍然有这些方法）。
//    重复赋值无副作用 —— 不要因此把这里删掉。
// ============================================================
window.SendMessageToJs = window.SendMessageToJs || function () {};
window.SetIframeUrl = window.SetIframeUrl || function (url) {
  window.SendMessageToU3d && window.SendMessageToU3d("PageLoaded");
  window.OnIframeLoad && window.OnIframeLoad();
  // ⚠ 只有目标 URL 跟当前不同才跳转，避免客户端反复 page-loaded → SetIframeUrl
  //    的同 URL 死循环（详细解释见 index.html <head> 中的内联版本）。
  if (url && url !== location.href) {
    location.href = url;
  }
};
window.ShowClose = window.ShowClose || function () {};
window.HideClose = window.HideClose || function () {};

// ============================================================
// 课程数据（4 关）
// ============================================================
const lessons = {
  1: {
    goal: "1 级：从 0 走到 1。",
    prompt: "从 0 开始",
    required: [1],
    disabledStepTwo: true,
    completeTitle: "有 1 种走法",
    completeText: "f(1) = 1，记录区已经更新。",
    record: "1",
    traces: {
      1: { path: "0 → 1", add: "+1 种", speech: "走到了！+1 种", text: "0 → 1，+1 种走法。" },
      2: "只有 1 级台阶，不能一次走 2 级。",
    },
  },
  2: {
    goal: "2 级：试试两种走法。",
    prompt: "两种选择",
    required: [1, 2],
    completeTitle: "有 2 种走法",
    completeText: "f(2) = 2，记录区已经更新。",
    record: "2",
    traces: {
      1: { path: "0 → 1 → 2", add: "+1 种", speech: "一步一步到 2，+1 种", text: "0 → 1 → 2，+1 种走法。" },
      2: { path: "0 → 2", add: "+1 种", speech: "直接跨到 2，+1 种", text: "0 → 2，+1 种走法。" },
    },
  },
  3: {
    goal: "3 级：看最后一步从哪来。",
    prompt: "看最后一步",
    required: [1, 2],
    completeTitle: "有 f(2)+f(1)=3 种走法",
    completeText: "f(3) = f(2)+f(1) = 3，记录区已经更新。",
    record: "f(2)+f(1)=3",
    traces: {
      // 只显示最后一步，路径前的 "… →" 提示前面还有走法
      1: { path: "… → 2 → 3", add: "再加 f(2) 种", speech: "+ f(2) 种", text: "最后从 2 → 3，再加 f(2) 种走法。" },
      2: { path: "… → 1 → 3", add: "再加 f(1) 种", speech: "+ f(1) 种", text: "最后从 1 → 3，再加 f(1) 种走法。" },
    },
  },
  4: {
    goal: "4 级：继续看最后一步。",
    prompt: "继续倒推",
    required: [1, 2],
    completeTitle: "有 f(3)+f(2)=5 种走法",
    completeText: "f(4) = f(3)+f(2) = 5。恭喜你，发现了规律：f(n)=f(n-1)+f(n-2)。",
    record: "f(3)+f(2)=5",
    traces: {
      1: { path: "… → 3 → 4", add: "再加 f(3) 种", speech: "+ f(3) 种", text: "最后从 3 → 4，再加 f(3) 种走法。" },
      2: { path: "… → 2 → 4", add: "再加 f(2) 种", speech: "+ f(2) 种", text: "最后从 2 → 4，再加 f(2) 种走法。" },
    },
  },
};

const state = {
  currentLevel: 1,
  solved: new Set(),
  selected: new Map(),
  lastTrace: new Map(),
  sound: true,
  audioContext: null,
  // 顺序解锁：单调递增，重置某关不会回收已经解锁的更高关。
  maxUnlocked: 1,
  // 小核桃当前所在的像素位置（jumpTo 用作起点）
  _heroX: null,
  _heroY: null,
};

function isUnlocked(level) {
  return level <= state.maxUnlocked;
}

const els = {
  stairs: document.querySelector("#stairs"),
  hero: document.querySelector("#hero"),
  speech: document.querySelector("#speechBubble"),
  missionText: document.querySelector("#missionText"),
  traceLog: document.querySelector("#traceLog"),
  contributionCard: document.querySelector("#contributionCard"),
  contributionPath: document.querySelector("#contributionPath"),
  contributionValue: document.querySelector("#contributionValue"),
  recordRows: document.querySelector("#recordRows"),
  levelButtons: document.querySelector("#levelButtons"),
  progressLabel: document.querySelector("#progressLabel"),
  progressFill: document.querySelector("#progressFill"),
  hintText: document.querySelector("#hintText"),
  stepOneLabel: document.querySelector("#stepOneLabel"),
  stepTwoLabel: document.querySelector("#stepTwoLabel"),
  resultDialog: document.querySelector("#resultDialog"),
  dialogTitle: document.querySelector("#dialogTitle"),
  dialogText: document.querySelector("#dialogText"),
  nextLevel: document.querySelector("#nextLevel"),
  stayLevel: document.querySelector("#stayLevel"),
  resetLevel: document.querySelector("#resetLevel"),
  soundToggle: document.querySelector("#soundToggle"),
  soundOn: document.querySelector("#soundToggle .sound-on"),
  soundOff: document.querySelector("#soundToggle .sound-off"),
  scene: document.querySelector("#stageScene"),
  heroImg: document.querySelector("#heroImg"),
  hintsTab: document.querySelector("#hintsTab"),
  hintsDialog: document.querySelector("#hintsDialog"),
  hintsClose: document.querySelector("#hintsClose"),
  hintsOk: document.querySelector("#hintsOk"),
};

// 小核桃跳跃素材：tiao_00 是站姿（idle），tiao_02..tiao_14 是跳跃 13 帧（无 tiao_01）
// ⚠ 路径必须是 ASCII —— 客户端 WebView / 部分服务器对中文 URL 编解码不一致，
//   会导致 setHeroSrc 里的 `getAttribute("src") !== src` 比较异常，第二次跳跃换不了帧。
const HERO_BASE = "./hero-frames/";
const HERO_IDLE = HERO_BASE + "tiao_00.png";
// ⚠ 关键：跳跃数组**不含** tiao_00（idle）。
//   含进去会让 t=0 的瞬间显示"站立不动"的姿势，与已经开始抬起的位置脱节。
//   13 帧均匀铺到 t∈[0,1]：起跳 → 腾空 → 落地，与位置阶段一一对应。
const HERO_JUMP_FRAMES = [
  "tiao_02.png", "tiao_03.png", "tiao_04.png",
  "tiao_05.png", "tiao_06.png", "tiao_07.png", "tiao_08.png",
  "tiao_09.png", "tiao_10.png", "tiao_11.png", "tiao_12.png",
  "tiao_13.png", "tiao_14.png",
].map((f) => HERO_BASE + f);

// 与 styles.css `.hero { --hero-jump-dur }` 严格一致；改这里也要改 CSS。
// 数值偏慢一点是给学生留观察时间（参考姿态 / 看清落到哪一级台阶）。
const HERO_JUMP_DURATION = 1400;
// 每次落地后强制留出的"站定"时间：让学生看清现在站在哪一级，再进入下一次跳跃 / 重置 / 隐藏。
const LANDING_PAUSE = 500;

let heroJumpRaf = null;

function setHeroSrc(src) {
  if (!els.heroImg) return;
  if (els.heroImg.getAttribute("src") !== src) {
    els.heroImg.setAttribute("src", src);
  }
}

function stopJumpAnim() {
  if (heroJumpRaf) {
    cancelAnimationFrame(heroJumpRaf);
    heroJumpRaf = null;
  }
  if (els.hero) {
    els.hero.classList.remove("jumping");      // 兼容旧 class（已废弃但留个清理）
  }
}

// ─── 真正的"跳起来"动画：x / y / 抛物线 / sprite 都从同一个 RAF 时钟推进 ───
// 关键约束：位移、弧线、帧序列共享 elapsed 与 t，永远不会脱节。
// - 序列帧 13 帧均匀铺到 t∈[0,1]，最后一帧（tiao_14, 落地姿）恰好在 t=1 显示
// - t=1 时位置 = (x2, y2)，sprite 立即切回 idle —— 视觉上"落地 → 站定"一气呵成
function jumpTo(x1, y1, x2, y2) {
  if (!els.heroImg || !els.hero) return;
  stopJumpAnim();

  // 跳跃过程不让 CSS transition 插手 —— 完全由 JS 写 --hero-x / --hero-y
  els.hero.classList.add("no-transition");
  void els.hero.offsetHeight; // commit class

  const frames = HERO_JUMP_FRAMES;
  const total = HERO_JUMP_DURATION;
  const start = performance.now();

  // 抛物线峰值高度：随跨度增加而稍微变高，保证小核桃总是清晰地"越过"目标
  const dy = Math.abs(y2 - y1);
  const arcPeak = 56 + dy * 0.55;

  // 起跳第一帧立刻显示 tiao_02（蓄力姿），不要再展示 idle 站姿
  setHeroSrc(frames[0]);

  const frame = (now) => {
    const elapsed = now - start;
    const t = Math.min(1, elapsed / total);

    // 1) 位移：水平线性，垂直 = 线性 + 抛物线弧
    const x = x1 + (x2 - x1) * t;
    const yLine = y1 + (y2 - y1) * t;
    // 4t(1-t) 是经典抛物线：t=0 / t=1 都为 0，t=0.5 处取峰值 1
    const arc = arcPeak * 4 * t * (1 - t);

    els.hero.style.setProperty("--hero-x", `${x}px`);
    els.hero.style.setProperty("--hero-y", `${yLine + arc}px`);

    // 2) 序列帧：13 帧均匀铺到 t∈[0,1]
    //    - t=0     → idx 0 (tiao_02, 蓄力)
    //    - t=0.5   → idx 6 (tiao_08, 腾空 / 接近抛物线峰值)
    //    - t→1     → idx 12 (tiao_14, 落地姿) —— 恰好与位置落到 y2 同时
    const idx = Math.min(frames.length - 1, Math.floor(t * frames.length));
    setHeroSrc(frames[idx]);

    if (t < 1) {
      heroJumpRaf = requestAnimationFrame(frame);
    } else {
      // 落地：锁定终点像素，下一帧回到 idle 姿，并解除 no-transition
      heroJumpRaf = null;
      els.hero.style.setProperty("--hero-x", `${x2}px`);
      els.hero.style.setProperty("--hero-y", `${y2}px`);
      setHeroSrc(HERO_IDLE);
      requestAnimationFrame(() => els.hero.classList.remove("no-transition"));
    }
  };
  heroJumpRaf = requestAnimationFrame(frame);
}

// 预加载所有帧，避免首次播放时还在拉资源造成卡顿
function preloadHeroFrames() {
  HERO_JUMP_FRAMES.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

function safeSetText(el, text) {
  if (el) el.textContent = text;
}

function init() {
  preloadHeroFrames();
  renderLevels();
  renderRecords();
  renderLesson();
  bindEvents();
  notifyClientPageLoaded();
}

function notifyClientPageLoaded() {
  // 仅在 init 末尾通知一次；SetIframeUrl 内部由客户端调用，与此不会同帧重复
  if (typeof window.SendMessageToU3d === "function") {
    window.SendMessageToU3d("PageLoaded");
  }
}

function renderLevels() {
  els.levelButtons.innerHTML = [1, 2, 3, 4]
    .map((level) => {
      const active = level === state.currentLevel ? "active" : "";
      const done = state.solved.has(level) ? "done" : "";
      const unlocked = isUnlocked(level);
      const locked = unlocked ? "" : "locked";
      const aria = unlocked ? `第 ${level} 关` : `第 ${level} 关（未解锁）`;
      const dis = unlocked ? "" : "disabled aria-disabled=\"true\"";
      return `<button class="level-button ${active} ${done} ${locked}" type="button" data-level="${level}" aria-label="${aria}" ${dis}>${level}</button>`;
    })
    .join("");

  const completed = state.solved.size;
  safeSetText(els.progressLabel, `模拟进度：${completed}/4`);
  if (els.progressFill) {
    els.progressFill.style.width = `${(completed / 4) * 100}%`;
  }
}

function renderRecords() {
  els.recordRows.innerHTML = [1, 2, 3, 4]
    .map((n) => {
      const lesson = lessons[n];
      const solved = state.solved.has(n);
      const isCurrent = n === state.currentLevel;
      const value = solved ? lesson.record : "—";
      const rowClass = `${isCurrent ? "current" : ""} ${solved ? "solved" : ""}`.trim();

      let chipClass = "todo";
      let chipText = "待探索";
      if (solved) { chipClass = "done"; chipText = "已完成"; }
      else if (isCurrent) { chipClass = "now"; chipText = "进行中"; }

      return `
        <tr class="${rowClass}">
          <td>${n}</td>
          <td>${value}</td>
          <td><span class="status-chip ${chipClass}">${chipText}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderLesson() {
  const n = state.currentLevel;
  const lesson = lessons[n];
  const selected = state.selected.get(n) || new Set();

  safeSetText(els.missionText, lesson.goal);
  // 走法记录表头的副标题（左栏较窄，文案精简）
  safeSetText(
    els.hintText,
    state.solved.has(n) ? `n = ${n} 已完成` : `n = ${n} 进行中`
  );
  safeSetText(els.stepOneLabel, n < 3 ? "走一级台阶" : "最后走 1 级");
  safeSetText(els.stepTwoLabel, n < 3 ? "走两级台阶" : "最后走 2 级");
  safeSetText(
    els.traceLog,
    selected.size ? "已记录的走法会同步到右侧表格。" : "点击按钮，观察小码怎么走。"
  );

  const lastTrace = state.lastTrace.get(n);
  if (lastTrace) {
    applyContribution(lastTrace, true);
    els.contributionCard.classList.remove("is-hidden");
  } else {
    // 切到新关卡（无历史走法）时，瞬时隐藏「本步贡献」浮卡，
    // 避免淡出过程中露出占位文字造成的闪烁。
    els.contributionCard.classList.add("no-transition");
    els.contributionCard.classList.add("is-hidden");
    els.contributionCard.classList.remove("active");
    // 占位文案（卡片此时是 is-hidden，对用户不可见；这只是兜底）
    safeSetText(els.contributionPath, "—");
    safeSetText(els.contributionValue, n < 3 ? "+1 种" : "再加 f(?) 种");
    // 强制重排，让 no-transition 即刻生效；下一帧再恢复过渡，
    // 这样下次显示时仍然有动画。
    void els.contributionCard.offsetHeight;
    requestAnimationFrame(() => els.contributionCard.classList.remove("no-transition"));
  }
  safeSetText(els.speech, state.solved.has(n) ? lesson.completeTitle : lesson.prompt);

  document.querySelectorAll(".action-button").forEach((button) => {
    const step = Number(button.dataset.step);
    button.classList.toggle("done", selected.has(step));
    button.dataset.disabled = lesson.disabledStepTwo && step === 2 ? "true" : "false";
  });

  renderStairs(n);
  updateGroundZero();
  placeHero(n < 3 ? 0 : null, n, true);
  renderRecords();
  renderLevels();
}

function renderStairs(level) {
  els.stairs.innerHTML = Array.from({ length: level }, (_, index) => {
    const n = index + 1;
    return `<div class="stair stair-${n}" data-ground="${n}">${n}</div>`;
  }).join("");
}

function bindEvents() {
  document.querySelectorAll(".action-button").forEach((button) => {
    button.addEventListener("click", () => handleStep(Number(button.dataset.step)));
  });

  els.levelButtons.addEventListener("click", (event) => {
    const button = event.target.closest("[data-level]");
    if (!button) return;
    const lvl = Number(button.dataset.level);
    if (!isUnlocked(lvl)) return; // 未解锁的关卡禁止跳转
    state.currentLevel = lvl;
    renderLesson();
  });

  els.resetLevel.addEventListener("click", () => {
    state.selected.set(state.currentLevel, new Set());
    state.solved.delete(state.currentLevel);
    state.lastTrace.delete(state.currentLevel);
    renderLesson();
  });

  els.nextLevel.addEventListener("click", () => {
    els.resultDialog.close();
    if (state.currentLevel < 4) {
      state.currentLevel += 1;
      renderLesson();
    }
  });

  els.stayLevel.addEventListener("click", () => els.resultDialog.close());

  if (els.soundToggle) {
    els.soundToggle.addEventListener("click", () => {
      state.sound = !state.sound;
      els.soundToggle.setAttribute("aria-pressed", String(state.sound));
      if (els.soundOn) els.soundOn.style.display = state.sound ? "" : "none";
      if (els.soundOff) els.soundOff.style.display = state.sound ? "none" : "";
      if (state.sound) playSound("toggle");
    });
  }

  // 提示弹窗
  if (els.hintsTab && els.hintsDialog) {
    const openHints = (e) => {
      e?.preventDefault?.();
      if (!els.hintsDialog.open) els.hintsDialog.showModal();
    };
    const closeHints = () => els.hintsDialog.close();
    els.hintsTab.addEventListener("click", openHints);
    if (els.hintsClose) els.hintsClose.addEventListener("click", closeHints);
    if (els.hintsOk) els.hintsOk.addEventListener("click", closeHints);
  }
}

function handleStep(step) {
  const n = state.currentLevel;
  const lesson = lessons[n];
  if (lesson.disabledStepTwo && step === 2) {
    playSound("error");
    safeSetText(els.traceLog, lesson.traces[2]);
    safeSetText(els.speech, "会越过终点");
    safeSetText(els.contributionPath, "0 → 2（越过终点）");
    safeSetText(els.contributionValue, "× 不能计数");
    els.contributionCard.classList.remove("is-hidden");
    els.contributionCard.classList.add("active");
    return;
  }

  const trace = lesson.traces[step];
  state.lastTrace.set(n, trace);
  const start = n < 3 ? 0 : n - step;
  const path = n === 2 && step === 1 ? [0, 1, 2] : [start, n];
  animatePath(path, n);
  playPathSound(path);

  const selected = state.selected.get(n) || new Set();
  selected.add(step);
  state.selected.set(n, selected);

  showContribution(trace);

  // 全程时长 = 每段 (跳跃 + 落地停顿) × 段数，确保最后一次也能停足 LANDING_PAUSE 再 reset/hide。
  const jumps = Math.max(1, path.length - 1);
  const totalAnim = jumps * (HERO_JUMP_DURATION + LANDING_PAUSE);
  setTimeout(() => {
    renderLesson();
    showContribution(trace);
    if (lesson.required.every((item) => selected.has(item))) {
      completeLevel(n);
    }
  }, totalAnim + 40);
}

function showContribution(trace) {
  safeSetText(els.traceLog, trace.text);
  safeSetText(els.speech, trace.speech || trace.text);
  els.contributionCard.classList.remove("is-hidden");
  applyContribution(trace, false);
}

function applyContribution(trace, keepActive) {
  safeSetText(els.contributionPath, trace.path);
  safeSetText(els.contributionValue, trace.add);
  if (keepActive) {
    els.contributionCard.classList.add("active");
  } else {
    els.contributionCard.classList.remove("active");
    requestAnimationFrame(() => els.contributionCard.classList.add("active"));
  }
}

function animatePath(path, level) {
  els.hero.classList.remove("hidden");
  // 1) 起点：瞬时落位，无过渡、无序列帧。
  //    对于 n<3，起点是 0（小核桃已经在那里，相当于 no-op）；
  //    对于 n>=3，起点是 n-step，小核桃从隐藏直接显现到那一级台阶。
  placeHero(path[0], level, true);
  // 2) 每一段跳跃 = 跳跃时长 + 落地后的站定时间。
  //    这样多段路径（如 n=2 的 [0,1,2]）之间会有一个明显的"小核桃站在中间台阶上"的瞬间。
  const stride = HERO_JUMP_DURATION + LANDING_PAUSE;
  for (let i = 1; i < path.length; i++) {
    setTimeout(() => placeHero(path[i], level, false), (i - 1) * stride);
  }
}

// 计算某个 position（0=地面，1..n=对应台阶顶）小核桃应该落到的像素位置。
function computeHeroXY(position) {
  const scene = els.scene;
  if (!scene) return null;
  const sceneRect = scene.getBoundingClientRect();
  // 小核桃 PNG 底部有少量透明像素；把整张图整体上抬，让视觉脚底贴在面上。
  // hero 元素现在 122px 高，FOOT_LIFT 同比放大。
  const FOOT_LIFT = 11;
  let x = 48;
  let y = 38 + FOOT_LIFT;
  if (position === 0) {
    x = getStartX(sceneRect);
  } else if (position > 0) {
    const stair = els.stairs.children[position - 1];
    if (stair) {
      const stairRect = stair.getBoundingClientRect();
      x = stairRect.left - sceneRect.left + stairRect.width / 2 - els.hero.offsetWidth / 2;
      y = sceneRect.bottom - stairRect.top + FOOT_LIFT;
    }
  }
  return { x: Math.max(24, x), y };
}

function placeHero(position, level, instant = false) {
  if (position === null) {
    stopJumpAnim();
    els.hero.classList.add("hidden");
    state._lastHeroPos = null;
    return;
  }
  els.hero.classList.remove("hidden");
  const target = computeHeroXY(position);
  if (!target) return;

  const prevPos = state._lastHeroPos;
  const moved = position !== prevPos;

  if (instant || !moved || state._heroX == null || state._heroY == null) {
    // 瞬时落位：写入 CSS vars，回到 idle 帧
    stopJumpAnim();
    els.hero.classList.add("no-transition");
    void els.hero.offsetHeight;
    els.hero.style.setProperty("--hero-x", `${target.x}px`);
    els.hero.style.setProperty("--hero-y", `${target.y}px`);
    setHeroSrc(HERO_IDLE);
    requestAnimationFrame(() => els.hero.classList.remove("no-transition"));
  } else {
    // 跳跃：从当前像素位置弧线跳到目标位置
    jumpTo(state._heroX, state._heroY, target.x, target.y);
  }
  state._lastHeroPos = position;
  state._heroX = target.x;
  state._heroY = target.y;
}

function getStartX(sceneRect) {
  const firstStair = els.stairs.children[0];
  if (!firstStair) return 48;
  const firstRect = firstStair.getBoundingClientRect();
  return firstRect.left - sceneRect.left - els.hero.offsetWidth - 24;
}

function updateGroundZero() {
  const scene = els.scene;
  if (!scene) return;
  const sceneRect = scene.getBoundingClientRect();
  const startX = Math.max(24, getStartX(sceneRect));
  scene.style.setProperty("--ground-zero-x", `${startX + els.hero.offsetWidth / 2 - 5}px`);
}

function completeLevel(level) {
  const lesson = lessons[level];
  state.solved.add(level);
  // 顺序解锁下一关；单调递增，不会因为后续 reset 而回收
  state.maxUnlocked = Math.max(state.maxUnlocked, Math.min(4, level + 1));
  playSound(level === 4 ? "finish" : "complete");
  safeSetText(els.dialogTitle, lesson.completeTitle);
  safeSetText(els.dialogText, lesson.completeText);
  safeSetText(els.nextLevel, level === 4 ? "完成" : "下一关");
  renderRecords();
  renderLevels();
  if (!els.resultDialog.open) {
    els.resultDialog.showModal();
  }
}

window.addEventListener("resize", () => renderLesson());

init();

// ============================================================
// Web Audio 合成音效（无外部资源）
// 浏览器/客户端可能要求首次用户手势后才能播放，属正常行为。
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

function playSound(kind) {
  if (!state.sound) return;

  if (kind === "error") {
    playTone(180, 0, 0.1, "square", 0.045);
    playTone(140, 0.1, 0.12, "square", 0.035);
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

function playPathSound(path) {
  if (!state.sound) return;
  const jumps = Math.max(1, path.length - 1);
  // 每段跳跃的实际起始时间是 i * (跳跃时长 + 落地停顿)，与 animatePath 对齐。
  const strideSec = (HERO_JUMP_DURATION + LANDING_PAUSE) / 1000;
  for (let i = 0; i < jumps; i++) {
    const offset = i * strideSec;
    playTone(430 + i * 90, offset, 0.1, "triangle", 0.065);
    playTone(620 + i * 90, offset + 0.08, 0.08, "triangle", 0.05);
  }
}
