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
# VS Code: prefer the real GUI executable recorded in App Paths.
$ce = RegExe 'Code.exe'; if(-not $ce){ $ce=[string](Get-ItemProperty ('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\Code.exe') -ErrorAction SilentlyContinue).'(default)' }
if(-not $ce){ $c=Get-Command code -ErrorAction SilentlyContinue; if($c){$ce=$c.Source} }
if($ce){ $list += [ordered]@{id='vscode';label='VS Code';exe=$ce;icon=(Get-IconB64 $ce)} }
# Zed
$ze = Join-Path $env:LOCALAPPDATA 'Programs\Zed\Zed.exe'
if(-not (Test-Path $ze)){ $c=Get-Command zed -ErrorAction SilentlyContinue; if($c){$ze=$c.Source} }
if(Test-Path $ze){ $list += [ordered]@{id='zed';label='Zed';exe=$ze;icon=(Get-IconB64 $ze)} }
# DataGrip (JetBrains): the .bat wrapper next to the real datagrip64.exe.
$de = RegExe 'datagrip64.exe'; if(-not $de){ $c=Get-Command datagrip -ErrorAction SilentlyContinue; if($c){$de=$c.Source} }
if($de -match 'datagrip\.bat$'){ $de = $de -replace 'datagrip\.bat$','datagrip64.exe' }
if($de){ $list += [ordered]@{id='datagrip';label='DataGrip';exe=$de;icon=(Get-IconB64 $de)} }
# Windows Terminal (icon matches PowerShell; the wt App Execution Alias has no
# extractable product logo)
$wtc=Get-Command wt -ErrorAction SilentlyContinue; $wt=if($wtc){$wtc.Source}else{''}
if($wt){ $list += [ordered]@{id='winterm';label='Windows Terminal';exe=$wt;icon=(Get-IconB64 (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'))} }
# Always present on Windows
$list += [ordered]@{id='powershell';label='PowerShell';exe=(Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe');icon=(Get-IconB64 (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'))}
$list += [ordered]@{id='cmd';label='Command Prompt';exe=(Join-Path $env:SystemRoot 'System32\cmd.exe');icon=(Get-IconB64 (Join-Path $env:SystemRoot 'System32\cmd.exe'))}
$list += [ordered]@{id='explorer';label='File Explorer';exe=(Join-Path $env:SystemRoot 'explorer.exe');icon=(Get-IconB64 (Join-Path $env:SystemRoot 'explorer.exe'))}
$list | ConvertTo-Json -Compress
