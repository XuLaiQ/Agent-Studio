# 打包应用启动但不显示窗口问题 - 诊断与修复

## 问题诊断

打包后的应用启动（进程存在）但窗口不显示，通常由以下原因引起：

### 1. **CSP (Content Security Policy) 过严格** ✅ 已修复
- **问题**：Vite 打包后的脚本带有内容哈希（如 `index-2Mc_KZBK.js`），但原 CSP 策略只允许 `'self'`
- **症状**：浏览器开发工具显示 CSP 违规，脚本被阻止加载
- **修复**：更新 CSP，允许 WASM 和 WebSocket 连接

### 2. **预加载脚本路径错误**
- **问题**：`__dirname` 在打包后的结构中可能指向错误位置
- **验证**：✅ 路径正确 (`../preload/index.js`)

### 3. **Renderer 文件路径错误**
- **问题**：`join(__dirname, '../renderer/index.html')` 在打包后可能指向错误位置
- **当前代码**：正确相对于 `out/main/` 指向 `out/renderer/`
- **改进**：添加了日志输出以便调试

### 4. **渲染进程崩溃**
- **症状**：窗口创建但内容加载失败
- **改进**：添加了崩溃和加载失败事件监听

## 已应用的修复

### 修复 #1：更新 CSP 策略 (src/renderer/index.html)
```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data:; connect-src 'self' ws: wss:;"
/>
```

**关键改动**：
- `script-src 'self' 'wasm-unsafe-eval'` - 允许 WASM（Monaco Editor 需要）
- `connect-src 'self' ws: wss:` - 允许 WebSocket 连接

### 修复 #2：增强调试日志 (src/main/index.ts)

添加了以下日志：
- `Window ready to show` - 确认窗口准备就绪
- `Failed to load` - 捕获加载错误
- `Renderer process crashed` - 捕获渲染进程崩溃
- `Loading dev/file URL` - 显示加载的路径
- `Uncaught exception` - 全局异常捕获

## 验证步骤

1. **清理并重建**：
   ```bash
   npm run build
   ```

2. **使用预览模式测试**：
   ```bash
   npm run preview
   ```
   这会在打包后的环境中运行应用，但无需创建安装程序。

3. **查看日志**：
   - 使用 `Ctrl+Shift+I` 打开开发者工具（如果启用）
   - 或者通过系统日志查看应用输出

4. **完整打包测试**：
   ```bash
   npm run dist:dir
   ```
   然后运行生成的 exe 文件

## 常见 CSP 问题

| 症状 | 原因 | 解决方案 |
|------|------|---------|
| 样式不加载 | style-src 不允许 | 添加 `'unsafe-inline'` |
| JavaScript 不运行 | script-src 不允许 | 添加 `'wasm-unsafe-eval'` 和 `'unsafe-inline'` |
| 外部资源被阻止 | default-src 过严格 | 使用 `connect-src 'self' https:` |
| WebSocket 失败 | 无 `ws://wss://` 许可 | 添加 `connect-src 'self' ws: wss:` |

## 打包文件结构

```
release/
├── Agent Studio-0.1.0-Setup.exe          # 安装程序
└── Agent Studio-0.1.0.exe                # 便携式可执行文件 (--dir 模式)

应用安装后运行时目录结构：
AppData/Local/Agent Studio/app-x.x.x/
├── resources/
│   ├── app/
│   │   ├── out/
│   │   │   ├── main/
│   │   │   │   └── index.js
│   │   │   ├── preload/
│   │   │   │   └── index.js
│   │   │   └── renderer/
│   │   │       ├── index.html
│   │   │       └── assets/
│   │   └── package.json
│   ├── app.asar (可选，如禁用 asarUnpack)
│   └── electron.asar
└── Electron Framework.framework
```

## 相关文件

- `src/main/index.ts` - 主进程入口
- `src/renderer/index.html` - 渲染进程入口和 CSP 配置
- `electron.vite.config.ts` - 构建配置
- `electron-builder.yml` - 打包配置

## 下一步

如果上述修复后窗口仍不显示：

1. **启用远程调试**：在主进程中添加：
   ```typescript
   if (!process.env['ELECTRON_RENDERER_URL']) {
     win.webContents.openDevTools()
   }
   ```

2. **检查文件权限**：确保 `out/` 目录文件可读

3. **使用 electron-debug**：
   ```bash
   npm install electron-debug --save-dev
   ```
   然后在 preload 中导入使用

4. **检查系统事件日志**：（Windows）查看应用崩溃记录
