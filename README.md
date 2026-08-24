# dsh-open-project

English | [中文](README.zh.md)

Open the current project folder with an editor, IDE, or terminal from the
top-right of the session header. The plugin adds one small dropdown utility to
the session-scoped `conversation.session.header.utilities` list. It scans the
host for code editors, IDEs, terminals, and file managers that are actually
installed — from a **broad catalog** (VS Code, VSCodium, Cursor, Trae, Trae
Work, Zed, Windsurf, Sublime Text, Notepad++, the JetBrains family, Eclipse,
NetBeans, Qt Creator, OpenCode, Codex, Claude Code, Aider, Gemini CLI, Neovim,
Helix, Micro, Vim, Windows Terminal, Alacritty, WezTerm, Tabby, Warp, ConEmu,
Cmder, PowerShell 7, Git Bash, plus file managers such as Total Commander, and
more) plus the always-present PowerShell, Command Prompt, and File Explorer —
and lists only the ones it finds. Choosing an entry launches that app with the
current session's working directory (`cwd`).

Detection is **dynamic** and **platform-aware**: an app appears only when its
executable/command is actually found on the host, so a machine that lacks an
editor simply does not show it. On Windows it uses PowerShell to probe the App
Paths registry, PATH commands, common install locations, and the Uninstall
registry, extracting a **real product icon** from each launcher. On Linux and
macOS it resolves PATH commands and common install paths through the host
subprocess service; those entries carry no icon and the browser falls back to a
letter badge.

The Host half is responsible for detection, icon extraction, and process launch.
The browser half owns the dropdown, its interaction state (open/closed, loaded
apps), the selected app, and the style sheet. They talk over the package-private
Client→Host RPC: `list-apps` and `open-with`.

## Behavior contract

| Entry point | Result |
|---|---|
| Header trigger | A split control at the right edge of the session header. The **icon** shows the app that would currently be used (the **last app you opened**, or the first detected app by default) and **clicking it opens that app right away**. A caret segment beside the icon toggles the dropdown. |
| Dropdown list | A beautified popover. One row per detected app with its real product icon, label, and a check mark on the currently selected app. Empty while detection is running, or an "No compatible app detected" placeholder when nothing matches. |
| Choose an app | Asks the Host half to launch the app with the project folder, remembers the choice (in `localStorage`, key `dsh.open-project.last`), moves the check mark, and closes the menu. The trigger icon now shows this app. |
| Click outside / Esc | Closes the dropdown. |

On Windows the detected set always includes PowerShell, Command Prompt, and
File Explorer because they are present on every Windows host. The detected set
is cached for the lifetime of the plugin run, so a re-open is instant.

### Launch mapping

Each detected app carries a `mode` that decides how it is opened:

| Launch mode | Behavior | Examples |
|---|---|---|
| `gui` | `exe <project>` — the app opens the folder itself (works on Windows, Linux, and macOS) | VS Code, VSCodium, Cursor, Trae, Zed, Sublime, Notepad++, DataGrip, IntelliJ, PyCharm, GoLand, WebStorm, PhpStorm, CLion, Rider, Android Studio, Eclipse, NetBeans, Qt Creator |
| `term` | a CLI tool runs inside a terminal — `wt.exe -d <project> <cmd>` on Windows; `gnome-terminal --working-directory=<project> -- <cmd>` on Linux; `open -a Terminal <project>` on macOS | OpenCode, Codex, Claude Code, Aider, Gemini CLI, Neovim, Helix, Micro, Vim, Alacritty, WezTerm, Tabby, Warp, ConEmu, Cmder |
| `shell` | a shell starts in the project — via Windows Terminal on Windows, the default terminal on Unix/macOS | PowerShell, PowerShell 7, Command Prompt, Git Bash, Zsh |
| `terminal` | opens the terminal app in the project — `wt.exe -d <project>` on Windows, `gnome-terminal --working-directory=<project>` on Linux, `open -a Terminal <project>` on macOS | Windows Terminal, GNOME Terminal, Konsole, xterm |
| `explorer` | `exe <project>` — opens the folder itself | File Explorer, Files (Nautilus), Nemo, Dolphin, Thunar, Total Commander |

