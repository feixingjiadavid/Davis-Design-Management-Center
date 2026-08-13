# Davis Video Studio Flat Task Tree R18 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把左侧固定为“项目 → 生成任务”两层，并消除 R54 对任务树的二次重组和创建后闪烁。

**Architecture:** 继续让 R50 负责项目和任务的唯一层级渲染。R54 不再构建 deliverable/unclassified 容器，只对 R50 已存在的任务卡片做幂等状态 pill 装饰。后台 `video_deliverables` 与 `deliverable_id` 保留但不参与左侧层级。

**Tech Stack:** Vanilla JavaScript、CSS、GitHub Pages、Supabase、Node.js test runner

## Global Constraints

- 左侧用户可见层级只能是“项目 → 生成任务”。
- 不显示“成片单元”“未归类”“＋成片单元”“＋分组”。
- 历史 `deliverable_id` 不删除、不迁移。
- 不修改 `seedance/app-v46.js`、`seedance/ffmpeg-class-worker.js`。
- 不修改 Seedance 付费生成与人工确认保护。
- 保持 owner 账号隔离和现有状态同步规则。

---

### Task 1: 锁死两层树回归规则

**Files:**
- Create: `seedance/r18-flat-tree-regression.test.mjs`
- Modify: `.github/workflows/r54-check.yml`

**Interfaces:**
- Consumes: `seedance/r54-deliverables.js`, `seedance/a-ui-layout-fix.css`
- Produces: R18 静态回归测试

- [ ] **Step 1: 写失败测试**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const r54 = fs.readFileSync(new URL('./r54-deliverables.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./a-ui-layout-fix.css', import.meta.url), 'utf8');

