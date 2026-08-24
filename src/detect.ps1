$ErrorActionPreference='SilentlyContinue'
Add-Type -AssemblyName System.Drawing
$pf=$env:ProgramFiles; $pf86=[Environment]::GetEnvironmentVariable('ProgramFiles(x86)'); $la=$env:LOCALAPPDATA; $sys=$env:SystemRoot
function Get-IconB64($exe){
  if(-not $exe -or -not (Test-Path $exe)){ return '' }
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
$uninstalls=@()
foreach($root in @('HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')){
  $uninstalls += @(Get-ItemProperty $root | Where-Object { $_.DisplayName })
}
function Resolve-Uninstall($keywords){
  foreach($u in $uninstalls){
    foreach($kw in $keywords){
      if($u.DisplayName -like ('*'+$kw+'*')){
        $icon=$u.DisplayIcon
        if($icon){
          $icon = ($icon -replace ',[0-9]+\s*$','') -replace '^"','' -replace '"$',''
          if((Test-Path $icon) -and $icon -match '\.exe$'){ return $icon }
        }
        $loc=$u.InstallLocation
        if($loc -and (Test-Path $loc)){
          $cand=Get-ChildItem $loc -Filter *.exe -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -notlike 'unins*' -and $_.Name -notlike 'elevat*' } | Select-Object -First 1
          if($cand){ return $cand.FullName }
        }
      }
    }
  }
  return ''
}
function Resolve-App($p){
  if($p.paths){ foreach($x in $p.paths){ if($x -and (Test-Path $x)){ return $x } } }
  if($p.appPath){
    foreach($hive in @('HKCU','HKLM')){
      $k=($hive+':\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\' + $p.appPath)
      $val=[string](Get-ItemProperty $k -ErrorAction SilentlyContinue).'(default)'
      if($val -and (Test-Path $val)){ return $val }
    }
  }
  if($p.command){ $c=Get-Command $p.command -ErrorAction SilentlyContinue; if($c -and $c.Source){ return $c.Source } }
  if($p.uninstall){ $r=Resolve-Uninstall $p.uninstall; if($r){ return $r } }
  return ''
}
$catalog=@(
  @{id='vscode';label='VS Code';mode='gui';paths=@("$pf\Microsoft VS Code\Code.exe","$pf86\Microsoft VS Code\Code.exe");appPath='Code.exe';command='code';uninstall=@('Visual Studio Code')},
  @{id='vscode-insiders';label='VS Code Insiders';mode='gui';appPath='Code - Insiders.exe';command='code-insiders';uninstall=@('Visual Studio Code - Insiders')},
  @{id='cursor';label='Cursor';mode='gui';paths=@("$la\Programs\cursor\Cursor.exe");appPath='Cursor.exe';command='cursor';uninstall=@('Cursor')},
  @{id='trae';label='Trae';mode='gui';paths=@("$la\Programs\Trae\Trae.exe","$la\Programs\Trae CN\Trae.exe");command='trae';uninstall=@('TraeCode','Trae Code','Trae CN')},
  @{id='trae-work';label='Trae Work';mode='gui';uninstall=@('TraeWork','TRAE SOLO')},
  @{id='zed';label='Zed';mode='gui';paths=@("$la\Programs\Zed\Zed.exe");command='zed';uninstall=@('Zed')},
  @{id='windsurf';label='Windsurf';mode='gui';paths=@("$la\Programs\Windsurf\Windsurf.exe");command='windsurf';uninstall=@('Windsurf','Codeium')},
  @{id='codium';label='VSCodium';mode='gui';paths=@("$la\Programs\VSCodium\VSCodium.exe");appPath='VSCodium.exe';command='codium';uninstall=@('VSCodium')},
  @{id='sublime';label='Sublime Text';mode='gui';paths=@("$pf\Sublime Text 3\sublime_text.exe","$la\Programs\Sublime Text 3\sublime_text.exe");command='subl';uninstall=@('Sublime Text')},
  @{id='notepadpp';label='Notepad++';mode='gui';paths=@("$pf\Notepad++\notepad++.exe","$pf86\Notepad++\notepad++.exe");uninstall=@('Notepad++')},
  @{id='datagrip';label='DataGrip';mode='gui';appPath='datagrip64.exe';uninstall=@('DataGrip')},
  @{id='intellij';label='IntelliJ IDEA';mode='gui';appPath='idea64.exe';command='idea';uninstall=@('IntelliJ IDEA')},
  @{id='pycharm';label='PyCharm';mode='gui';appPath='pycharm64.exe';command='pycharm';uninstall=@('PyCharm')},
  @{id='goland';label='GoLand';mode='gui';appPath='goland64.exe';command='goland';uninstall=@('GoLand')},
  @{id='webstorm';label='WebStorm';mode='gui';appPath='webstorm64.exe';command='webstorm';uninstall=@('WebStorm')},
  @{id='phpstorm';label='PhpStorm';mode='gui';appPath='phpstorm64.exe';command='phpstorm';uninstall=@('PhpStorm')},
  @{id='rubymine';label='RubyMine';mode='gui';appPath='rubymine64.exe';command='rubymine';uninstall=@('RubyMine')},
  @{id='clion';label='CLion';mode='gui';appPath='clion64.exe';command='clion';uninstall=@('CLion')},
  @{id='rider';label='Rider';mode='gui';appPath='rider64.exe';command='rider';uninstall=@('Rider')},
  @{id='androidstudio';label='Android Studio';mode='gui';appPath='studio64.exe';command='studio';uninstall=@('Android Studio')},
  @{id='eclipse';label='Eclipse';mode='gui';uninstall=@('Eclipse')},
  @{id='netbeans';label='NetBeans';mode='gui';uninstall=@('NetBeans')},
  @{id='opencode';label='OpenCode';mode='term';command='opencode'},
  @{id='nvim';label='Neovim';mode='term';command='nvim';uninstall=@('Neovim')},
  @{id='helix';label='Helix';mode='term';command='hx'},
  @{id='micro';label='Micro';mode='term';command='micro'},
  @{id='winterm';label='Windows Terminal';mode='terminal';command='wt'},
  @{id='pwsh';label='PowerShell 7';mode='shell';command='pwsh'},
  @{id='alacritty';label='Alacritty';mode='term';command='alacritty';uninstall=@('Alacritty')},
  @{id='wezterm';label='WezTerm';mode='term';command='wezterm-gui';uninstall=@('WezTerm')},
  @{id='tabby';label='Tabby';mode='term';uninstall=@('Tabby')},
  @{id='warp';label='Warp';mode='term';uninstall=@('Warp')},
  @{id='conemu';label='ConEmu';mode='term';uninstall=@('ConEmu')},
  @{id='cmder';label='Cmder';mode='term';uninstall=@('Cmder')}
)
$list=@()
foreach($a in $catalog){
  $exe=Resolve-App $a
  if($exe){ $list += [ordered]@{id=$a.id;label=$a.label;exe=$exe;mode=$a.mode;icon=(Get-IconB64 $exe)} }
}
$list += [ordered]@{id='powershell';label='PowerShell';exe=(Join-Path $sys 'System32\WindowsPowerShell\v1.0\powershell.exe');mode='shell';icon=(Get-IconB64 (Join-Path $sys 'System32\WindowsPowerShell\v1.0\powershell.exe'))}
$list += [ordered]@{id='cmd';label='Command Prompt';exe=(Join-Path $sys 'System32\cmd.exe');mode='shell';icon=(Get-IconB64 (Join-Path $sys 'System32\cmd.exe'))}
$list += [ordered]@{id='explorer';label='File Explorer';exe=(Join-Path $sys 'explorer.exe');mode='explorer';icon=(Get-IconB64 (Join-Path $sys 'explorer.exe'))}
$list | ConvertTo-Json -Compress
