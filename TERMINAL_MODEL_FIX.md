# 终端模型选择问题修复

## 问题描述

在终端窗口的右上角，模型选择下拉框一直显示 "default"，而不是显示当前 Agent 类型所支持的实际模型列表（如 Claude 的 Opus、Sonnet、Haiku 等）。

## 根本原因

在 `src/main/modelCatalog.ts` 文件中，`listModelCatalog` 函数的回退机制存在问题：

```typescript
export async function listModelCatalog(
  type: AgentType,
  command?: string,
  configuredModels?: ModelOption[]
): Promise<AgentModelCatalog> {
  const configured = configuredCatalog(type, configuredModels)
  if (configured) return configured
  const apiCatalog = await loadApiCatalog(type, command)
  if (apiCatalog) return apiCatalog
  if (type === 'codex') return loadCodexCatalog(command)
  return fallbackCatalog(type)  // 问题在这里
}
```

当满足以下条件时会触发问题：
1. 用户没有配置手动模型列表
2. 没有配置 API（如 ANTHROPIC_API_KEY）或 API 调用失败
3. Agent 类型不是 'codex'

在这些情况下，`fallbackCatalog` 函数只返回一个简单的 "Default" 模型：

```typescript
function fallbackCatalog(type: AgentType, error?: string): AgentModelCatalog {
  return {
    type,
    models: [{ id: '', label: 'Default' }],  // 只有一个默认模型
    source: 'static',
    error
  }
}
```

但实际上，在 `src/shared/types.ts` 中已经定义了每个 Agent 类型的静态模型列表：

```typescript
export const AGENT_MODELS: Record<string, ModelOption[]> = {
  claude: [
    { id: '', label: 'Default', reasoningEfforts: CLAUDE_REASONING_EFFORTS },
    { id: 'opus', label: 'Opus 4.8', reasoningEfforts: CLAUDE_REASONING_EFFORTS },
    { id: 'sonnet', label: 'Sonnet 4.6', reasoningEfforts: CLAUDE_REASONING_EFFORTS },
    { id: 'haiku', label: 'Haiku 4.5', reasoningEfforts: CLAUDE_REASONING_EFFORTS },
    { id: 'fable', label: 'Fable 5', reasoningEfforts: CLAUDE_REASONING_EFFORTS }
  ],
  codex: [...],
  gemini: [{ id: '', label: 'Default' }],
  reasonix: [{ id: '', label: 'Default' }]
}
```

这些预定义的模型列表应该作为最终的回退方案，但是 `fallbackCatalog` 函数并没有使用它们。

## 修复方案

### 1. 导入 AGENT_MODELS

在 `src/main/modelCatalog.ts` 中添加 `AGENT_MODELS` 的导入：

```typescript
import {
  AGENT_MODELS,  // 新增
  type AgentModelCatalog,
  type AgentType,
  type ModelOption,
  type ReasoningEffortOption,
  type ServiceTierOption
} from '../shared/types'
```

### 2. 更新 fallbackCatalog 函数

修改 `fallbackCatalog` 函数以使用预定义的模型列表：

```typescript
function fallbackCatalog(type: AgentType, error?: string): AgentModelCatalog {
  // 尝试使用该 agent 类型的预定义模型
  const predefinedModels = AGENT_MODELS[type]
  const models = predefinedModels && predefinedModels.length > 0 
    ? predefinedModels 
    : [{ id: '', label: 'Default' }]
  
  return {
    type,
    models,
    source: 'static',
    error
  }
}
```

## 修复后的效果

现在，即使在没有配置 API 密钥或 API 调用失败的情况下，每个 Agent 类型的终端窗口都会显示其对应的预定义模型列表：

- **Claude**: Default, Opus 4.8, Sonnet 4.6, Haiku 4.5, Fable 5
- **Codex**: Default, GPT-5 Codex, o3
- **Gemini**: Default
- **Reasonix**: Default

用户可以在终端右上角的模型选择器中看到并选择这些模型。

## 测试方法

1. 构建项目：`npm run build`
2. 运行应用：`npm run dev` 或 `npm start`
3. 创建一个新项目并添加不同类型的 Agent（Claude、Codex 等）
4. 在终端窗口右上角点击模型选择按钮
5. 验证是否显示了该 Agent 类型的所有预定义模型

## 相关文件

- `src/main/modelCatalog.ts` - 模型目录获取逻辑（已修改）
- `src/shared/types.ts` - Agent 模型定义
- `src/renderer/src/components/TerminalView.vue` - 终端视图组件
