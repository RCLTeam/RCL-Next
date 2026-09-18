param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path $projectRoot '.local/postgres'
$binDirectory = Join-Path $localRoot 'runtime/pgsql/bin'
$dataDirectory = Join-Path $localRoot 'data'
$pgCtl = Join-Path $binDirectory 'pg_ctl.exe'
if (-not (Test-Path -LiteralPath $pgCtl)) {
  throw 'Portable PostgreSQL is missing. See docs/local-development.md.'
}

if ($Action -eq 'status') {
  & $pgCtl status -D $dataDirectory
  exit $LASTEXITCODE
}
if ($Action -eq 'stop') {
  & $pgCtl stop -D $dataDirectory -m fast -w -t 30
  exit $LASTEXITCODE
}

# Read the same local connection as the API, without printing its credentials.
$connectionString = $env:DATABASE_URL
if (-not $connectionString) {
  $environmentText = Get-Content -LiteralPath (Join-Path $projectRoot '.env') -Raw
  $match = [regex]::Match($environmentText, '(?m)^\s*DATABASE_URL\s*=\s*(.+?)\s*$')
  if (-not $match.Success) { throw 'DATABASE_URL is missing from .env.' }
  $connectionString = $match.Groups[1].Value.Trim().Trim('"').Trim("'")
}
$uri = [Uri]$connectionString
if ($uri.Scheme -notin @('postgres', 'postgresql') -or $uri.Host -notin @('localhost', '127.0.0.1')) {
  throw 'This helper only manages a local PostgreSQL instance.'
}
$port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$credentials = $uri.UserInfo.Split(':', 2)
if ($credentials.Count -ne 2) { throw 'DATABASE_URL must contain a username and password.' }
$dbUser = [Uri]::UnescapeDataString($credentials[0])
$dbPassword = [Uri]::UnescapeDataString($credentials[1])
$dbName = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
if ($dbUser -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$' -or $dbName -notmatch '^[a-zA-Z_][a-zA-Z0-9_]*$') {
  throw 'This local helper requires simple database and user names.'
}

if (-not (Test-Path -LiteralPath (Join-Path $dataDirectory 'PG_VERSION'))) {
  if ((Test-Path -LiteralPath $dataDirectory) -and (Get-ChildItem -LiteralPath $dataDirectory -Force | Select-Object -First 1)) {
    throw 'The data directory is not empty. Nothing was changed.'
  }
  $passwordFile = Join-Path $localRoot 'init-password.tmp'
  try {
    [System.IO.File]::WriteAllText($passwordFile, $dbPassword + "`n")
    & (Join-Path $binDirectory 'initdb.exe') -D $dataDirectory -U $dbUser --encoding=UTF8 --locale=C --auth=scram-sha-256 "--pwfile=$passwordFile"
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initialization failed.' }
  } finally {
    if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile }
  }
}

& $pgCtl status -D $dataDirectory *> $null
if ($LASTEXITCODE -ne 0) {
  $serverLog = Join-Path $localRoot 'postgres.log'
  $startup = Start-Process -FilePath $pgCtl -ArgumentList @(
    'start', '-D', "`"$dataDirectory`"", '-l', "`"$serverLog`"",
    '-o', "`"-h 127.0.0.1 -p $port`"", '-w', '-t', '30'
  ) -WindowStyle Hidden -PassThru
  # Wait only for pg_ctl, not for its long-lived PostgreSQL child process.
  $startup.WaitForExit()
  $startup.Refresh()
  if ($startup.ExitCode -ne 0) { throw 'PostgreSQL startup failed. Check .local/postgres/postgres.log.' }
}

$previousPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $dbPassword
  $exists = & (Join-Path $binDirectory 'psql.exe') -h 127.0.0.1 -p $port -U $dbUser -d postgres -w -tAc "SELECT 1 FROM pg_database WHERE datname = '$dbName'"
  if ($LASTEXITCODE -ne 0) { throw 'Could not connect to local PostgreSQL.' }
  if ($exists -ne '1') {
    & (Join-Path $binDirectory 'createdb.exe') -h 127.0.0.1 -p $port -U $dbUser -w $dbName
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the local database.' }
  }
} finally {
  $env:PGPASSWORD = $previousPassword
}
Write-Output "PostgreSQL ready at 127.0.0.1:$port; database $dbName."
