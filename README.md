# dsh-open-project

English | [中文](README.zh.md)

Open the current project folder with an editor, IDE, or terminal from the
top-right of the session header. The plugin adds one small dropdown utility to
the session-scoped `conversation.session.header.utilities` list. It scans the
host for code editors, IDEs, and terminals that are actually installed — from a
**broad catalog** (VS Code, VSCodium, Cursor, Trae, Trae Work, Zed, Windsurf,
Sublime Text, Notepad++, the JetBrains family, Eclipse, NetBeans, OpenCode,
Neovim, Helix, Micro, Windows Terminal, Alacritty, WezTerm, Tabby, Warp, ConEmu,
Cmder, and more) plus the always-present PowerShell, Command Prompt, and File
Explorer — and lists only the ones it finds, each with its **real product icon**
extracted from the installed executable. Choosing an entry launches that app
with the current session's working directory (`cwd`).

Detection is **dynamic**: an app appears only when its executable/command is
actually found on the host, so a machine that lacks an editor simply does not
show it.

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

Detection is Windows-only and always includes PowerShell, Command Prompt, and
File Explorer because they are present on every Windows host. The detected set
is cached for the lifetime of the plugin run, so a re-open is instant.

### Launch mapping

Each detected app carries a `mode` that decides how it is opened:

| Launch mode | Behavior | Examples |
|---|---|---|
| `gui` | `exe <project>` — the app opens the folder itself | VS Code, VSCodium, Cursor, Trae, Zed, Sublime, Notepad++, DataGrip, IntelliJ, PyCharm, GoLand, WebStorm, PhpStorm, CLion, Rider, Android Studio, Eclipse, NetBeans |
| `term` | `wt.exe -d <project> <cmd>` — a CLI tool runs inside a terminal | OpenCode, Neovim, Helix, Micro, Alacritty, WezTerm, Tabby, Warp, ConEmu, Cmder |
| `shell` | `wt.exe -d <project> <shell>` — a shell starts in the project | PowerShell, PowerShell 7, Command Prompt |
| `terminal` | `wt.exe -d <project>` — opens Windows Terminal in the project | Windows Terminal |
| `explorer` | `explorer.exe <project>` | File Explorer |

Terminal, shell, and CLI entries are routed through Windows Terminal when it is
installed so they open in their own window and start in the project folder;
otherwise a best-effort direct spawn is used. GUI apps spawn directly with the
folder argument. The plugin never waits for the launched process, so opening an
editor does not block the session.

Detection probes the App Paths registry, PATH commands, common install
locations, and the Uninstall registry, so the exact catalog on a given machine
depends on what is installed there. Each app's icon is extracted on the host
with `System.Drawing.Icon.ExtractAssociatedIcon` and returned as a
`data:image/png;base64,` URL; CLI tools without an extractable icon fall back to
a letter badge in the browser.

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

The package is published as an npm package. For a local build and install:

```sh
# From the plugin directory
npm install         # or publish it first
npm run bundle      # produces the browser bundle under dsh.client

# Add it to a profile (from the deployment root)
dsh plugin --profile <name> add dsh-open-project
```

Then add the `dsh-open-project` row above to that profile's `cordis.patch.yml`.
The web profile must be the one you run, because the dropdown lives in the
browser shell.

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

- **Windows only.** Detection and launch use PowerShell, the App Paths registry,
  and Windows paths. Other platforms currently list only the always-present
  default shells at best, and may not launch correctly.
- **Detection re-runs on load.** A newly installed editor appears only after the
  plugin reloads (or the next plugin run after a page refresh). The catalog is
  broad but not exhaustive: to add a launcher, extend the `$catalog` table in
  `src/detect.ps1` with its id, label, mode, and probe sources.
- **No per-app configuration.** There is no UI to add a custom command or hide a
  detected app. The catalog is fixed at the launchers listed above.
- **Terminal fallback is best-effort.** When Windows Terminal is not installed,
  PowerShell/Command Prompt spawn directly and may share the harness console
  (they are not given their own window on that path).
- **Icon extraction is Windows-only and best-effort.** Icons come from the real
  executable via `System.Drawing`, so the source is the installed app's icon
  (32×32). The Windows Terminal `wt.exe` App Execution Alias has no extractable
  product logo, so the Windows Terminal entry reuses the PowerShell icon to keep
  the terminal group visually consistent. CLI tools (OpenCode, Neovim, …) without
  a host icon fall back to a letter badge.
- **Selected app is per-browser.** The last-used choice is kept in
  `localStorage`, so it is shared across the sessions in one browser but not
  across browsers or machines.
