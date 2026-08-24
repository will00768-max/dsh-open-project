// Host half of the dsh-open-with plugin.
//
// Detects the editors and terminals installed on the machine (Windows), pulls a
// real app icon out of each launcher, and launches the chosen one with the
// current project folder. The browser half calls back into these two
// package-private RPC methods:
//
//   harness.handle('list-apps')  -> [{ id, label, exe, icon }, ...]
//   harness.handle('open-with')  -> { ok, error? }   (args: { appId, path })
//
// `icon` is a `data:image/png;base64,` URL so the browser can render the real
// product logo without extra assets. Detection returns only what is installed;
// cmd, powershell, and explorer are present on every Windows host.

export const name = 'open-with'
export const inject = []

// Windows PowerShell detection script. Prints one JSON array of
// { id, label, exe, icon } for every launcher that exists on this host. Each
// icon is extracted from the executable via System.Drawing (the actual Windows
// application icon). Single-quoted string literals keep the -Command argument
// free of double-quote parsing issues. This is the same script shipped as
// src/detect.ps1.
export const DETECT_SCRIPT = String.raw`
$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Drawing
function Get-IconB64($exe){
  try {
    $icon=[System.Drawing.Icon]::ExtractAssociatedIcon($exe)
    if($null -eq $icon){ return '' }
    $bmp=$icon.ToBitmap()
    $ms=New-Object System.IO.MemoryStream
    $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png)
    $b64=[Convert]::ToBase64String($ms.ToArray())
    $icon.Dispose();$bmp.Dispose();$ms.Dispose()
    return 'data:image/png;base64,' + $b64
  } catch { return '' }
}
function RegExe($k){ [string](Get-ItemProperty ('Registry::HKEY_CURRENT_USER\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\'+$k) -ErrorAction SilentlyContinue).'(default)' }
$list=@()
$ce = RegExe 'Code.exe'; if(-not $ce){ $ce=[string](Get-ItemProperty ('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Code.exe') -ErrorAction SilentlyContinue).'(default)' }
if(-not $ce){ $c=Get-Command code -ErrorAction SilentlyContinue; if($c){$ce=$c.Source} }
if($ce){ $list += [ordered]@{id='vscode';label='VS Code';exe=$ce;icon=(Get-IconB64 $ce)} }
$ze = Join-Path $env:LOCALAPPDATA 'Programs\Zed\Zed.exe'
if(-not (Test-Path $ze)){ $c=Get-Command zed -ErrorAction SilentlyContinue; if($c){$ze=$c.Source} }
if(Test-Path $ze){ $list += [ordered]@{id='zed';label='Zed';exe=$ze;icon=(Get-IconB64 $ze)} }
$de = RegExe 'datagrip64.exe'; if(-not $de){ $c=Get-Command datagrip -ErrorAction SilentlyContinue; if($c){$de=$c.Source} }
if($de -match 'datagrip\.bat$'){ $de = $de -replace 'datagrip\.bat$','datagrip64.exe' }
if($de){ $list += [ordered]@{id='datagrip';label='DataGrip';exe=$de;icon=(Get-IconB64 $de)} }
$wtc=Get-Command wt -ErrorAction SilentlyContinue; $wt=if($wtc){$wtc.Source}else{''}
if($wt){ $list += [ordered]@{id='winterm';label='Windows Terminal';exe=$wt;icon=(Get-IconB64 (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'))} }
$list += [ordered]@{id='powershell';label='PowerShell';exe=(Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe');icon=(Get-IconB64 (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'))}
$list += [ordered]@{id='cmd';label='Command Prompt';exe=(Join-Path $env:SystemRoot 'System32\cmd.exe');icon=(Get-IconB64 (Join-Path $env:SystemRoot 'System32\cmd.exe'))}
$list += [ordered]@{id='explorer';label='File Explorer';exe=(Join-Path $env:SystemRoot 'explorer.exe');icon=(Get-IconB64 (Join-Path $env:SystemRoot 'explorer.exe'))}
$list | ConvertTo-Json -Compress`

// Build the exact argv for one app and the target folder. Terminal apps are
// opened through Windows Terminal when it is installed so they get their own
// window and start in the project folder; otherwise a best-effort direct spawn
// is used.
function buildArgv(app, path, detected) {
  const wt = (detected || []).find((a) => a.id === 'winterm')
  const quote = (s) => '"' + String(s).replace(/"/g, '\\"') + '"'
  if (app.id === 'winterm') return [app.exe, '-d', path]
  if (app.id === 'powershell') {
    if (wt) return [wt.exe, '-d', path, 'powershell.exe']
    return [app.exe, '-NoExit', '-Command', 'Set-Location -LiteralPath ' + quote(path)]
  }
  if (app.id === 'cmd') {
    if (wt) return [wt.exe, '-d', path, 'cmd.exe']
    return ['cmd.exe', '/c', 'start', '', 'cmd.exe', '/k', 'cd /d ' + quote(path)]
  }
  // GUI apps (VS Code, Zed, DataGrip, File Explorer) accept the folder path.
  return [app.exe, path]
}

export function apply(ctx) {
  const subprocess = ctx.get('subprocess')
  let detected = null // last detection result, shared by both RPC handlers

  const detect = async (cwd) => {
    if (subprocess === undefined) return []
    try {
      const handle = subprocess.spawn({
        argv: ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', DETECT_SCRIPT],
        cwd: cwd || 'C:\\',
        stdio: { stdin: 'ignore', stdout: { maxBytes: 1048576 }, stderr: { maxBytes: 8192 } },
        graceMs: 20000,
      })
      const outcome = await handle.done
      if (outcome.exitCode !== 0) return []
      const stdout = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
      const parsed = JSON.parse(stdout)
      return Array.isArray(parsed) ? parsed : []
    } catch (error) {
      console.error('open-with detect error', error)
      return []
    }
  }

  harness.handle('list-apps', async (args) => {
    const path = args && args.path
    detected = await detect(path)
    return detected
  })

  harness.handle('open-with', async (args) => {
    const appId = args && args.appId
    const path = args && args.path
    if (!appId || !path) return { ok: false, error: 'missing appId or path' }
    try {
      if (!detected) detected = await detect(path)
      const app = (detected || []).find((a) => a.id === appId)
      if (!app) return { ok: false, error: 'app not detected: ' + appId }
      if (subprocess === undefined) return { ok: false, error: 'subprocess unavailable' }
      subprocess.spawn({
        argv: buildArgv(app, path, detected),
        cwd: path,
        stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
        graceMs: 15000,
      })
      return { ok: true }
    } catch (error) {
      console.error('open-with error', error)
      return { ok: false, error: String((error && error.message) || error) }
    }
  })
}
