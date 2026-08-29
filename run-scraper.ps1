# Force working directory to the exact project path
$projectDir = "C:\Users\USER\Desktop\Portfolio projects\devtool-lead-scraper"
Set-Location -Path $projectDir

$logFile = Join-Path -Path $projectDir -ChildPath "cron-log.txt"

# Write start timestamp
"----------------------------------------" | Out-File -FilePath $logFile -Encoding utf8 -Append
"🚀 Run started at $(Get-Date)" | Out-File -FilePath $logFile -Encoding utf8 -Append

# Execute scraper presets using full PATH resolution
try {
    & npx tsx src/index.ts --preset ATS_HIRING --limit 20 *>> $logFile
    & npx tsx src/index.ts --preset AI_DEVTOOLS --limit 20 *>> $logFile
} catch {
    "❌ Error during execution: $_" | Out-File -FilePath $logFile -Encoding utf8 -Append
}

# Write completion timestamp
"✅ Run finished at $(Get-Date)" | Out-File -FilePath $logFile -Encoding utf8 -Append