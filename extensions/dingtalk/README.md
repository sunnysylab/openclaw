### todo

创建 extensions/dingtalk/ 目录结构及配置文件 (package.json, openclaw.plugin.json)
创建 extensions/dingtalk/src/types.ts (钉钉消息类型定义)
创建 extensions/dingtalk/src/types.config.ts (账号配置类型)
创建 extensions/dingtalk/src/accounts.ts (账号解析)
创建 extensions/dingtalk/src/config-schema.ts
创建 extensions/dingtalk/src/runtime.ts (lazy runtime)
创建 extensions/dingtalk/src/sign.ts (钉钉签名验证)
创建 extensions/dingtalk/src/send.ts (发送消息 API)
创建 extensions/dingtalk/src/monitor-webhook.ts (Webhook 接收处理)
创建 extensions/dingtalk/src/monitor.ts (监控主流程)
创建 extensions/dingtalk/src/channel.runtime.ts
创建 extensions/dingtalk/src/setup-core.ts & setup-surface.ts
创建 extensions/dingtalk/src/channel.ts (主插件定义)
创建入口文件: index.ts, api.ts, runtime-api.ts, setup-entry.ts
注册到 src/channels/plugins/bundled.ts
更新 pnpm-workspace.yaml 添加 dingtalk 工作区

### struct

extensions/dingtalk/
├── package.json # 包定义 (@openclaw/dingtalk)
├── openclaw.plugin.json # 插件清单
├── index.ts # 主入口（导出 dingtalkPlugin + setDingTalkRuntime）
├── api.ts # 公开 API barrel
├── runtime-api.ts # 运行时 barrel（re-export plugin-sdk/dingtalk）
├── setup-entry.ts # 配置向导入口
└── src/
├── types.ts # 钉钉 API 消息类型定义
├── types.config.ts # 账号配置类型
├── accounts.ts # 账号解析（支持 clientId/clientSecret 和 appKey/appSecret）
├── config-schema.ts # Zod schema
├── runtime.ts # Plugin runtime store
├── sign.ts # HMAC-SHA256 签名验证
├── send.ts # 发送消息（session webhook + OpenAPI 主动消息）
├── monitor-types.ts # Monitor 内部类型
├── monitor-webhook.ts # HTTP webhook 请求处理
├── monitor.ts # 监控主流程 + 事件处理
├── channel.runtime.ts # 延迟加载运行时聚合
├── setup-core.ts # 配置适配器
├── setup-surface.ts # 交互式设置向导
└── channel.ts # 主插件定义（createChatChannelPlugin）
