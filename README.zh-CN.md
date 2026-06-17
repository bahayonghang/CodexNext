# Codex Next

[English](./README.md)

Codex Next 是一个本地 Codex 插件包，只做一件事：当 Codex 因平台侧限流或临时服务异常而中断时，尽量让它继续留在当前任务上，而不是把用户重新拉回手动恢复流程。

## 设计目标

这个插件的核心目标，是减少 Codex 分心。

具体来说：

- Codex 应该尽量保持在当前任务上下文里继续工作。
- 用户不应该在每次瞬时中断后都手动输入一次 “continue”。
- 重试必须有边界，不能把 Codex 推进无限循环。

这个插件不会“解决”OpenAI 的限额问题。它只是把可控范围内的自动恢复做好，减少任务中断后的上下文切换。

## 处理范围

插件会识别三类中断：

- `429` / rate limit
- `503` / 临时过载
- usage-limit / model-limit 一类的额度或模型上限中断

当停止信号命中这些类型时，插件会尝试让 Codex 从中断点继续。

## 重试策略

- `transient_rate_limit`：最多 3 次
- `transient_overload`：最多 2 次
- `usage_limit`：最多 2 次
- 全局总上限：5 次

某一类重试上限或全局上限耗尽后，插件会停止自动重试，并返回明确提示，而不是继续循环。

## 安全保护

- `stop_hook_active` 为真时直接跳过
- 去重相同 `turn_id`
- 只扫描 transcript 增量
- transcript 轮转或截断时自动重置 offset
- 按会话保存重试状态

## 安装说明

这个仓库当前提供的是插件包本体。要让 Codex 安装它，仍然需要先把它加入 marketplace。

### 方式一：仓库内本地 Marketplace

适合你想直接在这个仓库里使用它。

1. 创建或更新 `$REPO_ROOT/.agents/plugins/marketplace.json`：

```json
{
  "name": "codex-next-local",
  "interface": {
    "displayName": "Codex Next Local"
  },
  "plugins": [
    {
      "name": "codex-next",
      "source": {
        "source": "local",
        "path": "./codex-next"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

2. 重启 Codex。
3. 在 Codex 中打开插件列表：

```text
/plugins
```

4. 在 `codex-next-local` 这个 marketplace 里找到 `codex-next` 并安装。
5. 如果 Codex 提示你审核和信任 hook 定义，按提示完成。

### 方式二：个人 Marketplace

适合你希望跨多个仓库复用这个插件。

1. 将当前目录复制到 `~/.codex/plugins/codex-next`。
2. 创建或更新 `~/.agents/plugins/marketplace.json`：

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "codex-next",
      "source": {
        "source": "local",
        "path": "./.codex/plugins/codex-next"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

3. 重启 Codex。
4. 打开 `/plugins`，安装 `codex-next`，并在需要时信任 hook。

## 使用说明

1. 安装插件。
2. 新开一个 Codex 线程。
3. 正常使用 Codex。

这个插件没有额外命令，不需要手动调用。它完全通过 `Stop` hook 自动工作。

预期行为：

- 如果某次停止被识别为 `429`、`503` 或 usage-limit/model-limit 中断，插件会尝试让 Codex 继续
- 如果重试次数耗尽，插件会停止自动恢复，并提示你检查 `/status`、等待 reset、补充 credits，或切换到更低成本模型

## 开发说明

运行测试：

```powershell
python -m unittest discover -s codex-next/tests -p "test_*.py"
```

校验插件 manifest：

```powershell
python C:\Users\lyh\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py codex-next
```

## 目录结构

- `codex-next/.codex-plugin/plugin.json` — 插件 manifest
- `codex-next/hooks/hooks.json` — Stop hook 配置
- `codex-next/scripts/auto-recover-stop.py` — 自动恢复逻辑
- `codex-next/tests/` — 单元测试与 fixtures
