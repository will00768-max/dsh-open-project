# dsh-open-project

[English](README.md) | 中文

在会话页头右上角用一个编辑器、IDE 或终端打开当前项目文件夹。插件往会话作用域的
`conversation.session.header.utilities` 列表贡献一个小的下拉功能。它会在主机上
从一个**较完整的目录**中扫描实际安装的代码编辑器、IDE 与终端 —— VS Code、
VSCodium、Cursor、Trae、Trae Work、Zed、Windsurf、Sublime Text、Notepad++、
JetBrains 系列、Eclipse、NetBeans、OpenCode、Neovim、Helix、Micro、Windows
Terminal、Alacritty、WezTerm、Tabby、Warp、ConEmu、Cmder 等等 —— 以及永远存在的
PowerShell、Command Prompt 与 File Explorer，只列出检测到的那些，并为他们带上从已
安装可执行文件中提取的**真实产品图标**。选择某一项后，用该应用打开当前会话的工作目录
（`cwd`）。

检测是**动态的**：只有在主机上真正解析到该应用的执行文件/命令才会出现，因此某台机器
没装某个编辑器，下拉框里就不会显示它。

Host 半包负责检测、图标提取与进程启动；浏览器半包负责下拉框、它的交互状态（开/关、
已加载应用列表）、当前选中的应用与样式表。二者通过包私有的 Client→Host RPC 通信：
`list-apps` 与 `open-with`。

## 行为约定

| 入口 | 结果 |
|---|---|
| 页头触发器 | 会话页头右缘的拆分控件。**图标**显示当前将使用的应用（**上次打开的应用**，或默认第一个检测到的应用），**点击图标直接打开**该应用；图标右侧的小箭头用于切换下拉框。 |
| 下拉列表 | 一个美化后的弹层，每个检测到的应用一行，带真实产品图标、名称，并在当前选中的应用上打勾。检测中显示加载占位；无匹配时显示「未检测到可用应用」。 |
| 选择一个应用 | 请求 Host 半包用该项目文件夹启动该应用，记住本次选择（`localStorage`，键 `dsh.open-project.last`），移动勾选并关闭菜单；触发器图标随即显示该应用。 |
| 点击外部 / Esc | 关闭下拉框。 |

检测仅限 Windows，并且因为 PowerShell、Command Prompt 与 File Explorer 在所有
Windows 主机上都存在，所以它们始终会被列出。检测结果在本次插件运行期内缓存，
因此再次打开是即时的。

### 启动映射

每个检测到的应用带一个 `mode`，决定它如何被打开：

| 启动模式 | 行为 | 示例 |
|---|---|---|
| `gui` | `exe <项目>` —— 应用自己打开该文件夹 | VS Code、VSCodium、Cursor、Trae、Zed、Sublime、Notepad++、DataGrip、IntelliJ、PyCharm、GoLand、WebStorm、PhpStorm、CLion、Rider、Android Studio、Eclipse、NetBeans |
| `term` | `wt.exe -d <项目> <命令>` —— CLI 工具在终端里运行 | OpenCode、Neovim、Helix、Micro、Alacritty、WezTerm、Tabby、Warp、ConEmu、Cmder |
| `shell` | `wt.exe -d <项目> <shell>` —— shell 在项目目录启动 | PowerShell、PowerShell 7、Command Prompt |
| `terminal` | `wt.exe -d <项目>` —— 在项目里打开 Windows Terminal | Windows Terminal |
| `explorer` | `explorer.exe <项目>` | File Explorer |

终端、shell 与 CLI 条目在安装了 Windows Terminal 时会经由它打开，从而拥有独立窗口并在
项目目录启动；否则使用尽力而为的直接拉起。GUI 应用直接以文件夹参数拉起。插件不会等待
被启动的进程退出，因此打开编辑器不会阻塞会话。

检测会探查 App Paths 注册表、PATH 命令、常见安装位置与卸载注册表，因此某台机器上的
确切目录取决于它实际装了哪些。每个应用的图标在 Host 端用
`System.Drawing.Icon.ExtractAssociatedIcon` 提取，并以 `data:image/png;base64,`
URL 返回；没有可提取图标的 CLI 工具会退化为字母徽标。

## 组合

```yaml
- insert:
    - id: dsh-open-project
      name: dsh-open-project
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
dsh plugin --profile <name> add dsh-open-project
```

然后把上面的 `dsh-open-project` 行加到该 profile 的 `cordis.patch.yml`。你必须运行
web profile，因为下拉框位于浏览器 shell 中。

遵循 DSH 插件命名约定：仓库与 npm 包命名为 `dsh-open-project`（`dsh-<feature>`）。
若你要发布到自己拥有的 npm scope，凭据与 `dsh.client` 扫描都按该精确的包 `name` 键控。

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
- **加载时重新检测。** 新安装的编辑器只在插件重新加载（或页面刷新后的下一次运行）后
  出现。目录较全但并非穷尽：要新增启动器，在 `src/detect.ps1` 的 `$catalog` 表里补充
  id、label、mode 与探查来源即可。
- **没有按应用配置。** 没有 UI 可添加自定义命令或隐藏已检测到的应用。目录固定为上述
  启动器。
- **终端回退是尽力而为。** 未安装 Windows Terminal 时，PowerShell／Command Prompt 会
  直接拉起，并可能共享 harness 控制台（该路径下不会为它们创建独立窗口）。
- **图标提取仅限 Windows 且为尽力而为。** 图标来自真实可执行文件（经 `System.Drawing`），
  因此来源是已安装应用的图标（32×32）。Windows Terminal 的 `wt.exe` App Execution Alias
  没有可提取的产品 Logo，因此 Windows Terminal 条目复用 PowerShell 图标，以保持终端
  组在视觉上一致。
- **选中的应用是按浏览器的。** 上次选择保存在 `localStorage` 中，因此在同一浏览器内的
  各会话之间共享，但不会跨浏览器或跨机器共享。
