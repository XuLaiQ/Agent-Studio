# Agent Studio

[中文](README.md) | [English](README.en.md)

Agent Studio is a desktop workspace for managing multiple AI coding CLI agents, such as Claude, Codex, Gemini, and OpenCode. Each agent runs in its own real terminal for a selected project.

The project **Electron + Vue 3 + TypeScript + Pinia + Element Plus + xterm.js**.

This is the phase 1 MVP. The core workflow is:

```text
Import project -> Create agent -> Launch CLI -> View live terminal
```

## Features

- **Import project**: Pick a local folder and save it to the project list in the sidebar.
- **File explorer**: Lazy-load the directory tree for the active project.
- **Add agent**: Choose Claude, Codex, Gemini, or OpenCode for the active project.
- **Live terminals**: Each agent starts its CLI through a real PTY. On Windows, it uses ConPTY and provides full interactive I/O through xterm.js.
- **Tabs**: Switch between agents while terminals keep running in the background. Status dots show idle, running, or error states. Restart relaunches the CLI.
- **Language switch**: Toggle the UI between English and Chinese from the header; the choice is persisted and Element Plus components follow the same language. See [UI Language](#ui-language).
- **Persistence**: Projects and agents are stored as JSON in Electron's `userData` directory.

## Architecture

```text
Vue UI (renderer)
   -> contextBridge window.studio (preload)
   -> IPC
Electron Main
   -> store.ts       JSON persistence for projects and agents
   -> ptyManager.ts  one PTY per agent, streaming terminal output to renderer
   -> fileTree.ts    directory tree loading
   -> ipc.ts         IPC handlers and events
        -> spawns claude / codex / gemini / opencode with the project directory as cwd
```

Key files:

- `src/shared/types.ts`: Domain types shared by the main and renderer processes.
- `src/main/`: Electron main process code.
- `src/preload/index.ts`: Typed bridge exposed to the renderer through `window.studio`.
- `src/renderer/src/`: Vue application code, including stores and components.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development app:

```bash
npm run dev
```

Or build and preview:

```bash
npm run build
npm start
```

> The agent CLIs (`claude`, `codex`, `gemini`, and `opencode`) must be available on your system `PATH`. If a CLI cannot be found, the app shows an error state.

## UI Language

The app ships with built-in English and Chinese, with no extra dependencies. Localization is handled by `src/renderer/src/i18n.ts`, which exposes a reactive `locale`, a `t()` translator, and persists the choice to the browser `localStorage`.

### Usage

Pick **English** or **中文** from the language dropdown on the right side of the header. The switch is instant and the selection survives reloads and restarts.

### Initial language

On first launch (no `localStorage` record), the initial language is resolved as:

| Condition | Result |
| --- | --- |
| A valid value already stored | Use the stored language |
| System/browser language starts with `zh` | Chinese |
| Otherwise | English |

The selection is saved to `localStorage` under the key `agent-studio.locale` (`en` or `zh`).

### Translating in code

Import and call `t()` in a component; it re-renders automatically when `locale` changes:

```vue
<script setup lang="ts">
import { t } from '../i18n'
</script>

<template>
  <span>{{ t('projects.title') }}</span>
  <!-- {placeholder} interpolation is supported -->
  <p>{{ t('agent.close.confirm', { name: agent.name }) }}</p>
</template>
```

Element Plus built-in components (dialogs, message boxes, etc.) follow the language via `<el-config-provider :locale="elementLocale">` in `App.vue`.

### Adding a language

1. Add the new language code to the `Locale` type in `src/renderer/src/i18n.ts`.
2. Add its dictionary to `messages` (missing keys fall back to English).
3. Add an entry to `LOCALE_OPTIONS` for the dropdown.
4. Optionally import the matching locale from `element-plus/es/locale/lang/*` and return it from `elementLocale`.

Relevant files: `src/renderer/src/i18n.ts`, `src/renderer/src/App.vue`, and the components that render UI text via `t()`.

## Windows Packaging

Build a Windows installer:

```powershell
npm install
npm run dist
```

The installer is written to `release/`, for example:

```text
release/Agent Studio-0.1.0-Setup.exe
```

You can also build an unpacked portable directory:

```powershell
npm run dist:dir
```

The unpacked app is written to:

```text
release/win-unpacked/Agent Studio.exe
```

The Windows installer uses NSIS. The current `electron-builder.yml` configuration shows the full install wizard and lets users choose the installation path:

```yaml
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
```

## Why `@lydell/node-pty`

The standard `node-pty` package usually compiles native code during installation on Windows and requires Visual Studio C++ Build Tools.

`@lydell/node-pty` is an API-compatible fork that ships prebuilt **N-API** binaries. Its ABI is stable across Node and Electron versions, so it works in Electron without local compilation.

## Roadmap

- Split view, such as Claude and Codex running side by side.
- Agent Bus for message passing between agents.
- Task and workflow engine.
- SQLite storage.