test('R54 does not rebuild project tree into deliverable or unclassified folders', () => {
  const enhance = r54.match(/function enhanceTree\(\)[\s\S]*?function wrapTask/)
    ?.at(0) || '';
  assert.doesNotMatch(enhance, /replaceChildren\(/);
  assert.doesNotMatch(enhance, /buildDeliverableNode\(/);
  assert.doesNotMatch(enhance, /buildUnclassifiedNode\(/);
});

test('sidebar has no user-visible subgroup concepts', () => {
  assert.doesNotMatch(r54, /＋ 成片单元/);
  assert.doesNotMatch(r54, />未归类</);
  assert.doesNotMatch(css, /data-r54-add-task/);
});
```

- [ ] **Step 2: 运行测试确认旧代码失败**

Run: `node --test seedance/r18-flat-tree-regression.test.mjs`
Expected: FAIL，因为旧 `enhanceTree()` 使用 `replaceChildren()` 并构建 deliverable/unclassified。

- [ ] **Step 3: 把测试加入正式 CI**

在 `.github/workflows/r54-check.yml` 的 Video Studio 测试命令中加入：

```bash
node --test seedance/r18-flat-tree-regression.test.mjs
```

- [ ] **Step 4: Commit**

```bash
git add seedance/r18-flat-tree-regression.test.mjs .github/workflows/r54-check.yml
git commit -m "test(video): require flat two-level task tree"
```

---

### Task 2: 把 R54 树增强缩减为状态装饰

**Files:**
- Modify: `seedance/r54-deliverables.js`

**Interfaces:**
- Consumes: R50 `.project-child` buttons and existing `draftMeta()` / `REVIEW_LABELS`
- Produces: `enhanceTree()` that only wraps/decorates existing task cards

- [ ] **Step 1: 实现幂等任务装饰函数**

新增：

```js
function decorateTaskButton(button) {
  if (!button || button.closest('.r54-task-row')) return;
  const meta = metaForButton(button);
  const row = document.createElement('div');
  row.className = 'r54-task-row';
  const pill = document.createElement('span');
  pill.className = 'r54-pill';
  pill.dataset.status = meta.reviewStatus;
  pill.textContent = REVIEW_LABELS[meta.reviewStatus] || '备用';
  button.parentNode?.insertBefore(row, button);
  row.append(button, pill);
}
```

- [ ] **Step 2: 重写 `enhanceTree()`**

目标实现：

```js
function enhanceTree() {
  if (state.applyingTree) return;
  const root = $('project-list');
  if (!root) return;
  state.applyingTree = true;
  try {
    for (const button of root.querySelectorAll('.project-child')) decorateTaskButton(button);
    renderContext();
    renderSummary();
  } finally {
    state.applyingTree = false;
  }
}
```

不得执行 `replaceChildren()`、不得创建 `r54-deliverable`、不得创建 `r54-unclassified`。

- [ ] **Step 3: 保留后台 deliverable 数据能力但移除左侧入口**

保留数据读取、批处理/历史兼容函数，不从 `enhanceTree()` 调用：

```js
buildDeliverableNode
buildUnclassifiedNode
createDeliverable
```

这些函数不得产生默认左侧 UI。

- [ ] **Step 4: 运行语法与 R18 测试**

Run:

```bash
node --check seedance/r54-deliverables.js
node --test seedance/r18-flat-tree-regression.test.mjs
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add seedance/r54-deliverables.js
git commit -m "fix(video): flatten sidebar to project and task cards"
```

---

### Task 3: 清理三级目录 CSS，保持任务卡片与状态视觉

**Files:**
- Modify: `seedance/a-ui-layout-fix.css`

**Interfaces:**
- Consumes: `.project-child-list`, `.r54-task-row`, `.r54-pill`
- Produces: flat task spacing with no deliverable header/action styling

- [ ] **Step 1: 删除/覆盖 deliverable 层级样式**

移除 `.r54-project-tools`、`.r54-deliverable-head`、`.r54-deliverable-actions`、`.r54-deliverable-body`、`.r54-unclassified` 的可见布局依赖。

- [ ] **Step 2: 让直属任务卡片在项目下保持清晰间距**

保留：

```css
.project-child-list .r54-task-row {
  position: relative !important;
  display: block !important;
  width: 100% !important;
  margin: 0 0 7px !important;
}
```

任务卡、选中态和三色状态 pill 继续使用现有样式。

- [ ] **Step 3: 运行静态测试**

Run: `node --test seedance/r18-flat-tree-regression.test.mjs`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add seedance/a-ui-layout-fix.css
git commit -m "style(video): simplify flat task tree spacing"
```

---

### Task 4: 缓存版本与完整回归

**Files:**
- Modify: `ai-assistant.html`
- Modify: `supabase-config.js`

**Interfaces:**
- Consumes: new R18 JS/CSS
- Produces: browser loads R18 assets without stale cache

- [ ] **Step 1: 切换资源版本**

把相关 query version 统一更新为：

```text
20260813-flat-task-tree-r18
```

- [ ] **Step 2: 运行完整 Video Studio 回归**

Run:

```bash
node --check seedance/app.js
node --check seedance/r54-deliverables.js
node --test seedance/access-control.test.mjs seedance/owner-isolation-regression.test.mjs
node --test seedance/r54-deliverables-core.test.mjs seedance/r54-import-normalization.test.mjs seedance/a-version-regression.test.mjs seedance/a-ui-mount.test.mjs seedance/r12-1-regression.test.mjs seedance/r12-2-status-regression.test.mjs seedance/r12-3-status-binding-regression.test.mjs seedance/r18-flat-tree-regression.test.mjs
```

Expected: ALL PASS

- [ ] **Step 3: 审计禁止修改文件**

确认 PR changed files 不包含：

```text
seedance/app-v46.js
seedance/ffmpeg-class-worker.js
```

- [ ] **Step 4: Commit**

```bash
git add ai-assistant.html supabase-config.js
git commit -m "chore(video): publish flat task tree R18 assets"
```

---

### Task 5: PR、CI 与 Pages 发布

**Files:**
- No runtime file changes

**Interfaces:**
- Consumes: Tasks 1-4
- Produces: production deployment

- [ ] **Step 1: Open PR**

PR title:

```text
Video Studio：左侧简化为项目→任务两层结构
```

- [ ] **Step 2: 等待 Davis Video A Version Check**

Expected: `success`

- [ ] **Step 3: 审计 PR changed files**

必须只有 R18 相关前端、测试、文档和缓存版本文件。

- [ ] **Step 4: Merge**

使用 merge commit 合并到 `main`。

- [ ] **Step 5: 验证 GitHub Pages**

Expected: latest Pages build `status=built` 且 commit 等于 PR merge commit。
