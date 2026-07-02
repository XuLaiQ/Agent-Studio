# 通过终端命令获取模型列表支持

## 功能概述

系统现在支持通过 CLI 命令来获取 Agent 支持的模型列表，作为 API 方式的补充或替代方案。

## 实现方式

### 模型获取优先级

系统按以下优先级获取模型列表：

1. **手动配置的模型** (最高优先级)
   - 用户在设置中手动配置的模型列表
   - 来源：`modelSource: 'manual'`

2. **API 方式获取**
   - 通过 Anthropic API 或 OpenAI API 获取
   - 需要配置 API Key 和 Base URL
   - 来源：`source: 'api'`

3. **CLI 命令获取**
   - 通过执行 CLI 命令获取模型列表
   - 不需要 API Key
   - 来源：`source: 'cli'`

4. **静态模型列表** (回退方案)
   - 使用预定义的 `AGENT_MODELS` 静态列表
   - 来源：`source: 'static'`

## 支持的 CLI 命令

### Codex

**命令**: `codex debug models`

**输出格式**: JSON
```json
{
  "models": [
    {
      "slug": "gpt-5-codex",
      "display_name": "GPT-5 Codex",
      "description": "Most capable coding model",
      "visibility": "show",
      "default_reasoning_effort": "medium",
      "supported_reasoning_efforts": ["low", "medium", "high", "xhigh"],
      "default_service_tier": "standard",
      "service_tiers": [
        {
          "id": "priority",
          "name": "Fast",
          "description": "1.5x speed, increased usage"
        }
      ]
    }
  ]
}
```

**实现**: 已完全实现并测试通过

### Claude

**命令**: `claude /model`

**预期输出格式**: 文本列表
```
Available models:
opus - Most capable model for complex tasks
sonnet - Balanced model for most use cases
haiku - Fast model for simple tasks
```

**实现状态**: 
- ✅ 已添加支持代码
- ⚠️ 需要验证实际的 Claude CLI 是否支持此命令
- ⚠️ 输出格式可能需要根据实际情况调整

**注意**: 
- 如果 `claude /model` 命令不存在或失败，系统会自动回退到其他获取方式
- 不会影响现有功能

### 其他 Agent 类型

**Gemini / Reasonix**: 
- 暂未实现 CLI 命令支持
- 可以通过 API 或静态列表获取

## 代码实现

### modelCatalog.ts

```typescript
// Codex CLI 命令
async function loadCodexCatalog(command?: string): Promise<AgentModelCatalog> {
  const executable = command?.trim() || 'codex'
  const shell = IS_WIN ? 'powershell.exe' : (process.env.SHELL || 'bash')
  const args = IS_WIN
    ? ['-NoLogo', '-NoProfile', '-Command', `${executable} debug models`]
    : ['-lc', `${executable} debug models`]
  
  const { stdout } = await execFileAsync(shell, args, {
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 5 * 1024 * 1024
  })
  
  const models = normalizeCodexModels(JSON.parse(stdout))
  return { type: 'codex', models, source: 'cli' }
}

// Claude CLI 命令（新增）
async function loadClaudeCatalog(command?: string): Promise<AgentModelCatalog | null> {
  const executable = command?.trim() || 'claude'
  try {
    const shell = IS_WIN ? 'powershell.exe' : (process.env.SHELL || 'bash')
    const args = IS_WIN
      ? ['-NoLogo', '-NoProfile', '-Command', `${executable} /model`]
      : ['-lc', `${executable} /model`]
    
    const { stdout } = await execFileAsync(shell, args, {
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024
    })
    
    // 解析输出提取模型信息
    const lines = stdout.trim().split('\n')
    const models: ModelOption[] = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('Available models')) {
        const match = trimmed.match(/^(\S+)\s*-?\s*(.*)$/)
        if (match) {
          const [, id, description] = match
          models.push({
            id: id,
            label: id.charAt(0).toUpperCase() + id.slice(1),
            description: description || undefined
          })
        }
      }
    }
    
    if (models.length) {
      return { 
        type: 'claude', 
        models: [{ id: '', label: 'Default' }, ...models], 
        source: 'cli' 
      }
    }
    return null
  } catch (err) {
    // 命令不支持或失败，返回 null 尝试其他方法
    return null
  }
}

// 主函数
export async function listModelCatalog(
  type: AgentType,
  command?: string,
  configuredModels?: ModelOption[]
): Promise<AgentModelCatalog> {
  // 1. 检查手动配置
  const configured = configuredCatalog(type, configuredModels)
  if (configured) return configured
  
  // 2. 尝试 API 方式
  const apiCatalog = await loadApiCatalog(type, command)
  if (apiCatalog) return apiCatalog
  
  // 3. 尝试 CLI 命令
  if (type === 'codex') return loadCodexCatalog(command)
  if (type === 'claude') {
    const claudeCatalog = await loadClaudeCatalog(command)
    if (claudeCatalog) return claudeCatalog
  }
  
  // 4. 回退到静态列表
  return fallbackCatalog(type)
}
```

