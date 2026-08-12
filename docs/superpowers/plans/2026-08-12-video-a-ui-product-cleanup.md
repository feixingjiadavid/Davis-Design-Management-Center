# Davis Video A UI Product Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复 A 方案项目管理清晰度，并将任务状态编辑统一收口到顶部右侧。

**Architecture:** 保留 R50 原生项目树和 R54/A 数据层；由 `r54-deliverables.js` 只增强“成片单元”和顶部状态，不再重排每个任务的内部 DOM。`a-ui-layout-fix.css` 只负责轻量化布局，不再用宽泛选择器重写旧卡片。后台同步仅同步已有状态，不主动迁移 review_status。

**Tech Stack:** Vanilla JavaScript, CSS, Supabase, GitHub Pages

## Global Constraints
- 不修改 Seedance / Ark 提交和费用确认链路。
- 不自动改变 review_status。
- 左侧不提供任何状态编辑控件。
- 顶部右上是唯一状态编辑入口。
- 点击弹窗外、拖拽、Esc 不关闭创建弹窗。
- 项目类别默认正式列表第一项。

---

### Task 1: 收敛左侧项目树 DOM
**Files:**
- Modify: `seedance/r54-deliverables.js`
- Modify: `seedance/a-ui-category-tools.js`

- [ ] 删除左侧状态编辑控件和任务复选框的普通展示逻辑。
- [ ] 任务仅保留原 R50 `.project-child` 卡片，并由 A 层增加只读状态 badge。
- [ ] 无成片单元的历史任务显示为“待整理任务”，不显示“未归类/未分配”。
- [ ] 状态变化后只触发一次树刷新，不创建递归 MutationObserver 自触发。

### Task 2: 顶部状态唯一入口
**Files:**
- Modify: `seedance/r54-deliverables.js`
- Modify: `seedance/a-ui-layout-fix.css`

- [ ] `renderContext()` 只输出项目/任务上下文、模式与单一状态 select。
- [ ] 移除“第 N 次”“未分配成片单元”等顶部 chip。
- [ ] `change` 事件只有用户实际改变 select 时调用 `setReview()`。
- [ ] 禁止轮询或同步函数自动将 `draft` 改为 `pending_review`。

### Task 3: 恢复高信息密度左侧视觉
**Files:**
- Modify: `seedance/a-ui-layout-fix.css`

- [ ] 一级项目保持原 R50 视觉。
- [ ] 成片单元使用轻标题行，不使用大卡片背景。
- [ ] 任务卡高度 56–68px；任务名 + 状态 badge 第一行，模式/数量/日期第二行。
- [ ] 删除会导致文字竖排、覆盖、强制绝对定位的宽泛 CSS。
- [ ] 1920/1440/1280 宽度下右上状态区不重叠。

### Task 4: 创建弹窗安全关闭与默认类别
**Files:**
- Modify: `seedance/app.js`

- [ ] 保持遮罩点击不关闭。
- [ ] 保持 Esc 不关闭创建项目/任务弹窗。
- [ ] 项目类别 reset 时默认 `R44_INDEX_PROJECT_CATEGORIES[0]`。

### Task 5: 回归测试与发布
**Files:**
- Create/Modify: `.github/workflows/a-ui-product-cleanup-check.yml`
- Modify: `ai-assistant.html`

- [ ] 静态断言页面只加载一个 A 状态编辑逻辑。
- [ ] 断言 `r54-deliverables.js` 不包含自动 `draft -> pending_review` 迁移。
- [ ] 断言左侧不存在 `.a-clip-status-select` 编辑器。
- [ ] `node --check` 校验 A 相关 JS。
- [ ] 更新 CSS/JS query version 强制浏览器刷新。
- [ ] 合并到 main 后确认 GitHub Pages 构建成功。
