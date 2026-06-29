$installer = 'C:\Users\user\AppData\Local\Temp\WinGet\PostgreSQL.PostgreSQL.17.17.10-2\postgresql-17.10-2-windows-x64.exe'
Write-Host "Installer exists: $(Test-Path $installer)"
if (Test-Path $installer) {
  & $installer --help 2>&1 | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "Installer not found"
}