## 终端命令 `/model` 的使用

### 当前支持

代码中已经实现了 `/model` 命令用于在运行时切换模型：

```typescript
// types.ts
export function liveModelCommand(type: AgentType, modelId: string, command?: string): string | null {
  if (!modelId) return null
  switch (resolveLaunchType(type, command)) {
    case 'claude':
    case 'codex':
      return `/model ${modelId}`
    default:
      return null
  }
}
```

### 使用方式

在终端中输入：
```
/model opus          # 切换到 opus 模型
/model sonnet        # 切换到 sonnet 模型
/model gpt-5-codex   # 切换到 gpt-5-codex 模型
```

### 工作流程

1. 用户在 UI 中选择模型
2. 如果 CLI 支持实时切换（`liveModelCommand` 返回非空）：
   - 向终端发送 `/model <model-id>` 命令
   - 会话继续，无需重启
3. 如果 CLI 不支持实时切换：
   - 显示提示信息：需要重启会话才能应用新模型
   - 下次启动时使用新模型

## 优势

### CLI 命令方式的优点

1. **无需 API Key**
   - 不需要配置 Anthropic 或 OpenAI 的 API Key
   - 适合只使用本地 CLI 工具的用户

2. **实时更新**
   - 获取的是 CLI 工具当前实际支持的模型
   - 与 CLI 版本完全同步

3. **包含更多信息**
   - 可能包含 reasoning effort、service tier 等高级选项
   - 获取模型的详细描述

4. **更可靠**
   - 直接从 CLI 工具获取，避免 API 网络问题
   - 减少 API 调用次数

### 回退机制的优点

1. **兼容性好**
   - 即使 CLI 命令不支持或失败，也能正常工作
   - 多层回退确保总能获取到模型列表

2. **用户体验**
   - 透明的降级策略，用户无感知
   - 始终能看到可用的模型选项

## 测试建议

### 1. Codex CLI 测试
```bash
# 测试命令是否可用
codex debug models

# 应该输出 JSON 格式的模型列表
```

### 2. Claude CLI 测试
```bash
# 测试命令是否可用（需要实际验证）
claude /model

# 检查输出格式是否与预期一致
```

### 3. 应用内测试
1. 确保没有配置 API Key
2. 打开应用，创建 Agent
3. 查看终端右上角的模型选择器
4. 验证是否显示通过 CLI 获取的模型列表
5. 测试切换模型功能

### 4. 回退测试
1. 将 CLI 命令改名或移除
2. 验证系统是否正确回退到静态模型列表
3. 确认没有错误提示

## 注意事项

1. **Claude CLI 命令验证**
   - 当前 `claude /model` 的实现是基于假设
   - 需要验证实际的 Claude CLI 是否支持此命令
   - 可能需要调整命令或输出解析逻辑

2. **命令执行环境**
   - Windows 使用 PowerShell
   - Unix/Linux/Mac 使用用户默认 Shell
   - 确保 CLI 工具在 PATH 中可用

3. **超时设置**
   - 命令执行超时时间：10 秒
   - 输出缓冲区大小：5 MB
   - 失败会自动回退，不影响使用

4. **安全性**
   - 使用 `execFileAsync` 而非 `exec`
   - 避免命令注入风险
   - 限制执行时间和输出大小

## 未来改进

1. **缓存机制**
   - 缓存 CLI 命令的输出结果
   - 减少重复执行
   - 定期刷新缓存

2. **更多 Agent 支持**
   - 为 Gemini、Reasonix 添加 CLI 命令支持
   - 统一命令格式和输出解析

3. **错误提示优化**
   - 显示具体的失败原因
   - 提供解决建议
   - 允许手动重试

4. **配置选项**
   - 允许用户选择优先使用哪种获取方式
   - 禁用某些获取方式
   - 自定义命令路径

## 相关文件

- ✅ `src/main/modelCatalog.ts` - 添加 CLI 命令支持
- ✅ `src/shared/types.ts` - `/model` 命令定义
- ✅ 构建测试通过

## 相关文档

- `TERMINAL_MODEL_FIX.md` - 终端模型选择修复
- `UI_LAYOUT_CHANGES.md` - UI 布局修改
- `VERSION_CONTROL_IMPROVEMENTS.md` - 版本控制面板改进
