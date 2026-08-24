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
# A .bat/.cmd launcher often wraps the real GUI exe (JetBrains: datagrip.bat ->
# datagrip64.exe). Resolve to the sibling .exe so both launch and icon use the
# real product executable.
function Resolve-RealExe($exe){
  if(-not $exe){ return $exe }
  if($exe -match '\.(bat|cmd)$'){
    $dir=Split-Path $exe
    $base=[IO.Path]::GetFileNameWithoutExtension($exe)
    $cand=Get-ChildItem $dir -Filter '*.exe' -File -ErrorAction SilentlyContinue | Where-Object { $_.BaseName -like ($base+'*') } | Select-Object -First 1
    if($cand){ return $cand.FullName }
  }
  return $exe
}
# Generate a clean colored letter-badge PNG (used when a launcher has no real
# product icon, e.g. .ps1 CLI shims). Returns a data URL the browser can show
# directly, so even a plain <img> renders it.
function Get-LetterBadge($label){
  try {
    $t=[string]$label
    if($t.Length -lt 1){ return '' }
    $h=0
    foreach($ch in $t.ToCharArray()){ $h=($h*31+[int]$ch) % 100000 }
    $palette=@(@(255,87,34),@(63,81,181),@(0,150,136),@(233,30,99),@(56,142,60),@(121,85,72),@(0,137,123),@(103,58,183),@(255,152,0),@(33,150,243),@(0,121,107),@(69,90,100))
    $idx=$h % $palette.Count
    $bmp=New-Object System.Drawing.Bitmap(32,32)
    $g=[System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint=[System.Drawing.Text.TextRenderingHint]::AntiAlias
    $brush=New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,$palette[$idx][0],$palette[$idx][1],$palette[$idx][2]))
    $g.FillRectangle($brush,0,0,32,32)
    $font=New-Object System.Drawing.Font('Segoe UI',15,[System.Drawing.FontStyle]::Bold)
    $sf=New-Object System.Drawing.StringFormat
    $sf.Alignment=[System.Drawing.StringAlignment]::Center
    $sf.LineAlignment=[System.Drawing.StringAlignment]::Center
    $ch0=$t.Substring(0,1).ToUpper()
    $g.DrawString($ch0,$font,[System.Drawing.Brushes]::White,(New-Object System.Drawing.RectangleF(0,0,32,32)),$sf)
    $ms=New-Object System.IO.MemoryStream
    $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png)
    $b64=[Convert]::ToBase64String($ms.ToArray())
    $g.Dispose();$brush.Dispose();$bmp.Dispose();$font.Dispose();$sf.Dispose();$ms.Dispose()
    return 'data:image/png;base64,' + $b64
  } catch { return '' }
}
$catalog=@(
  # --- Microsoft / VS Code family ---
  @{id='vscode';label='VS Code';mode='gui';paths=@("$pf\Microsoft VS Code\Code.exe","$pf86\Microsoft VS Code\Code.exe");appPath='Code.exe';command='code';uninstall=@('Visual Studio Code')},
  @{id='vscode-insiders';label='VS Code Insiders';mode='gui';paths=@("$pf\Microsoft VS Code - Insiders\Code - Insiders.exe","$pf86\Microsoft VS Code - Insiders\Code - Insiders.exe");appPath='Code - Insiders.exe';command='code-insiders';uninstall=@('Visual Studio Code - Insiders')},
  @{id='codium';label='VSCodium';mode='gui';paths=@("$la\Programs\VSCodium\VSCodium.exe");appPath='VSCodium.exe';command='codium';uninstall=@('VSCodium')},
  @{id='visualstudio';label='Visual Studio';mode='gui';appPath='devenv.exe';command='devenv';uninstall=@('Visual Studio Community','Visual Studio Professional','Visual Studio Enterprise')},
  @{id='wsl-vscode';label='VsCode WSL';mode='gui';command='code-wsl'},

  # --- AI editors ---
  @{id='cursor';label='Cursor';mode='gui';paths=@("$la\Programs\cursor\Cursor.exe");appPath='Cursor.exe';command='cursor';uninstall=@('Cursor')},
  @{id='windsurf';label='Windsurf';mode='gui';paths=@("$la\Programs\Windsurf\Windsurf.exe","$la\Programs\windsurf\Windsurf.exe");command='windsurf';uninstall=@('Windsurf','Codeium')},
  @{id='trae';label='Trae';mode='gui';paths=@("$la\Programs\Trae\Trae.exe","$la\Programs\Trae CN\Trae.exe");command='trae';uninstall=@('TraeCode','Trae Code','Trae CN')},
  @{id='trae-work';label='Trae Work';mode='gui';uninstall=@('TraeWork','TRAE SOLO')},
  @{id='codegpt';label='CodeGPT';mode='gui';command='codegpt';uninstall=@('CodeGPT')},

  # --- General editors ---
  @{id='zed';label='Zed';mode='gui';paths=@("$la\Programs\Zed\Zed.exe");command='zed';uninstall=@('Zed')},
  @{id='sublime';label='Sublime Text';mode='gui';paths=@("$pf\Sublime Text 3\sublime_text.exe","$pf86\Sublime Text 3\sublime_text.exe","$la\Programs\Sublime Text 3\sublime_text.exe");command='subl';uninstall=@('Sublime Text')},
  @{id='notepadpp';label='Notepad++';mode='gui';paths=@("$pf\Notepad++\notepad++.exe","$pf86\Notepad++\notepad++.exe");uninstall=@('Notepad++')},
  @{id='atom';label='Atom';mode='gui';paths=@("$pf\Atom\atom.exe","$pf86\Atom\atom.exe");command='atom';uninstall=@('Atom')},
  @{id='pulsar';label='Pulsar';mode='gui';command='pulsar';uninstall=@('Pulsar')},
  @{id='brackets';label='Brackets';mode='gui';command='brackets';uninstall=@('Brackets')},
  @{id='geany';label='Geany';mode='gui';paths=@("$pf\Geany\bin\geany.exe");command='geany';uninstall=@('Geany')},
  @{id='kate';label='Kate';mode='gui';command='kate';uninstall=@('Kate')},
  @{id='notepadqq';label='Notepadqq';mode='gui';uninstall=@('Notepadqq')},
  @{id='ultraedit';label='UltraEdit';mode='gui';command='uedit32';uninstall=@('UltraEdit')},
  @{id='emeditor';label='EmEditor';mode='gui';uninstall=@('EmEditor')},
  @{id='textpad';label='TextPad';mode='gui';uninstall=@('TextPad')},
  @{id='komodo';label='Komodo Edit';mode='gui';command='komodo';uninstall=@('Komodo')},
  @{id='bluefish';label='Bluefish';mode='gui';uninstall=@('Bluefish')},

  # --- JetBrains ---
  @{id='datagrip';label='DataGrip';mode='gui';appPath='datagrip64.exe';command='datagrip';uninstall=@('DataGrip')},
  @{id='dataspell';label='DataSpell';mode='gui';appPath='dataspell64.exe';command='dataspell';uninstall=@('DataSpell')},
  @{id='intellij';label='IntelliJ IDEA';mode='gui';appPath='idea64.exe';command='idea';uninstall=@('IntelliJ IDEA')},
  @{id='pycharm';label='PyCharm';mode='gui';appPath='pycharm64.exe';command='pycharm';uninstall=@('PyCharm')},
  @{id='goland';label='GoLand';mode='gui';appPath='goland64.exe';command='goland';uninstall=@('GoLand')},
  @{id='webstorm';label='WebStorm';mode='gui';appPath='webstorm64.exe';command='webstorm';uninstall=@('WebStorm')},
  @{id='phpstorm';label='PhpStorm';mode='gui';appPath='phpstorm64.exe';command='phpstorm';uninstall=@('PhpStorm')},
  @{id='rubymine';label='RubyMine';mode='gui';appPath='rubymine64.exe';command='rubymine';uninstall=@('RubyMine')},
  @{id='clion';label='CLion';mode='gui';appPath='clion64.exe';command='clion';uninstall=@('CLion')},
  @{id='rider';label='Rider';mode='gui';appPath='rider64.exe';command='rider';uninstall=@('Rider')},
  @{id='aqua';label='Aqua';mode='gui';appPath='aqua64.exe';command='aqua';uninstall=@('Aqua')},
  @{id='fleet';label='Fleet';mode='gui';command='fleet';uninstall=@('Fleet')},
  @{id='androidstudio';label='Android Studio';mode='gui';appPath='studio64.exe';command='studio';uninstall=@('Android Studio')},

  # --- Other IDEs ---
  @{id='eclipse';label='Eclipse';mode='gui';command='eclipse';uninstall=@('Eclipse IDE','Eclipse')},
  @{id='netbeans';label='NetBeans';mode='gui';command='netbeans';uninstall=@('NetBeans')},
  @{id='qtcreator';label='Qt Creator';mode='gui';command='qtcreator';uninstall=@('Qt Creator')},
  @{id='codeblocks';label='Code::Blocks';mode='gui';uninstall=@('Code::Blocks')},
  @{id='devcpp';label='Dev-C++';mode='gui';uninstall=@('Dev-C++')},
  @{id='codelite';label='CodeLite';mode='gui';uninstall=@('CodeLite')},
  @{id='kdevelop';label='KDevelop';mode='gui';uninstall=@('KDevelop')},
  @{id='ninjaide';label='Ninja-IDE';mode='gui';uninstall=@('Ninja-IDE')},
  @{id='rstudio';label='RStudio';mode='gui';command='rstudio';uninstall=@('RStudio')},
  @{id='spyder';label='Spyder';mode='gui';command='spyder';uninstall=@('Spyder')},
  @{id='thonny';label='Thonny';mode='gui';command='thonny';uninstall=@('Thonny')},
  @{id='matlab';label='MATLAB';mode='gui';command='matlab';uninstall=@('MATLAB')},
  @{id='octave';label='GNU Octave';mode='gui';command='octave';uninstall=@('GNU Octave')},
  @{id='pycharm-community';label='PyCharm CE';mode='gui';appPath='pycharm64.exe';command='charm';uninstall=@('PyCharm Community')},

  # --- Terminal editors / CLIs ---
  @{id='vim';label='Vim';mode='gui';command='gvim';uninstall=@('Vim')},
  @{id='nvim';label='Neovim';mode='term';command='nvim';uninstall=@('Neovim')},
  @{id='helix';label='Helix';mode='term';command='hx'},
  @{id='micro';label='Micro';mode='term';command='micro'},
  @{id='emacs';label='Emacs';mode='gui';command='emacs';uninstall=@('GNU Emacs')},

  # --- AI CLI tools ---
  @{id='opencode';label='OpenCode';mode='term';command='opencode'},
  @{id='codex';label='Codex CLI';mode='term';command='codex'},
  @{id='claude';label='Claude Code';mode='term';command='claude'},
  @{id='aider';label='Aider';mode='term';command='aider'},
  @{id='gemini';label='Gemini CLI';mode='term';command='gemini'},
  @{id='copilot-cli';label='Copilot CLI';mode='term';command='copilot'},

  # --- Terminal emulators ---
  @{id='winterm';label='Windows Terminal';mode='terminal';command='wt'},
  @{id='pwsh';label='PowerShell 7';mode='shell';command='pwsh'},
  @{id='alacritty';label='Alacritty';mode='term';command='alacritty';uninstall=@('Alacritty')},
  @{id='wezterm';label='WezTerm';mode='term';command='wezterm-gui';uninstall=@('WezTerm')},
  @{id='tabby';label='Tabby';mode='term';uninstall=@('Tabby')},
  @{id='warp';label='Warp';mode='term';uninstall=@('Warp')},
  @{id='conemu';label='ConEmu';mode='term';command='ConEmu64';uninstall=@('ConEmu')},
  @{id='cmder';label='Cmder';mode='term';paths=@("$la\Cmder\Cmder.exe");command='cmder';uninstall=@('Cmder')},
  @{id='hyper';label='Hyper';mode='term';command='hyper';uninstall=@('Hyper')},
  @{id='terminus';label='Terminus';mode='term';command='terminus';uninstall=@('Terminus')},
  @{id='termius';label='Termius';mode='term';command='termius';uninstall=@('Termius')},
  @{id='mobaxterm';label='MobaXterm';mode='term';command='MobaXterm';uninstall=@('MobaXterm')},
  @{id='putty';label='PuTTY';mode='term';command='putty';uninstall=@('PuTTY')},
  @{id='xshell';label='Xshell';mode='term';uninstall=@('Xshell')},
  @{id='securecrt';label='SecureCRT';mode='term';uninstall=@('SecureCRT')},

  # --- Shells ---
  @{id='gitbash';label='Git Bash';mode='shell';paths=@("$pf\Git\git-bash.exe","$pf86\Git\git-bash.exe","$pf\Git\bin\bash.exe","$pf86\Git\bin\bash.exe");command='bash'},
  @{id='cygwin';label='Cygwin';mode='shell';paths=@("$pf\Cygwin\bin\bash.exe");uninstall=@('Cygwin')},
  @{id='msys2';label='MSYS2';mode='shell';paths=@("$pf\msys64\usr\bin\bash.exe");uninstall=@('MSYS2')},
  @{id='nushell';label='Nushell';mode='term';command='nu'},

  # --- File managers ---
  @{id='totalcmd';label='Total Commander';mode='explorer';paths=@("$pf\Total Commander\TOTALCMD64.EXE","$pf86\Total\TOTALCMD64.EXE");command='totalcmd';uninstall=@('Total Commander')},
  @{id='dircop';label='Directory Opus';mode='explorer';uninstall=@('Directory Opus')},
  @{id='far';label='FAR Manager';mode='explorer';command='far';uninstall=@('FAR Manager')},
  @{id='doublecmd';label='Double Commander';mode='explorer';uninstall=@('Double Commander')},
  @{id='freecmd';label='FreeCommander';mode='explorer';uninstall=@('FreeCommander')},
  @{id='xplorer2';label='xplorer2';mode='explorer';uninstall=@('xplorer2')},
  @{id='xyplorer';label='XYplorer';mode='explorer';uninstall=@('XYplorer')},
  @{id='onecmd';label='One Commander';mode='explorer';uninstall=@('One Commander')},
  @{id='qdir';label='Q-Dir';mode='explorer';uninstall=@('Q-Dir')},
  @{id='multicmd';label='Multi Commander';mode='explorer';uninstall=@('Multi Commander')}
)
$list=@()
$psicon=(Get-IconB64 (Join-Path $sys 'System32\WindowsPowerShell\v1.0\powershell.exe'))
foreach($a in $catalog){
  $exe=Resolve-App $a
  if($exe){
    $exe=Resolve-RealExe $exe
    $icon=''
    if($a.id -eq 'winterm'){ $icon=$psicon }
    elseif($exe -match '\.ps1$'){ $icon=(Get-LetterBadge $a.label) }
    else { $icon=(Get-IconB64 $exe) }
    if(-not $icon){ $icon=(Get-LetterBadge $a.label) }
    $list += [ordered]@{id=$a.id;label=$a.label;exe=$exe;mode=$a.mode;icon=$icon}
  }
}
$list += [ordered]@{id='powershell';label='PowerShell';exe=(Join-Path $sys 'System32\WindowsPowerShell\v1.0\powershell.exe');mode='shell';icon=(Get-IconB64 (Join-Path $sys 'System32\WindowsPowerShell\v1.0\powershell.exe'))}
$list += [ordered]@{id='cmd';label='Command Prompt';exe=(Join-Path $sys 'System32\cmd.exe');mode='shell';icon=(Get-IconB64 (Join-Path $sys 'System32\cmd.exe'))}
$list += [ordered]@{id='explorer';label='File Explorer';exe=(Join-Path $sys 'explorer.exe');mode='explorer';icon=(Get-IconB64 (Join-Path $sys 'explorer.exe'))}
$list | ConvertTo-Json -Compress
