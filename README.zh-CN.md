# DeepSeek Harness 多模型对比评测（`dsh-dual-model-eval`）

[English](README.md) | 简体中文

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中并排对比多个编码模型。`dsh-dual-model-eval` 是一个可安装的多模型与 Coding Agent 评测插件：一次 Prompt 会并发发送给多个已配置的 LLM 路由，每个模型在隔离的 Git worktree 中开发，普通的**对话**页签会实时展示工具轨迹以及可比较、可采纳的结果。

> 兼容性：插件 `v0.1.2` 面向 DeepSeek Harness `0.1.0-rc.7`。请使用独立配置目录，与日常使用的新版本分开。尚未确认兼容 Harness `0.2.2-rc.3`。

## 安装

准备好 Node.js `^22.19.0 || >=24.0.0`、npm 和 Git。把固定版本安装进独立配置目录中的内置 `web` profile：

```sh
export DSH_HOME="$HOME/.dsh/compare-public"
npx -y @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add github:huangdaxianer/dsh-dual-model-eval#v0.1.2
```

安装后重启 Harness Web 进程：

```sh
DSH_HOME="$HOME/.dsh/compare-public" npx -y @deepseek-ai/dsh@0.1.0-rc.7 web --host 127.0.0.1 --port 3081
```

仓库已提交预构建的 `lib/` 产物，因此从 GitHub 安装时不需要授权依赖执行 `prepare` 构建脚本。

在这个对比环境的「设置 → 模型」中配置服务商和模型。打开启动命令打印的带认证地址；如果 `3081` 已被占用，请更换端口。

## 能力

- 在现有模型选择器中增加“对比测试”开关。
- 一次选择 2～4 个已经配置好的模型路由。
- 长模型列表可在菜单内滚动，最后一个模型也能完整显示和选择。
- 从同一个 Git commit 创建隔离 worktree，并发运行所有候选模型。
- 运行过程中实时展示每个模型的工具调用轨迹，并支持分别展开和折叠。
- 折叠态仅显示耗时和工具次数；展开后显示 Token、缓存命中、TTFT、解码耗时和工具详情。
- 并排展示最终回复及代码增删行数、比例和改动文件数。
- 在页面内预览改动文件，并可下载单个编辑后文件或候选模型的完整 worktree。
- 每个结果下提供“采纳此结果”按钮；采纳后创建本地 commit，后续轮次从这份代码基线继续。
- 后续轮次同时继承已采纳轮次的用户需求、最终回复和 commit；未采纳候选的回答不会混入共享上下文。
- 第一轮原样传递用户请求，只额外要求候选在分配的 worktree 内改文件，并把提交留到采纳时处理。
- 一轮对比结束后，在采纳一个候选之前锁定输入框，避免上下文和代码基线分叉。

## 使用方法

1. 打开标准模型菜单，启用“对比测试”。
2. 至少选择两个已经在 Harness 中配置好的模型路由。
3. 发送一个编码需求；两个结果卡片会立即出现，并在运行中持续更新。
4. 分别检查最终回复和可展开的工具调用轨迹。
5. 在更满意的候选下面点击“采纳此结果”；下一轮会基于该结果对应的 commit 和已采纳对话上下文继续。

## Git 与工作区行为

- 每个候选都会从同一个共同基线创建新的 detached worktree。
- 已有 Git 仓库在启动对比前必须保持干净。
- 非 Git 工作区默认会自动初始化：暂存未被 `.gitignore` 忽略的文件，并创建一个本地基线提交。
- 采纳时会根据完整补丁重建候选结果，使用命令级临时身份创建本地 commit，再让源工作区 fast-forward 到该提交。
- 插件不会推送远端，也不会修改全局 Git 身份。
- 临时 worktree 默认在运行后删除；有上限的私有证据保留在 `~/.dsh/dual-model-eval/`。

在推送或发布代码前，请自行检查采纳后生成的提交和补丁。“运行已完成”只表示编排流程已经收敛，不代表模型通过评测或获得质量分数。

## 更新与卸载

安装新的固定版本：

```sh
DSH_HOME="$HOME/.dsh/compare-public" npx -y @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add github:huangdaxianer/dsh-dual-model-eval#v0.1.2
```

卸载：

```sh
DSH_HOME="$HOME/.dsh/compare-public" npx -y @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web remove dsh-dual-model-eval
```

更新或卸载后都需要重启 `web` profile。

## 故障排查

- **新版本 Harness 无法加载插件**：使用上方固定的运行时版本和独立配置目录。
- **对比被取消 / `aborted`**：执行与发起它的网页请求绑定。刷新、关闭页面或连接中断，可能取消仍在运行的候选。运行完成前保持页面连接；结合会话日志区分请求中止、模型报错和默认 30 分钟超时。
- **429 / 每分钟 Token 限额**：对比环境默认对单次模型请求最多重试两次，持续限流仍可能使候选失败。

版本改动见 [CHANGELOG.md](CHANGELOG.md)。

## 本地开发

需要 Node.js `22.19+`（或 `24+`）、pnpm 和 Git。

```sh
pnpm install
pnpm run check
pnpm run pack:release
```

可以使用临时 Harness home 验证本地 checkout，不影响日常配置：

```sh
export DSH_PLUGIN_TEST_HOME="$(mktemp -d)"
DSH_HOME="$DSH_PLUGIN_TEST_HOME" npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add ./dsh-dual-model-eval
DSH_HOME="$DSH_PLUGIN_TEST_HOME" npx @deepseek-ai/dsh@0.1.0-rc.7 --profile web --dump-config
```

## 安全说明

DeepSeek Harness 插件以本地用户权限运行。安装任何第三方插件前都应检查源码，并固定 release tag 或 commit。本插件会在选定工作区内创建 Git worktree 和本地提交，但不会推送这些提交。

## 许可证

MIT。本独立包包含从 MIT 许可的 DeepSeek Harness 项目派生的代码，详见 [NOTICE](NOTICE)。
