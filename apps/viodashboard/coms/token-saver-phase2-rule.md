# Token Saver 第二层规则（Phase 2）

状态：已接入为独立规则块，可单独开关；规则说明已升级为结构化协议版。

## 规则目标
在尽量保持整体消息结构稳定的前提下，对**过长工具输出**进行结构化压缩剪裁，降低工具结果对上下文长度的占用，同时尽量保留调试、追踪和错误分析所需的关键锚点。

## 适用对象
Only tool-generated large content may be aggressively compressed.

### Eligible content types
- terminal stdout / stderr
- long logs
- HTML / webpage bodies
- directory listings
- file previews
- browser snapshots
- OCR / image-derived blocks
- repetitive tool traces

### Non-eligible / high-protection content
以下内容不得被激进压缩或改写：
- tool name
- tool call id
- exit code / status
- timestamp（若可用）
- file path / URL（若相关）
- 关键尾部异常信息
- tool 关联结构本身

## 核心规则
1. 第二层只作用于 `tool` 输出，不改动普通 user / assistant 消息主体。
2. 过长工具输出不得整段原样保留；应转为结构化压缩表示。
3. 第二层当前策略：**只压缩旧的 tool output；位于最后 5 turns 窗口内的 tool output 保留原样不压缩**。
4. 工具输出压缩后，必须保留关键元数据。
5. 不改变 role 顺序。
5. 不修改 tool 名称。
6. 不打乱 tool 关联结构。
7. 不得将工具输出改写成自然语言解释或对话 prose。
8. 第二层必须作为独立规则块存在，可与第一层规则分开启停。

## 关键元数据保留（Lossless metadata preservation）
Always preserve when available:
- `tool`
- `tool_call_id`
- `timestamp`
- `status`
- `exit_code`
- `file_path` / `url`
- `stdout_truncated` / `stderr_truncated`
- `original_chars`
- `original_lines`
- `kept_chars`
- `compression_methods`
- `integrity_risk`

## 允许的压缩方式（Lossy content reduction allowlist）
Allowed methods:
- head / tail truncation
- repeated-line folding
- duplicate output deduplication
- HTML boilerplate removal
- directory list collapsing
- image block placeholder substitution
- stack trace tail preservation

### 特别规则
- **stack trace / error trace 尾部优先保留**
  - exception type
  - file / line
  - final error message
- terminal 类输出应尽量区分：
  - `stdout`
  - `stderr`
- 一般建议：
  - stdout 可更激进压缩
  - stderr 更保守保留

## 输出包装格式（Structured wrapper format）
压缩后的工具输出必须使用显式结构化包装，而不是转成自然语言说明。

示例：

```text
[tool_result]
tool=terminal
call_id=abc123
status=error
exit_code=1
stdout_truncated=true
stderr_truncated=false
original_chars=18234
original_lines=412
kept_chars=2400
compression_methods=headTail,repeatFold
integrity_risk=medium
head:
...
tail:
...
```

## 独立规则块要求
第二层应作为独立协议块配置，而不是单一布尔开关。

建议配置形态：

```json
{
  "phase2ToolCompression": {
    "enabled": false,
    "mode": "structured",
    "methods": ["headTail", "repeatFold"],
    "thresholds": {
      "maxChars": 1200,
      "maxHeadChars": 420,
      "maxTailChars": 280
    }
  }
}
```

## 观测要求
测试期间重点观察：
- 模型是否出现 error / aborted
- 是否出现明显答非所问
- dry-diff 中的：
  - tool 信息是否被保留
  - messageCount 是否异常变化
  - role 顺序是否变化
  - system message 是否异常改写
  - 工具输出压缩后是否丢失关键尾部信息
  - `compression_methods` 与 `integrity_risk` 是否与错误样本相关

## 升级约束
只有在本规则稳定通过后，才允许进入下一层：
- 更强上下文折叠
- 更复杂的术语归一或多层压缩策略

## 回退约束
一旦出现频繁错误或明显答非所问：
- 可单独关闭第二层规则（L2）
- 必要时关闭 Token Saver 总开关
- 保持 wrapper 稳定运行
- 通过 dry-diff + run-index 回查错误样本
- 分析是否是工具输出剪裁导致关键信息缺失、结构变化或请求形态变化

## 一句话摘要
第二层规则不是“帮工具输出写作文”，而是：

> **仅对过长工具输出正文做结构化压缩剪裁，在保留关键元数据和整体结构的前提下，把内容转成可追踪、可调试、可分析的压缩协议块。**
