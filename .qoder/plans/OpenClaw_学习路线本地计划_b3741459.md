# OpenClaw 学习路线 — 8年Java开发从0到1

## 背景

Java 开发背景，目标是通过阅读和 Debug 源码，系统理解 OpenClaw 这个个人 AI 助理网关项目。

---

## 心智模型映射（Java → TypeScript）

| Java 概念 | OpenClaw 等价物 |
|-----------|----------------|
| `main()` + Spring Boot | `src/entry.ts` → `runCli()` |
| `@Service` / Bean | 函数式模块，`createXxx()` 工厂函数 |
| `@Controller` / REST | Commander.js 命令 + WebSocket handler |
| `ApplicationContext` | Gateway Server (`src/gateway/server.impl.ts`) |
| `@Async` / `CompletableFuture` | `async/await` + `Promise` |
| Spring Events | EventEmitter + WebSocket 事件 |
| Maven/Gradle | pnpm（monorepo）+ Bun（执行） |
| JAR 包 | `dist/entry.js`（编译产物） |

---

## 主线：一条消息的生命周期

```
1. [用户发消息到 Telegram]
   └─ extensions/telegram/src/channel.ts（grammy bot 接收）

2. [Channel 转发到 Gateway]
   └─ src/gateway/server-chat.ts → handleChat()
       └─ 消息路由、会话匹配

3. [Gateway 启动 Agent]
   └─ src/gateway/call.ts → callAgent()
       └─ src/agents/（Pi Agent 运行时）

4. [Agent 调用 AI 模型]
   └─ 模型 API（OpenAI/Anthropic/Ollama）流式响应

5. [AI 使用工具]
   └─ src/agents/tools/（文件读写、搜索、代码执行...）

6. [回复消息]
   └─ 回到 Channel → 发送给用户
```

---

## Task 1 — CLI 入口链（第1周）

目标：理解程序如何启动，类比 Spring Boot 的启动流程。

- `src/entry.ts` — 程序入口，处理 respawn 和快捷路径
- `src/cli/run-main.ts` — CLI 命令分发核心（已有 DEBUG 日志可参考）
- `src/cli/program.ts` — Commander.js 命令注册
- `src/cli/route.ts` — 快速路由（不走完整 Commander 解析的命令）

关键调试命令：
```bash
bun --inspect-wait src/entry.ts --help
bun --inspect-wait src/entry.ts gateway run
```

断点位置：
- `entry.ts:122` `ensureCliRespawnReady()`
- `run-main.ts:113` `tryRouteCli()`
- `run-main.ts:144` `registerCoreCliByName()`

---

## Task 2 — Gateway Server 启动（第2周）

目标：理解网关如何初始化，类比 Spring ApplicationContext 的 refresh() 流程。

- `src/gateway/server.impl.ts`（48KB）— 网关主体，最核心文件
- `src/gateway/server-startup.ts` — 启动 sidecars（渠道/Hooks/插件/浏览器控制）
- `src/gateway/server-http.ts` — HTTP + WebSocket 服务器
- `src/gateway/boot.ts` — BOOT.md 开机自检流程

`startGatewaySidecars()` 启动顺序：
1. 清理 stale session lock 文件
2. 启动浏览器控制服务器
3. 启动 Gmail watcher（如配置）
4. 加载内部 Hooks
5. 预热主模型 → 启动渠道（`startChannels()`）
6. 启动插件服务
7. ACP 会话 reconcile
8. 启动内存后端

断点位置：
- `server-startup.ts:65` `startGatewaySidecars()`
- `server-startup.ts:167` `params.startChannels()`

---

## Task 3 — Telegram 渠道插件（第3周）

目标：理解插件体系，选最简单的 Telegram 作为切入点。

- `extensions/telegram/src/channel.ts` — 渠道插件主体
- `extensions/telegram/openclaw.plugin.json` — 插件声明清单
- `src/plugins/loader.ts` — 插件加载器
- `src/gateway/server-channels.ts` — 网关侧渠道管理
- `src/channels/` — 内置渠道公共逻辑

关键问题：消息如何从 grammy bot 回调进入 `server-chat.ts` 的 `handleChat()`？

---

## Task 4 — Agent 运行时与 AI 调用（第4周）

目标：理解 AI 对话循环，类比状态机 + 策略模式。

- `src/agents/` — Agent 运行时（621 items，重点目录）
- `src/gateway/call.ts`（31KB）— AI 模型调用核心，含重试/流式处理
- `src/agents/pi-embedded-runner/` — Pi Agent 嵌入式运行时
- `src/gateway/session-utils.ts`（38KB）— 会话工具函数

---

## Task 5 — 工具系统 + 插件开发（第5周）

目标：理解 Agent 如何执行工具调用（function calling）。

- `src/agents/tools/` — 内置工具定义
- `src/gateway/tools-invoke-http.ts` — 工具 HTTP 调用
- `src/gateway/node-command-policy.ts` — 系统命令执行策略
- `src/plugin-sdk/` — 插件 SDK 公共接口

---

## Task 6 — 配置系统 + 会话管理（第6周）

目标：理解持久化层，类比 JPA + 配置中心。

- `src/config/config.ts` — 配置文件结构（OpenClawConfig 类型）
- `src/config/sessions/` — 会话存储（基于 JSON 文件）
- `src/gateway/session-utils.fs.ts`（28KB）— 文件系统会话工具
- `src/memory/` — 内存/上下文管理

---

## 常用调试命令

```bash
# 安装依赖
pnpm install

# 源码直跑（无需编译）
bun src/entry.ts --help
bun src/entry.ts gateway run

# Debug 模式（VS Code Attach）
bun --inspect-wait src/entry.ts gateway run

# 跑单个测试文件
pnpm test -- src/gateway/boot.test.ts

# 编译（改了src后如需dist）
pnpm build
```

---

## 注意事项

- 项目运行的是 `dist/entry.js`，调试时用 `bun src/entry.ts` 直跑源码
- VS Code 断点需配合 `--inspect-wait` 启动参数（等待 debugger attach）
- 运行时依赖需在 `dependencies` 而非 `devDependencies`（npm install 不装后者）
- 消息通道命名：docs/UI 用 "plugin"，内部目录依然是 `extensions/*`
