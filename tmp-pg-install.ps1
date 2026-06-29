$installer = 'C:\Users\user\AppData\Local\Temp\WinGet\PostgreSQL.PostgreSQL.17.17.10-2\postgresql-17.10-2-windows-x64.exe'
Write-Host "Installer exists: $(Test-Path $installer)"
if (-Not (Test-Path $installer)) { Write-Error 'Installer not found'; exit 1 }
$arguments = @(
  '--mode','unattended',
  '--unattendedmodeui','none',
  '--superpassword','postgres',
  '--serverport','5432'
)
Write-Host "Launching installer with arguments: $($arguments -join ' ')"
try {
  $proc = Start-Process -FilePath $installer -ArgumentList $arguments -Verb RunAs -Wait -PassThru
  Write-Host "Started installer, ExitCode=$($proc.ExitCode)"
} catch {
  Write-Host "ERROR: $($_.Exception.Message)"
  if ($_.Exception.InnerException) { Write-Host "INNER: $($_.Exception.InnerException.Message)" }
  exit 1
}
