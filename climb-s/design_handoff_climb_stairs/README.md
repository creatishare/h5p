# 交付包：练习12 · 爬楼梯（交互操作题）

## 概述

这是一道面向少儿编程的「**交互操作题**」页面。学生不需要写代码，而是通过点击 *走一级 / 走两级* 按钮，亲手帮卡通角色「小码」爬完 1–4 级台阶，自己发现 `f(n) = f(n-1) + f(n-2)` 这一递推规律。

## 关于本目录中的文件

`design/` 下的 HTML/CSS/JS 文件是**设计原型**，用于说明最终的视觉效果和交互行为，**不是要直接搬到生产环境的源码**。请用项目现有的技术栈（React / Vue / 小程序 / 其它）按其约定的组件库与代码规范，重新实现这套设计。如果当前还没有目标技术栈，自行选择最合适的（推荐 React + TypeScript + CSS Modules / Tailwind）。

`reference/` 是参考的 UI 风格截图（一道编程题的页面），用来对齐整体视觉语言（顶栏 tab、配色、字号、按钮、底部状态栏）。本题不要保留代码编辑器，把右侧改为交互操作区。

## 设计保真度

**高保真（Hi-Fi）**。颜色、字号、圆角、阴影、间距均为最终值，请尽量像素级还原。所有 token 已在 `DESIGN_TOKENS.md` 列出。

## 文件清单

- `README.md`（本文件）— 总览
- `SCREENS.md` — 屏幕 / 组件结构与逐区说明
- `INTERACTIONS.md` — 交互、状态机、动画细节
- `DESIGN_TOKENS.md` — 颜色、字体、间距、阴影等设计令牌
- `design/index.html`、`design/styles.css`、`design/app.js`、`design/illust-toggle.js` — HTML 原型
- `reference/style-reference-1.png`、`reference/style-reference-2.png` — 视觉语言参考截图

## 给 Claude Code 的建议提示词

> 我要在 \<你的技术栈\> 里实现 `design_handoff_climb_stairs/design/index.html` 这份交互操作题。请先读 `README.md`、`SCREENS.md`、`INTERACTIONS.md`、`DESIGN_TOKENS.md`，再读 design/ 下的 HTML/CSS/JS 原型作为像素级参考，最后用项目现有的组件库重写，保持视觉一致、交互逻辑一致。
