# Agent Studio

[中文版](README.md) | [English](README.en.md)

Agent Studio 是一个用于管理多个 AI 编码 CLI Agent 的桌面工作台。它支持在同一个本地项目中同时运行 Claude、Codex、Gemini、OpenCode 等命令行 Agent，并为每个 Agent 分配独立的真实终端，便于并行分析、开发、审查和调试。

项目技术栈为 **Electron + Vue 3 + TypeScript + Pinia + Element Plus + xterm.js**。

当前版本为 **Phase 1 MVP**，核心工作流如下：

```text
导入项目 -> 创建 Agent -> 启动 CLI -> 实时终端交互
```

## 目录

- [功能特性](#功能特性)
- [系统架构](#系统架构)
- [核心模块](#核心模块)
- [本地开发](#本地开发)
- [CLI 环境要求](#cli-环境要求)
- [界面语言切换](#界面语言切换)
- [添加新的 Agent 类型](#添加新的-agent-类型)
- [Windows 打包](#windows-打包)
- [修改 EXE 图标](#修改-exe-图标)
- [为什么选择 @lydell/node-pty](#为什么选择-lydellnode-pty)
- [后续规划](#后续规划)
- [项目目标](#项目目标)

## 功能特性

### 项目导入

- 支持选择本地项目目录。
- 导入后的项目会自动保存。
- 可在左侧项目列表中快速切换项目。

### 文件资源管理器

- 支持查看当前项目目录结构。
- 使用懒加载方式加载目录树。
- 大型项目也能保持较好的浏览体验。

### 创建 Agent

支持为当前项目创建多个 AI Agent：

- Claude
- Codex
- Gemini
- OpenCode

每个 Agent 都独立运行，互不影响。

### 实时终端

每个 Agent 都会启动一个真实终端 PTY：

- Windows 使用 ConPTY。
- Linux 和 macOS 使用 PTY。
- 终端通过 xterm.js 渲染。

支持能力：

- 实时输出
- 键盘输入
- 命令交互
- ANSI 颜色显示
- 长时间运行任务

### Agent 标签页

- 支持多 Agent 标签切换。
- 切换 Agent 不会中断正在运行的终端任务。
- Agent 可持续在后台执行。
- 支持实时状态展示。
- 支持重启 Agent，并重新拉起对应 CLI。

状态说明：

| 状态 | 说明 |
| --- | --- |
| Idle | 空闲 |
| Running | 运行中 |
| Error | 异常 |

### Agent Bus（消息转发）

> 完整说明（含任务引擎/工作流）见 [docs/agent-collaboration.md](docs/agent-collaboration.md)。

支持在同一项目内把消息从一个 Agent 转发给另一个（或多个）Agent，让多个 CLI 协作：

- **转发内容**：在终端工具栏点击转发按钮（→），可在弹出框中手动输入消息；留空时自动使用当前终端的选中文本（便于把某个 Agent 的输出转发给另一个）。
- **发送目标**：可选择同项目内某一个 Agent 发送，也可一键「广播到全部」其它 Agent。
- **自动投递**：消息会以 `[来自 {源 Agent 名}] {内容}` 的形式写入目标终端并自动回车提交，目标 Agent 立即开始处理。
- **送达反馈**：发送后提示成功送达的数量；若目标 CLI 未在运行，则会跳过并提示「没有目标接收」。

实现位置：

- `src/main/agentBus.ts`：消息路由中枢，通过 PTY 写入目标终端。
- `src/main/ipc.ts`：`bus:send` IPC 处理器。
- `src/preload/index.ts`：`sendToAgent` / `onBusMessage` 桥接 API。
- `src/renderer/src/components/TerminalView.vue`：终端工具栏中的转发入口与目标选择。

### 数据持久化

项目和 Agent 配置会自动保存到 Electron 的 `userData` 目录。

保存内容包括：

- 项目列表
- Agent 信息
- Agent 与项目的关联关系

应用重启后会自动恢复。

### 界面语言

- 支持中文与英文界面切换。
- 顶部标题栏右侧提供语言下拉选择器。
- 选择结果会持久化保存，重启后保持上次选择。
- 首次启动时会根据浏览器/系统语言自动选择（`zh` 开头为中文，否则英文）。
- 切换语言会同步 Element Plus 内置组件（对话框、确认框等）的语言。

详细配置说明见 [界面语言切换](#界面语言切换)。

## 系统架构

```text
Vue UI (renderer)
   -> contextBridge window.studio (preload)
   -> IPC
Electron Main
   -> store.ts       项目和 Agent 的 JSON 持久化
   -> ptyManager.ts  Agent 终端生命周期管理
   -> fileTree.ts    项目目录树加载
   -> ipc.ts         IPC 处理器和事件
        -> 在项目目录中启动 claude / codex / gemini / opencode
```

## 核心模块

### `src/shared/types.ts`

主进程与渲染进程共享的数据类型定义，包含：

- `Project`
- `Agent`
- `TerminalState`
- IPC 类型定义

### `src/main/`

Electron 主进程代码，主要负责：

- 项目管理
- Agent 生命周期管理
- 文件系统访问
- IPC 通信
- PTY 进程管理

### `src/preload/index.ts`

通过 ContextBridge 向前端暴露安全 API：

```typescript
window.studio
```

渲染进程无需直接访问 Node.js API。

### `src/renderer/src/`

Vue 前端应用代码，包含：

- 页面入口
- Pinia Store
- Agent 工作区
- 项目侧边栏
- 文件树组件
- Terminal 组件

## 本地开发

安装依赖：

```bash
npm install
```

启动开发模式：

```bash
npm run dev
```

构建并预览：

```bash
npm run build
npm start
```

## CLI 环境要求

以下命令需要能够在系统环境变量 `PATH` 中找到：

```bash
claude
codex
gemini
opencode
```

可以使用下面的命令检查：

```bash
claude --version
codex --version
gemini --version
opencode --version
```

如果命令不存在：

- 对应 Agent 无法启动。
- Agent 状态会显示为 `Error`。
- 终端中会输出错误信息。

## 界面语言切换

应用内置中英文双语，无需任何额外依赖。语言切换由 `src/renderer/src/i18n.ts` 统一管理：它提供一个响应式的 `locale`、翻译函数 `t()`，并将当前语言持久化到浏览器 `localStorage`。

### 使用方式

在顶部标题栏右侧的语言下拉框中选择 **English** 或 **中文** 即可即时切换，刷新或重启后会保持上次选择。

### 语言初始值

首次启动（`localStorage` 中没有记录）时按以下规则确定初始语言：

| 条件 | 结果 |
| --- | --- |
| `localStorage` 中已有有效记录 | 使用记录的语言 |
| 系统/浏览器语言以 `zh` 开头 | 中文 |
| 其他情况 | 英文 |

切换后会写入 `localStorage`，键名为 `agent-studio.locale`，取值为 `en` 或 `zh`。

### 在代码中使用翻译

在组件中导入并调用 `t()`，它会随 `locale` 变化自动重新渲染：

```vue
<script setup lang="ts">
import { t } from '../i18n'
</script>

<template>
  <span>{{ t('projects.title') }}</span>
  <!-- 支持 {占位符} 插值 -->
  <p>{{ t('agent.close.confirm', { name: agent.name }) }}</p>
</template>
```

Element Plus 内置组件（对话框、确认框等）的语言通过 `App.vue` 中的 `<el-config-provider :locale="elementLocale">` 同步，无需在每个组件单独处理。

### 新增一种语言

1. 在 `src/renderer/src/i18n.ts` 的 `Locale` 类型中加入新的语言代码。
2. 在 `messages` 对象中补充对应语言的字典（缺失的键会自动回退到英文）。
3. 在 `LOCALE_OPTIONS` 中添加下拉选项。
4. 如需让 Element Plus 内置组件跟随，从 `element-plus/es/locale/lang/*` 引入对应 locale 并在 `elementLocale` 中返回。

### 相关实现位置

- `src/renderer/src/i18n.ts`：语言状态、翻译函数、持久化与 Element Plus locale。
- `src/renderer/src/App.vue`：语言下拉选择器与 `el-config-provider`。
- 各组件（`ProjectSidebar.vue`、`FileExplorer.vue`、`AgentWorkspace.vue`、`AddAgentDialog.vue`、`TerminalView.vue`）：通过 `t()` 渲染界面文案。

## 添加新的 Agent 类型

当前可创建的 Agent 类型由 `src/shared/types.ts` 中的 `AgentType` 和 `AGENT_COMMANDS` 统一配置。创建弹窗、标签页展示、Agent 命名和 PTY 启动都会读取这份配置，因此新增 Agent 时通常只需要改这一处。

### 1. 扩展 `AgentType`

在 `src/shared/types.ts` 中把新的类型加入联合类型。例如要新增 `aider`：

```typescript
export type AgentType = 'claude' | 'codex' | 'gemini' | 'opencode' | 'aider'
```

### 2. 添加命令配置

继续在同一个文件的 `AGENT_COMMANDS` 中添加配置：

```typescript
export const AGENT_COMMANDS: Record<AgentType, AgentCommand> = {
  claude: { command: 'claude', args: [], label: 'Claude' },
  codex: { command: 'codex', args: [], label: 'Codex' },
  gemini: { command: 'gemini', args: [], label: 'Gemini' },
  opencode: { command: 'opencode', args: [], label: 'OpenCode' },
  aider: { command: 'aider', args: [], label: 'Aider' }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `command` | 实际启动的 CLI 命令，必须能在系统 `PATH` 中找到。 |
| `args` | 启动命令时附加的默认参数，没有参数时使用空数组。 |
| `label` | 在创建弹窗和 Agent 标签页中展示的名称。 |

如果某个 CLI 需要默认启动参数，可以写入 `args`：

```typescript
aider: { command: 'aider', args: ['--model', 'openai/gpt-4.1'], label: 'Aider' }
```

### 3. 确认 CLI 可用

新增的 `command` 需要能在系统环境变量 `PATH` 中直接执行：

```bash
aider --version
```

如果命令无法执行，Agent Studio 仍会展示该类型，但启动时会进入 `Error` 状态，并在终端输出启动失败信息。

### 4. 重新构建或启动

修改完成后启动开发模式验证：

```bash
npm run dev
```

如果要发布安装包，需要重新打包：

```bash
npm run dist
```

### 相关实现位置

- `src/shared/types.ts`：定义 Agent 类型和 CLI 命令配置。
- `src/renderer/src/components/AddAgentDialog.vue`：从 `AGENT_COMMANDS` 自动生成创建选项。
- `src/main/ptyManager.ts`：根据 `AGENT_COMMANDS` 启动对应 CLI。
- `src/main/store.ts`：根据 `AGENT_COMMANDS` 生成默认 Agent 名称。

## Windows 打包

生成 Windows 安装包：

```powershell
npm install
npm run dist
```

输出示例：

```text
release/Agent Studio-0.1.0-Setup.exe
```

生成免安装目录：

```powershell
npm run dist:dir
```

输出示例：

```text
release/win-unpacked/Agent Studio.exe
```

当前 `electron-builder.yml` 中的 NSIS 配置：

```yaml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

该配置会启用完整安装向导，并允许用户选择安装目录。

## 修改 EXE 图标

Windows 应用图标由 `electron-builder.yml` 中的 `win.icon` 配置控制。当前配置里已经预留了图标路径：

```yaml
directories:
  buildResources: build

win:
  icon: build/icon.ico
```

如果要替换 EXE 图标，可以按下面步骤操作。

### 1. 准备图标文件

在项目根目录创建 `build` 目录，并放入图标文件：

```text
build/
└── icon.ico
```

Windows 推荐使用 `.ico` 文件。为了兼容任务栏、桌面快捷方式、开始菜单、安装器和文件资源管理器缩放显示，建议 `icon.ico` 内包含多种尺寸：

| 尺寸 | 用途 |
| --- | --- |
| `16x16` | 小图标、列表视图 |
| `24x24` | 部分高 DPI 小尺寸显示 |
| `32x32` | 常见窗口和快捷方式图标 |
| `48x48` | 文件资源管理器中等图标 |
| `64x64` | 高 DPI 中等图标 |
| `128x128` | 大图标显示 |
| `256x256` | Windows 推荐的大尺寸图标，通常必须包含 |

最少应包含 `256x256`，更推荐使用包含 `16x16` 到 `256x256` 多尺寸位图的 `.ico` 文件，避免缩放后发糊。

### 2. 启用 `win.icon`

打开 `electron-builder.yml`，取消 `win.icon` 的注释：

```yaml
win:
  target:
    - target: nsis
      arch:
        - x64
  artifactName: ${productName}-${version}-Setup.${ext}
  icon: build/icon.ico
```

### 3. 重新打包

修改图标后需要重新构建安装包：

```powershell
npm run dist
```

如果只想生成免安装目录用于快速检查：

```powershell
npm run dist:dir
```

生成结果位于：

```text
release/
├── Agent Studio-0.1.0-Setup.exe
└── win-unpacked/Agent Studio.exe
```

### 4. 图标没有立即变化时

Windows 可能会缓存旧图标。如果打包后仍看到旧图标，可以尝试：

- 删除旧的 `release/` 输出目录后重新打包。
- 卸载旧版本应用，再安装新版本。
- 更换安装目录或重启资源管理器。
- 检查 `build/icon.ico` 是否确实包含 `256x256` 尺寸。

如果还需要自定义安装器图标，可以在 `nsis` 下继续配置安装器相关图标，例如：

```yaml
nsis:
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
```

## 为什么选择 `@lydell/node-pty`

标准 `node-pty` 在 Windows 环境中通常需要编译原生代码，安装时可能依赖：

- Visual Studio Build Tools
- C++ 编译器
- Python

`@lydell/node-pty` 是兼容 `node-pty` API 的预编译版本，提供基于 N-API 的二进制包。

主要优势：

- 无需安装 Visual Studio Build Tools。
- 无需本地编译原生模块。
- Electron 兼容性更好。
- 基于 N-API，跨 Node 和 Electron 版本更稳定。

## 后续规划

### 分屏模式

支持多个 Agent 终端并排查看，例如：

```text
+-------------+-------------+
| Claude      | Codex       |
| Terminal    | Terminal    |
+-------------+-------------+
```

### Agent Bus

支持 Agent 之间的消息传递与协作：

```text
Claude -> Agent Bus -> Codex
```

进展：

- 消息转发 ✅ 已实现（见 [Agent Bus（消息转发）](#agent-bus消息转发)，支持单点发送与广播）
- 任务协作 ✅ 已实现第一版（线性工作流，见 [docs/agent-collaboration.md](docs/agent-collaboration.md)）
- 结果共享 ✅ 已实现（工作流中上一步产出自动接力给下一步；也可手动转发终端选区）

### 任务引擎

已实现第一版线性工作流（创建任务、指派 Agent、按步自动执行、结果接力、手动推进/重试/暂停），详见 [docs/agent-collaboration.md](docs/agent-collaboration.md)。

下一阶段方向：**主代理编排多子代理**——用户只给一句高层目标，由主代理自动拆解角色、动态创建多个子代理、按依赖关系并发调度。设计草案见 [docs/agent-orchestration.md](docs/agent-orchestration.md)。

其它增强：

- 自动重试（全自动）
- 分支 / 并行 / 条件编排
- 运行历史持久化

示例：

```text
需求分析 -> Claude
生成代码 -> Codex
代码审查 -> Gemini
修复问题 -> OpenCode
```

### SQLite 本地数据库

后续计划使用 SQLite 替代 JSON 存储，支持：

- 项目管理
- Agent 历史记录
- 会话记录
- Prompt 历史
- Workflow 历史

## 项目目标

Agent Studio 的目标是打造一个类似 Cursor + Claude Code + Codex CLI 的本地 Agent 协作平台。

核心理念：

> 一个项目，多个 Agent，真实终端，自主协作。

让开发者能够在同一个本地项目中同时调度多个 AI 编码助手，完成分析、开发、审查与优化工作。
"# Agent-Studio"
