# Creates the AutoShort icons (desktop and Start menu) that start the app without a console window.
# Run once by start.bat on the first launch; an icon that already exists is left as it is.
param(
	[Parameter(Mandatory = $true)][string]$Root,
	# For tests: where to put the icons instead of the real desktop and Start menu.
	[string]$Desktop = [Environment]::GetFolderPath('Desktop'),
	[string]$StartMenu = [Environment]::GetFolderPath('Programs')
)
$root = (Resolve-Path $Root).Path
$shell = New-Object -ComObject WScript.Shell
foreach ($folder in @($Desktop, $StartMenu)) {
	if (-not $folder -or -not (Test-Path $folder)) { continue }
	$link = Join-Path $folder 'AutoShort.lnk'
	if (Test-Path $link) { continue }
	$s = $shell.CreateShortcut($link)
	$s.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
	$s.Arguments = '"' + (Join-Path $root 'launcher\AutoShort.vbs') + '"'
	$s.WorkingDirectory = $root
	$s.IconLocation = (Join-Path $root 'launcher\autoshort-icon.ico') + ',0'
	$s.Description = 'AutoShort: editor for face cam shorts'
	$s.Save()
}
