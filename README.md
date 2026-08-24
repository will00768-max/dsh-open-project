# dsh-open-with

English | [中文](README.zh.md)

Open the current project folder with an editor or terminal from the top-right of
the session header. The plugin adds one small dropdown utility to the
session-scoped `conversation.session.header.utilities` list. It scans the host
for the editors and terminals that are actually installed — VS Code, Zed,
DataGrip, Windows Terminal, PowerShell, Command Prompt, and File Explorer — and
lists only the ones it finds, each with its **real product icon** extracted from
the installed executable. Choosing an entry launches that app with the current
session's working directory (`cwd`).

The Host half is responsible for detection, icon extraction, and process launch.
The browser half owns the dropdown, its interaction state (open/closed, loaded
apps), the selected app, and the style sheet. They talk over the package-private
Client→Host RPC: `list-apps` and `open-with`.

## Behavior contract

| Entry point | Result |
|---|---|
| Header trigger | A split control at the right edge of the session header. The **icon** shows the app that would currently be used (the **last app you opened**, or the first detected app by default) and **clicking it opens that app right away**. A caret segment beside the icon toggles the dropdown. |
| Dropdown list | A beautified popover. One row per detected app with its real product icon, label, and a check mark on the currently selected app. Empty while detection is running, or an "No compatible app detected" placeholder when nothing matches. |
| Choose an app | Asks the Host half to launch the app with the project folder, remembers the choice (in `localStorage`, key `dsh.open-with.last`), moves the check mark, and closes the menu. The trigger icon now shows this app. |
| Click outside / Esc | Closes the dropdown. |

Detection is Windows-only and always includes PowerShell, Command Prompt, and
File Explorer because they are present on every Windows host. The detected set
is cached for the lifetime of the plugin run, so a re-open is instant.

### Launch mapping

| id | Label | Launch |
|---|---|---|
| `vscode` | VS Code | `Code.exe <project>` (real GUI executable from App Paths) |
| `zed` | Zed | `Zed.exe <project>` |
| `datagrip` | DataGrip | `datagrip64.exe <project>` (resolved from the `.bat` wrapper) |
| `winterm` | Windows Terminal | `wt.exe -d <project>` |
| `powershell` | PowerShell | `wt.exe -d <project> powershell.exe`, or a direct spawn when Terminal is absent |
| `cmd` | Command Prompt | `wt.exe -d <project> cmd.exe`, or `cmd /c start …` when Terminal is absent |
| `explorer` | File Explorer | `explorer.exe <project>` |

Terminal apps are routed through Windows Terminal when it is installed so they
open in their own window and start in the project folder. GUI apps spawn
directly with the folder argument. The plugin never waits for the launched
process, so opening an editor does not block the session.

Each app's icon is extracted on the host with `System.Drawing.Icon.ExtractAssociatedIcon`
and returned as a `data:image/png;base64,` URL, so the browser shows the actual
Windows application logo with no packaged image assets.

## Composition

```yaml
- insert:
    - id: open-with
      name: dsh-open-with
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
dsh plugin --profile <name> add dsh-open-with
```

Then add the `open-with` row above to that profile's `cordis.patch.yml`. The
web profile must be the one you run, because the dropdown lives in the browser
shell.

Follow the DSH plugin naming convention: the repository and npm package are named
`dsh-open-with` (`dsh-<feature>`). If you publish under your own npm scope,
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
- **Detection list is static.** A newly installed editor appears only after the
  plugin reloads (or the next plugin run after a page refresh).
- **No per-app configuration.** There is no UI to add a custom command or hide a
  detected app. The candidate set is fixed at the seven launchers above.
- **Terminal fallback is best-effort.** When Windows Terminal is not installed,
  PowerShell/Command Prompt spawn directly and may share the harness console
  (they are not given their own window on that path).
- **Icon extraction is Windows-only and best-effort.** Icons come from the real
  executable via `System.Drawing`, so the source is the installed app's icon
  (32×32). The Windows Terminal `wt.exe` App Execution Alias has no extractable
  product logo, so the Windows Terminal entry reuses the PowerShell icon to keep
  the terminal group visually consistent.
- **Selected app is per-browser.** The last-used choice is kept in
  `localStorage`, so it is shared across the sessions in one browser but not
  across browsers or machines.
