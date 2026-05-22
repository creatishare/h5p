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
      1: { path: "0 -> 1", add: "走法 +1", speech: "到达 1", text: "0 -> 1，走法 +1。" },
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
      1: { path: "0 -> 1 -> 2", add: "走法 +1", speech: "一步一步到 2", text: "0 -> 1 -> 2，走法 +1。" },
      2: { path: "0 -> 2", add: "走法 +1", speech: "直接到 2", text: "0 -> 2，走法 +1。" },
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
      1: { path: "... 2 -> 3", add: "走法 + f(2)", speech: "+ f(2)", text: "最后 1 级：2 -> 3，走法 + f(2)。" },
      2: { path: "... 1 -> 3", add: "走法 + f(1)", speech: "+ f(1)", text: "最后 2 级：1 -> 3，走法 + f(1)。" },
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
      1: { path: "... 3 -> 4", add: "走法 + f(3)", speech: "+ f(3)", text: "最后 1 级：3 -> 4，走法 + f(3)。" },
      2: { path: "... 2 -> 4", add: "走法 + f(2)", speech: "+ f(2)", text: "最后 2 级：2 -> 4，走法 + f(2)。" },
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
};

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
};

function init() {
  renderLevels();
  renderRecords();
  renderLesson();
  bindEvents();
}

function renderLevels() {
  els.levelButtons.innerHTML = [1, 2, 3, 4]
    .map((level) => {
      const active = level === state.currentLevel ? "active" : "";
      const done = state.solved.has(level) ? "done" : "";
      return `<button class="level-button ${active} ${done}" type="button" data-level="${level}" aria-label="第 ${level} 关">${level}</button>`;
    })
    .join("");

  const completed = state.solved.size;
  els.progressLabel.textContent = `学习进度：${completed}/4`;
  els.progressFill.style.width = `${(completed / 4) * 100}%`;
}

