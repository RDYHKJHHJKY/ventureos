$searchDirs = @(
  $env:LOCALAPPDATA, 
  $env:TEMP,
  "$env:LOCALAPPDATA\Packages\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\LocalState",
  "$env:LOCALAPPDATA\Packages\Microsoft.DesktopAppInstaller_8wekyb3d8bbwe\AC\Temp"
)
foreach ($dir in $searchDirs) {
  if (Test-Path $dir) {
    Write-Host "--- SEARCHING: $dir ---"
    Get-ChildItem -Path $dir -Recurse -Include '*.log','*.txt' -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match 'winget|postgres|install|setup|log' } |
      Select-Object -First 20 FullName | Format-List
  }
}
