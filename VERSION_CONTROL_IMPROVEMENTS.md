# 版本控制面板改进

## 修改概述

根据用户需求，对版本控制面板进行了以下改进：
1. **自适应宽度**：面板宽度现在会自动适应左侧边栏的宽度
2. **支持展开/收起**：所有主要区域都支持折叠，提升空间利用效率

## 主要更改

### 1. 自适应宽度

#### VersionControlPanel.vue
**文件**: `src/renderer/src/components/VersionControlPanel.vue`

**样式修改**:
```css
.version-panel {
  padding: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;  /* 新增：自动填充容器宽度 */
}

.version-panel.split-view {
  display: flex;  /* 从 grid 改为 flex，更灵活 */
  flex-direction: column;
}
```

#### TerminalView.vue
**文件**: `src/renderer/src/components/TerminalView.vue`

**弹窗宽度优化**:
```css
/* 模型选择弹窗 */
.model-popover {
  min-width: 220px;
  max-width: min(320px, 90vw);
  width: max-content;  /* 自适应内容宽度 */
  padding: 0;
}

/* 历史记录弹窗 */
.history-popover {
  min-width: 240px;
  max-width: min(340px, 90vw);
  width: max-content;  /* 自适应内容宽度 */
  padding: 0;
  display: flex;
  flex-direction: column;
}
```

### 2. 展开/收起功能

#### 模板结构修改

将原来的 `<div class="group">` 改为 `<details class="group">` 元素：

**修改前**:
```vue
<div class="group">
  <div class="group-head">
    <span>暂存的更改</span>
    <button>...</button>
  </div>
  <!-- 内容 -->
</div>
```

**修改后**:
```vue
<details class="group" open>
  <summary class="group-head">
    <span>暂存的更改</span>
    <button>...</button>
  </summary>
  <!-- 内容 -->
</details>
```

#### 可折叠区域

现在以下区域都支持展开/收起：

1. **暂存的更改** (`details.group` - 默认展开)
2. **更改** (`details.group` - 默认展开)
3. **本地分支** (`details.details` - 默认展开)
4. **远程分支** (`details.details` - 默认收起)
5. **提交历史** (`details.history-section` - 默认展开)
6. **手动连接** (`details.details` - 默认收起)

#### 折叠指示器样式

```css
.details summary,
.group summary {
  position: relative;
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 12px;
  list-style: none;
  cursor: pointer;
  user-select: none;
}

/* 隐藏默认的 details 标记 */
.details summary::-webkit-details-marker,
.group summary::-webkit-details-marker {
  display: none;
}

/* 自定义三角形指示器 */
.details summary::before,
.group summary::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 50%;
  transform: translateY(-50%) rotate(90deg);
  width: 0;
  height: 0;
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-top: 5px solid var(--text-dim);
  transition: transform 0.2s ease;
}

/* 展开状态 */
.details[open] summary::before,
.group[open] summary::before {
  transform: translateY(-50%) rotate(180deg);
}
```

## 功能特性

### 1. 自适应宽度
- ✅ 面板宽度自动适应左侧边栏
- ✅ 弹窗宽度根据内容自适应（有最小和最大限制）
- ✅ 响应式设计，适配不同屏幕尺寸

### 2. 展开/收起
- ✅ 点击区域标题即可折叠/展开
- ✅ 平滑的动画过渡效果
- ✅ 视觉指示器（旋转三角形）
- ✅ 保持操作按钮可用（如 +/- 按钮）
- ✅ 支持键盘操作（Enter 键）

### 3. 空间优化
- ✅ 不需要的区域可以收起，节省空间
- ✅ 提交历史区域独立滚动
- ✅ 更高效的垂直空间利用

## 布局结构