function renderRecords() {
  els.recordRows.innerHTML = [1, 2, 3, 4]
    .map((n) => {
      const lesson = lessons[n];
      const solved = state.solved.has(n);
      const value = solved ? lesson.record : "—";
      const isCurrent = n === state.currentLevel;
      const rowClass = `${isCurrent ? "current" : ""} ${solved ? "solved" : ""}`;
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

  els.missionText.textContent = lesson.goal;
  els.hintText.textContent = state.solved.has(n)
    ? `n = ${n} 已完成，可以切换关卡继续观察。`
    : `当前正在探索 n = ${n} 的走法。`;
  els.stepOneLabel.textContent = n < 3 ? "走 1 级台阶" : "最后走 1 级";
  els.stepTwoLabel.textContent = n < 3 ? "走 2 级台阶" : "最后走 2 级";
  els.traceLog.textContent = selected.size ? "已记录的走法会同步到右侧表格。" : "点击按钮，观察小码怎么走。";
  const lastTrace = state.lastTrace.get(n);
  if (lastTrace) {
    applyContribution(lastTrace, true);
  } else {
    els.contributionCard.classList.remove("active");
    els.contributionPath.textContent = n < 3 ? "选择一种走法后显示路径" : "选择最后一步后显示贡献";
    els.contributionValue.textContent = n < 3 ? "走法 +1" : "走法 + f(?)";
  }
  els.speech.textContent = state.solved.has(n) ? lesson.completeTitle : lesson.prompt;

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
    state.currentLevel = Number(button.dataset.level);
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

  els.soundToggle.addEventListener("click", () => {
    state.sound = !state.sound;
    els.soundToggle.textContent = state.sound ? "声音：开" : "声音：关";
    els.soundToggle.prepend(createSoundIcon());
    els.soundToggle.setAttribute("aria-pressed", String(state.sound));
    if (state.sound) {
      playSound("toggle");
    }
  });
}

function createSoundIcon() {
  const icon = document.createElement("span");
  icon.className = "icon sound-icon";
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function handleStep(step) {
  const n = state.currentLevel;
  const lesson = lessons[n];
  if (lesson.disabledStepTwo && step === 2) {
    playSound("error");
    els.traceLog.textContent = lesson.traces[2];
    els.speech.textContent = "会超过终点";
    els.contributionPath.textContent = "0 -> 2 超过终点";
    els.contributionValue.textContent = "不能计数";
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

  setTimeout(() => {
    renderLesson();
    showContribution(trace);
    if (lesson.required.every((item) => selected.has(item))) {
      completeLevel(n);
    }
  }, path.length * 520);
}

function showContribution(trace) {
  els.traceLog.textContent = trace.text;
  els.speech.textContent = trace.speech || trace.text;
  applyContribution(trace, false);
}

function applyContribution(trace, keepActive) {
  els.contributionPath.textContent = trace.path;
  els.contributionValue.textContent = trace.add;
  if (keepActive) {
    els.contributionCard.classList.add("active");
  } else {
    els.contributionCard.classList.remove("active");
    requestAnimationFrame(() => els.contributionCard.classList.add("active"));
  }
}

function animatePath(path, level) {
  els.hero.classList.remove("hidden");
  path.forEach((position, index) => {
    setTimeout(() => placeHero(position, level), index * 520);
  });
}

function placeHero(position, level, instant = false) {
  els.hero.classList.toggle("no-transition", instant);
  if (instant) {
    void els.hero.offsetHeight;
  }
  if (position === null) {
    els.hero.classList.add("hidden");
    if (instant) {
      setTimeout(() => els.hero.classList.remove("no-transition"), 80);
    }
    return;
  }
  els.hero.classList.remove("hidden");
  const scene = document.querySelector("#stageScene");
  const sceneRect = scene.getBoundingClientRect();
  let baseX = 48;
  let baseY = 38;

  if (position === 0) {
    baseX = getStartX(sceneRect);
    baseY = 38;
  } else if (position > 0) {
    const stair = els.stairs.children[position - 1];
    if (stair) {
      const stairRect = stair.getBoundingClientRect();
      baseX = stairRect.left - sceneRect.left + stairRect.width / 2 - els.hero.offsetWidth / 2;
      baseY = sceneRect.bottom - stairRect.top - 2;
    }
  }

  const x = Math.max(24, baseX);
  els.hero.style.setProperty("--hero-x", `${x}px`);
  els.hero.style.setProperty("--hero-y", `${baseY}px`);
  if (instant) {
    setTimeout(() => els.hero.classList.remove("no-transition"), 80);
  }
}

function getStartX(sceneRect) {
  const firstStair = els.stairs.children[0];
  if (!firstStair) return 48;
  const firstRect = firstStair.getBoundingClientRect();
  return firstRect.left - sceneRect.left - els.hero.offsetWidth - 24;
}

function updateGroundZero() {
  const scene = document.querySelector("#stageScene");
  const sceneRect = scene.getBoundingClientRect();
  const startX = Math.max(24, getStartX(sceneRect));
  scene.style.setProperty("--ground-zero-x", `${startX + els.hero.offsetWidth / 2 - 5}px`);
}

function completeLevel(level) {
  const lesson = lessons[level];
  state.solved.add(level);
  playSound(level === 4 ? "finish" : "complete");
  els.dialogTitle.textContent = lesson.completeTitle;
  els.dialogText.textContent = lesson.completeText;
  els.nextLevel.textContent = level === 4 ? "完成" : "下一关";
  renderRecords();
  renderLevels();
  if (!els.resultDialog.open) {
    els.resultDialog.showModal();
  }
}

window.addEventListener("resize", () => renderLesson());

init();

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
  Array.from({ length: jumps }).forEach((_, index) => {
    playTone(430 + index * 90, index * 0.18, 0.1, "triangle", 0.065);
    playTone(620 + index * 90, index * 0.18 + 0.08, 0.08, "triangle", 0.05);
  });
}