GUI apps and file managers spawn directly with the folder argument on every
platform. Terminal, shell, and CLI entries are routed through a terminal
(Windows Terminal on Windows, the default terminal on Unix/macOS) so they open
in their own window and start in the project folder; the Unix/macOS terminal
launches are best-effort and default to `gnome-terminal` / the macOS `Terminal`.
The plugin never waits for the launched process, so opening an editor does not
block the session.

On Windows, detection probes the App Paths registry, PATH commands, common
install locations, and the Uninstall registry, and each app's icon is extracted
with `System.Drawing.Icon.ExtractAssociatedIcon` and returned as a
`data:image/png;base64,` URL. On Linux/macOS, detection resolves PATH commands
and common install paths through the host subprocess service and returns no
icon, so those entries fall back to a letter badge in the browser. In every case
the exact catalog on a given machine depends on what is installed there.

## Composition

```yaml
- insert:
    - id: dsh-open-project
      name: dsh-open-project
```

The package contributes its utility to the right-aligned
`conversation.session.header.utilities` list, independent of the title-adjacent
actions in `conversation.session.header.actions`. It requires the conversation
UI package to be present (it owns the header slot) and the Host to provide the
`subprocess` service for detection and launch.

## Install

```sh
# Install from GitHub
dsh plugin --profile web add github:will00768-max/dsh-open-project
```

After installing, restart dsh web:

```sh
dsh web
```

Then refresh the browser page to use it.

If you run from the DeepSeek Harness source:

```sh
pnpm dsh plugin --profile web add github:will00768-max/dsh-open-project
pnpm dsh web
```

### Local development

```sh
dsh plugin --profile web add <path-to-this-checkout>
```

After a local change, restart dsh web to load the latest plugin code.

Follow the DSH plugin naming convention: the repository and npm package are named
`dsh-open-project` (`dsh-<feature>`). If you publish under your own npm scope,
credentials and the `dsh.client` scan key off that exact package `name`.

## Model experience

### Header dropdown

#### What the model sees

Nothing. The dropdown is a browser-only control; its state (open/closed,
detected app list) never enters model history.

#### Token effect

Zero. The control creates no model turn.

#### KV Cache effect

None. It does not change the derived request prefix.

## Known limitations and deferred work

- **Icons are Windows-only and best-effort.** On Windows, icons come from the
  real executable via `System.Drawing` (the installed app's icon, 32×32); the
  Windows Terminal `wt.exe` App Execution Alias has no extractable product logo,
  so the Windows Terminal entry reuses the PowerShell icon to keep the terminal
  group visually consistent. On Windows, CLI tools detected as `.ps1` shims
  (OpenCode, Codex, Claude Code, Gemini CLI, …) use the cmd.exe console icon; on
  Linux/macOS and for other entries with no host icon, the browser falls back to a
  letter badge.
- **Detection re-runs on load.** A newly installed editor appears only after the
  plugin reloads (or the next plugin run after a page refresh). The catalog is
  broad but not exhaustive: to add a Windows launcher, extend the `$catalog`
  table in `src/detect.ps1`; to add a Unix launcher, add an entry to
  `UNIX_CATALOG` in `src/index.js`.
- **No per-app configuration.** There is no UI to add a custom command or hide a
  detected app. The catalog is fixed at the launchers listed above.
- **Terminal launch is best-effort on Unix/macOS.** On Windows, terminal, shell,
  and CLI entries route through Windows Terminal when installed. On Unix/macOS
  the default is `gnome-terminal` (Linux) / the macOS `Terminal`; if that is not
  available the launch may fail. GUI apps and file managers spawn directly with
  the folder argument on every platform.
- **Selected app is per-browser.** The last-used choice is kept in
  `localStorage`, so it is shared across the sessions in one browser but not
  across browsers or machines.