```
┌─────────────────────────────────────┐
│ 源代码管理                     [工具栏] │ ← 标题 + 操作按钮
├─────────────────────────────────────┤
│ 当前分支: main                        │
├─────────────────────────────────────┤
│ [提交消息输入框]                       │
│ [提交按钮]                            │
├─────────────────────────────────────┤
│ ▼ 暂存的更改 (2)               [-]   │ ← 可折叠
│   ├─ file1.ts                  M     │
│   └─ file2.vue                 M     │
├─────────────────────────────────────┤
│ ▼ 更改 (3)                     [+]   │ ← 可折叠
│   ├─ file3.ts                  M     │
│   ├─ file4.ts                  U     │
│   └─ file5.ts                  D     │
├─────────────────────────────────────┤
│ ▼ 本地分支 (2)                [+]    │ ← 可折叠
│   ├─ main (current)                  │
│   ├─ feature/v1.0.0                  │
│   └─ [创建新分支输入框]               │
├─────────────────────────────────────┤
│ ▶ 远程分支 (5)                       │ ← 可折叠（默认收起）
├─────────────────────────────────────┤  
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │ ← 分隔线
├─────────────────────────────────────┤
│ ▼ 提交历史 (10)                      │ ← 可折叠
│   ├─ 优化版本控制面板                 │
│   ├─ 修复终端模型选择                 │
│   └─ ... (独立滚动)                  │
├─────────────────────────────────────┤
│ ▶ 手动连接 (0)                       │ ← 可折叠（默认收起）
└─────────────────────────────────────┘
```

## 用户体验改进

1. **更灵活的宽度**：
   - 面板宽度随左侧边栏自动调整
   - 不再有固定宽度限制
   - 弹窗自适应内容，不浪费空间

2. **更好的空间管理**：
   - 不需要的区域可以收起
   - 默认展开常用功能
   - 减少滚动需求

3. **清晰的视觉反馈**：
   - 旋转三角形指示展开/收起状态
   - 平滑的动画过渡
   - 一致的交互模式

4. **保持功能完整**：
   - 折叠后仍可快速访问操作按钮
   - 展开/收起不影响其他区域
   - 状态清晰可见

## 与 VS Code 的对比

改进后的版本控制面板更接近 VS Code 的体验：

| 特性 | VS Code | Agent Studio (修改后) |
|------|---------|---------------------|
| 自适应宽度 | ✅ | ✅ |
| 展开/收起 | ✅ | ✅ |
| 暂存/更改 | ✅ | ✅ |
| 分支管理 | ✅ | ✅ |
| 提交历史 | ✅ | ✅ |
| 独立滚动 | ✅ | ✅ |
| 视觉指示器 | ✅ | ✅ |

## 测试建议

1. **宽度自适应测试**：
   - 拖动左侧边栏调整宽度
   - 验证版本控制面板是否正确自适应
   - 测试极小和极大宽度下的显示

2. **展开/收起测试**：
   - 点击每个区域标题
   - 验证折叠/展开动画
   - 测试操作按钮（+/-）是否仍可用
   - 验证键盘操作（Enter 键）

3. **功能完整性测试**：
   - 暂存/取消暂存文件
   - 提交更改
   - 切换分支
   - 查看提交历史
   - 展开提交详情

4. **滚动测试**：
   - 验证各区域的独立滚动
   - 测试大量文件/提交的性能
   - 确认提交历史区域的滚动独立性

## 未来优化建议

1. **记住折叠状态**：
   - 使用 localStorage 保存用户的折叠偏好
   - 重新打开应用时恢复状态

2. **快捷键支持**：
   - Ctrl+B：展开/收起所有区域
   - 数字键：快速定位到特定区域

3. **性能优化**：
   - 虚拟滚动处理大量提交记录
   - 懒加载展开的内容

4. **更多自定义**：
   - 允许用户重排区域顺序
   - 可配置默认展开/收起状态
   - 自定义区域高度比例

## 文件修改清单

- ✅ `src/renderer/src/components/VersionControlPanel.vue` - 添加展开/收起功能，自适应宽度
- ✅ `src/renderer/src/components/TerminalView.vue` - 弹窗宽度自适应
- ✅ 构建测试通过

## 相关文档

- `UI_LAYOUT_CHANGES.md` - 之前的布局修改记录
- `TERMINAL_MODEL_FIX.md` - 终端模型选择修复记录
