# Token Saver 自动降级规则（v1）

状态：规则已调整，**暂时剔除 L1 降级**；后续代码实现应按本文件口径执行。

## 触发对象
以下异常事件纳入自动降级判断：
- `server_error`
- `aborted`
- 明显答非所问

## 当前降级层级
- **仅保留：自动关闭 L2**
- **暂不对 L1 做自动降级**

---

## 自动关闭 L2
满足任一条件即触发：

1. 最近 **3 次**里有 **1 次 `server_error`**
2. 最近 **5 次**里有 **2 次 `aborted / 明显答非所问`**
3. 最近 **5 次**里有 **2 次异常总和**
   - 异常总和 = `server_error + aborted + 明显答非所问`

### 动作
- `phase2ToolCompression = false`
- 保留 `phase1Summary`
- 记录一次 `auto-degrade` 事件
- UI / log 提示：`L2 auto-disabled`

---

## L1 处理策略
- **暂不自动关闭 `phase1Summary`**
- 即使异常持续，也先保持 L1 由人工判断
- 是否恢复或进一步回退，当前版本统一由人工控制

---

## 恢复策略
当前版本先不自动恢复。

### 恢复方式
仅允许人工恢复：
- 手动重新开启 `phase2ToolCompression`

---

## 配套记录字段
每次异常事件应记录：
- `type`
  - `server_error` / `aborted` / `wrong_answer`
- `severity`
  - `high`：`server_error`
  - `medium`：`aborted`
  - `medium_high`：明显答非所问
- `activeLayers`
  - 当时开启的层级，例如：`L1` / `L2`
- `runId`
  - 若可用则保留

这些字段用于后续分析：
- 哪一层开启时更容易出问题
- 哪类异常最容易触发自动降级
- 关闭 L2 后稳定性是否改善

---

## 实施建议
当前版实现时：
- 只实现“异常计数 -> 自动关闭 L2”
- 不实现 L1 自动降级
- 不实现自动恢复
- 先确保日志、UI 提示和异常记录完整

---

## 一句话摘要
> 当最近窗口内出现足够多的 `server_error`、`aborted` 或明显答非所问时，系统当前只自动关闭 L2；L1 暂时剔除出自动降级范围，统一由人工控制。
