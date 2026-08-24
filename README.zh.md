# dsh-open-with

[English](README.md) | 中文

在会话页头右上角用一个编辑器或终端打开当前项目文件夹。插件往会话作用域的
`conversation.session.header.utilities` 列表贡献一个小的下拉功能。它会在主机上
扫描实际安装的编辑器与终端 —— VS Code、Zed、DataGrip、Windows Terminal、
PowerShell、Command Prompt、File Explorer —— 只列出检测到的那些，并为他们带上
从已安装可执行文件中提取的**真实产品图标**。选择某一项后，用该应用打开当前会话的
工作目录（`cwd`）。

Host 半包负责检测、图标提取与进程启动；浏览器半包负责下拉框、它的交互状态（开/关、
已加载应用列表）、当前选中的应用与样式表。二者通过包私有的 Client→Host RPC 通信：
`list-apps` 与 `open-with`。

## 行为约定

| 入口 | 结果 |
|---|---|
| 页头触发器 | 会话页头右缘的拆分控件。**图标**显示当前将使用的应用（**上次打开的应用**，或默认第一个检测到的应用），**点击图标直接打开**该应用；图标右侧的小箭头用于切换下拉框。 |
| 下拉列表 | 一个美化后的弹层，每个检测到的应用一行，带真实产品图标、名称，并在当前选中的应用上打勾。检测中显示加载占位；无匹配时显示「未检测到可用应用」。 |
| 选择一个应用 | 请求 Host 半包用该项目文件夹启动该应用，记住本次选择（`localStorage`，键 `dsh.open-with.last`），移动勾选并关闭菜单；触发器图标随即显示该应用。 |
| 点击外部 / Esc | 关闭下拉框。 |

检测仅限 Windows，并且因为 PowerShell、Command Prompt 与 File Explorer 在所有
Windows 主机上都存在，所以它们始终会被列出。检测结果在本次插件运行期内缓存，
因此再次打开是即时的。

### 启动映射

| id | 名称 | 启动方式 |
|---|---|---|
| `vscode` | VS Code | `Code.exe <项目>`（来自 App Paths 的真实 GUI 可执行文件） |
| `zed` | Zed | `Zed.exe <项目>` |
| `datagrip` | DataGrip | `datagrip64.exe <项目>`（从 `.bat` 包装解析得到） |
| `winterm` | Windows Terminal | `wt.exe -d <项目>` |
| `powershell` | PowerShell | `wt.exe -d <项目> powershell.exe`；无 Windows Terminal 时直接拉起 |
| `cmd` | Command Prompt | `wt.exe -d <项目> cmd.exe`；无 Windows Terminal 时 `cmd /c start …` |
| `explorer` | File Explorer | `explorer.exe <项目>` |

终端应用在安装了 Windows Terminal 时会经由它打开，从而拥有独立窗口并在项目目录
启动。GUI 应用直接以文件夹参数拉起。插件不会等待被启动的进程退出，因此打开编辑器
不会阻塞会话。

每个应用的图标在 Host 端用 `System.Drawing.Icon.ExtractAssociatedIcon` 提取，并以
`data:image/png;base64,` URL 返回，因此浏览器展示的是真实的 Windows 应用 Logo，
无需打包任何图片资源。

## 组合

```yaml
- insert:
    - id: open-with
      name: dsh-open-with
```

本包把功能贡献到最右侧的 `conversation.session.header.utilities` 列表，与标题旁
`conversation.session.header.actions` 中的操作相互独立。它要求对话 UI 包存在（由其
拥有页头槽位），并要求 Host 提供用于检测与启动的 `subprocess` 服务。

## 安装

本包以 npm 包形式发布。本地构建与安装：

```sh
# 在插件目录中
npm install         # 或先发布
npm run bundle      # 生成 dsh.client 下的浏览器 bundle

# 添加到某个 profile（在部署根目录）
dsh plugin --profile <name> add dsh-open-with
```

然后把上面的 `open-with` 行加到该 profile 的 `cordis.patch.yml`。你必须运行 web
profile，因为下拉框位于浏览器 shell 中。

遵循 DSH 插件命名约定：仓库与 npm 包命名为 `dsh-open-with`（`dsh-<feature>`）。若你要
发布到自己拥有的 npm scope，凭据与 `dsh.client` 扫描都按该精确的包 `name` 键控。

## 模型体验

### 页头下拉框

#### 模型看到什么

无。下拉框是浏览器端控件，它的状态（开/关、检测到的应用列表）不会进入模型历史。

#### Token 影响

为零。该控件不创建模型轮次。

#### KV Cache 影响

无。它不改变派生的请求前缀。

## 已知限制与暂缓事项

- **仅限 Windows。** 检测与启动使用 PowerShell、App Paths 注册表与 Windows 路径。其他
  平台最多只能列出始终存在的默认 shell，且可能无法正确启动。
- **检测列表是静态的。** 新安装的编辑器只在插件重新加载（或页面刷新后的下一次运行）后
  出现。
- **没有按应用配置。** 没有 UI 可添加自定义命令或隐藏已检测到的应用。候选集合固定为上
  述七个启动器。
- **终端回退是尽力而为。** 未安装 Windows Terminal 时，PowerShell／Command Prompt 会
  直接拉起，并可能共享 harness 控制台（该路径下不会为它们创建独立窗口）。
- **图标提取仅限 Windows 且为尽力而为。** 图标来自真实可执行文件（经 `System.Drawing`），
  因此来源是已安装应用的图标（32×32）。Windows Terminal 的 `wt.exe` App Execution Alias
  没有可提取的产品 Logo，因此 Windows Terminal 条目复用 PowerShell 图标，以保持终端
  组在视觉上一致。
- **选中的应用是按浏览器的。** 上次选择保存在 `localStorage` 中，因此在同一浏览器内的
  各会话之间共享，但不会跨浏览器或跨机器共享。
