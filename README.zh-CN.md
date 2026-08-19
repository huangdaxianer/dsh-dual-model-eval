# dsh-dual-model-eval

[English](README.md) | 简体中文

这是一个可安装的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 多模型编码对比组合包。一次请求可以并发发送给多个已配置模型；每个模型在隔离的 detached Git worktree 中开发；Web 界面会在普通的**对话**页签中实时展示工具轨迹，并把结果并排放在一起比较。

> 兼容性：首个版本面向 DeepSeek Harness `0.1.0-rc.7`。DeepSeek Harness 目前仍是开发者预览版，不同 RC 版本之间的插件接口可能发生变化。

## 一行安装

把固定版本安装进内置 `web` profile：

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add github:huangdaxianer/dsh-dual-model-eval#v0.1.0
```

安装后重启 Harness Web 进程：

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 web
```

仓库已提交预构建的 `lib/` 产物，因此从 GitHub 安装时不需要授权依赖执行 `prepare` 构建脚本。

## 能力

- 在现有模型选择器中增加“对比测试”开关。
- 一次选择 2～4 个已经配置好的模型路由。
- 从同一个 Git commit 创建隔离 worktree，并发运行所有候选模型。
- 运行过程中实时展示每个模型的工具调用轨迹，并支持分别展开和折叠。
- 折叠态仅显示耗时和工具次数；展开后显示 Token、缓存命中、TTFT、解码耗时和工具详情。
- 并排展示最终回复及代码增删行数、比例和改动文件数。
- 每个结果下提供“采纳此结果”按钮；采纳后创建本地 commit，后续轮次从这份代码基线继续。
- 后续轮次同时继承已采纳轮次的用户需求、最终回复和 commit；未采纳候选的回答不会混入共享上下文。
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
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web add github:huangdaxianer/dsh-dual-model-eval#v0.1.0
```

卸载：

```sh
npx @deepseek-ai/dsh@0.1.0-rc.7 plugin --profile web remove dsh-dual-model-eval
```

更新或卸载后都需要重启 `web` profile。

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
