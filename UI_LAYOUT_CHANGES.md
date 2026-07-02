# UI 布局修改说明

## 修改概述

根据用户提供的 VS Code 风格界面截图，对项目左侧面板布局进行了修改，特别是源代码管理（版本控制）面板的布局结构。

## 主要更改

### 1. 终端模型选择修复（之前完成）
- 修复了终端窗口右上角模型选择一直显示 "default" 的问题
- 现在会正确显示每个 Agent 类型支持的模型列表

### 2. 版本控制面板布局优化

#### App.vue 修改
**文件**: `src/renderer/src/App.vue`

**主要更改**:
- 修改了 `.source-control-sidebar` 样式，使用 `flex` 布局以支持内部的灵活布局
- 保持了现有的侧边栏视图切换逻辑

**修改的CSS**:
```css
.source-control-sidebar {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
```

#### VersionControlPanel.vue 修改
**文件**: `src/renderer/src/components/VersionControlPanel.vue`

**主要更改**:

1. **添加 viewMode prop**:
   ```typescript
   const props = defineProps<{
     viewMode?: 'full' | 'history'
   }>()
   
   const viewMode = computed(() => props.viewMode || 'full')
   ```

2. **模板结构调整**:
   - 将提交历史部分独立出来，放入一个新的 `.history-container` 容器中
   - 在分支管理和提交历史之间添加了一个分隔线 `.history-divider`
   - 提交历史容器使用独立的滚动区域

3. **样式优化**:
   ```css
   .version-panel {
     padding: 0;
     display: flex;
     flex-direction: column;
     height: 100%;
   }
   
   .history-divider {
     height: 1px;
     background: var(--border);
     margin: 8px 0;
   }
   
   .history-container {
     flex: 1;
     min-height: 0;
     overflow-y: auto;
     overflow-x: hidden;
   }
   
   .history-section {
     margin-top: 0 !important;
   }
   ```

## 布局结构

修改后的源代码管理面板结构如下：

```
┌─────────────────────────────────────┐
│ 源代码管理                            │ ← 标题栏
├─────────────────────────────────────┤
│ fetch / pull / push / refresh        │ ← 工具栏
├─────────────────────────────────────┤
│ 当前分支信息                          │
├─────────────────────────────────────┤
│ 提交消息输入框                        │
│ [提交按钮]                            │
├─────────────────────────────────────┤
│ 暂存的更改 (n)        [-]            │
│   └─ 文件列表（可滚动）                │
├─────────────────────────────────────┤
│ 更改 (n)              [+]            │
│   └─ 文件列表（可滚动）                │
├─────────────────────────────────────┤
│ 本地分支                              │
│   └─ 分支列表 + 创建新分支             │
├─────────────────────────────────────┤
│ 远程分支                              │
│   └─ 远程分支列表                     │
├─────────────────────────────────────┤  ← 分隔线
│ 提交历史 (n)                          │ 
│   ├─ 提交1                            │
│   ├─ 提交2                            │
│   ├─ 提交3                            │
│   └─ ... (独立滚动区域)               │
└─────────────────────────────────────┘
```

## 用户体验改进

1. **分离的滚动区域**: 
   - 提交历史现在有独立的滚动区域
   - 查看历史时不会影响上方的源代码管理操作
   
2. **清晰的视觉分隔**:
   - 使用分隔线明确区分"操作区"和"历史区"
   
3. **更好的空间利用**:
   - 提交历史可以占用更多垂直空间，适合查看大量提交记录
   - 上方的操作区域保持紧凑，便于快速访问常用功能

## 与 VS Code 的对比

修改后的布局更接近 VS Code 的源代码管理面板：
- ✅ 上半部分：暂存、更改、分支管理
- ✅ 下半部分：提交历史（独立滚动）
- ✅ 清晰的视觉分隔
- ✅ 高效的空间利用

## 测试

1. 运行 `npm run build` - ✅ 构建成功
2. 建议手动测试:
   - 切换到源代码管理视图
   - 验证上下区域是否正确显示
   - 测试独立滚动功能
   - 验证所有源代码管理操作（暂存、提交、分支切换等）是否正常工作

## 未来优化建议

1. **可调整分隔**: 
   - 可以考虑添加拖拽分隔条，让用户自定义上下区域的比例
   
2. **历史筛选**:
   - 在提交历史顶部添加搜索/筛选功能
   
3. **性能优化**:
   - 对大量提交记录使用虚拟滚动优化渲染性能

4. **更多 VS Code 特性**:
   - 添加时间线视图
   - 支持 Git Graph 可视化
   - 支持对比选中的两个提交

## 文件修改清单

- ✅ `src/main/modelCatalog.ts` - 修复终端模型选择问题
- ✅ `src/renderer/src/App.vue` - 调整侧边栏样式
- ✅ `src/renderer/src/components/VersionControlPanel.vue` - 重构版本控制面板布局
- ✅ 构建测试通过
