# 交互与状态

## 全局状态

```ts
type LessonId = 1 | 2 | 3 | 4;

interface State {
  currentLevel: LessonId;       // 当前关卡 1..4
  solved: Set<LessonId>;        // 已完成关卡
  selected: Map<LessonId, Set<1|2>>; // 每关已尝试过的步幅
  lastTrace: Map<LessonId, Trace>;   // 每关最近一次走法的展示信息
  sound: boolean;               // 是否开启音效
}

interface Trace {
  path: string;   // 路径文字，如 "0 -> 1 -> 2"
  add: string;    // 走法增量，如 "走法 +1" 或 "走法 + f(2)"
  speech: string; // 角色头顶气泡显示的简短提示
  text: string;   // 操作记录的完整文字
}
```

## 关卡数据（4 关）

| n | 学习目标                         | 允许的走法              | 完成条件                |
|---|----------------------------------|-------------------------|-------------------------|
| 1 | 1 级：从 0 走到 1                | 仅 +1（+2 禁用）        | 点过 +1                 |
| 2 | 2 级：试两种走法                 | +1+1 或 +2              | 两种都点过              |
| 3 | 3 级：观察最后一步从哪来         | 最后一步 +1 或最后 +2   | 两种都点过              |
| 4 | 4 级：继续倒推                   | 同上                    | 两种都点过              |

记录列填充：n=1→`1`，n=2→`2`，n=3→`f(2)+f(1)=3`，n=4→`f(3)+f(2)=5`。

## 主要交互流

### 切换关卡
点击右上的 1/2/3/4 关卡 chip → `currentLevel = n` → 重渲染舞台（重新生成台阶）、走法记录表、操作按钮可用态、对话气泡。已完成关卡的 chip 保留绿色。

### 点击「+1 走一级」/「+2 走两级」
1. 校验：若该关禁用了 +2（n=1）→ 播放 error 音、对话气泡显示「会超过终点」、本步贡献卡显示「不能计数」。
2. 否则：根据 `currentLevel + step` 计算路径 `path: number[]`：
   - n=1 走 +1 → `[0, 1]`
   - n=2 走 +1 → `[0, 1, 2]`（两段动画）
   - n=2 走 +2 → `[0, 2]`
   - n≥3 走 +1 → `[n-1, n]`
   - n≥3 走 +2 → `[n-2, n]`
3. 沿 path 依次 `setTimeout(placeHero, i*520)` 让 hero 跳到对应位置；同时播放跳跃音（每跳一次升高一个半音）。
4. 把本次 step 加入 `selected[n]`，按钮高亮 `done`，本步贡献卡激活（绿色边框）。
5. 路径动画完成后：若 `selected[n] ⊇ required[n]` → 标记 `solved.add(n)`、播放完成音、弹出完成 Dialog（最后一关用 finish 音，按钮文字改成「完成」）。

### 重置
清空 `selected[n]`，从 `solved` 中删除该关，hero 回到起点，按钮 `done` 状态清除。

### 完成弹窗
- 标题：`有 f(2)+f(1)=3 种走法` 这种动态文案。
- 按钮：`继续观察`（关闭弹窗，留在当前关），`下一关`（关闭弹窗 + currentLevel++，最后一关时按钮文字为「完成」）。

## hero 位置算法

```js
// 场景容器 stageScene 的 getBoundingClientRect 为 sceneRect
// hero 高度 88px，台阶元素高度按 .stair-N 配置

if (position === 0) {
  // 起点位置：第一级台阶左侧 24px
  baseX = firstStairLeft - heroWidth - 24;
  baseY = 38;
} else {
  const stairRect = stairs.children[position-1].getBoundingClientRect();
  baseX = stairRect.left - sceneRect.left + stairRect.width/2 - heroWidth/2;
  baseY = sceneRect.bottom - stairRect.top - 2;
}
```

页面 `resize` 时需要重算 `--hero-x / --hero-y` 与「0」标记位置。

## 音效

WebAudio API 合成 3 类音：

- **跳跃**：每跳一次 triangle 波，频率 430 → 520 → 610 …，时长 100ms；同时叠加 620 → 710 … 高音。
- **完成**（complete）：520 / 660 / 820 Hz 三连音。
- **过关**（finish，仅 n=4）：520 / 660 / 820 / 1040 Hz 四连音。
- **错误**：square 波 180 → 140 Hz，钝感音。

可由 `state.sound` 开关全局静音。

## 响应式

- ≤ 1100px：左右两栏改 1:1。
- ≤ 820px：上下堆叠，左下藏题目说明 tab。台阶宽度收紧到 70%。

## 可访问性

- 所有按钮使用语义化 `<button>`，关键操作带 `aria-label`。
- 关卡 chip 写 `aria-label="第 ? 关"`。
- 完成弹窗用原生 `<dialog>` + `showModal()`，保证焦点陷阱与 ESC 关闭。
- 对话气泡的 `aria-live="polite"` 让屏幕阅读器朗读状态变化。

## 数据持久化（可选，建议加上）

将 `solved`、`currentLevel` 写入 `localStorage`，刷新后保留进度。
