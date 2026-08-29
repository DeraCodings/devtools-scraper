# Run searches for each preset
npx tsx src/index.ts --preset BAAS_COMPETITORS --limit 5
npx tsx src/index.ts --preset AUTH_COMPETITORS --limit 5
npx tsx src/index.ts --preset AI_DEVTOOLS --limit 5
npx tsx src/index.ts --preset CMS_COMPETITORS --limit 5
npx tsx src/index.ts --preset YC_STARTUPS --limit 5
npx tsx src/index.ts --preset G2_CAPTERRA --limit 5

# Target vector databases hiring writers
npx tsx src/index.ts -q "site:boards.greenhouse.io \"vector database\" \"technical writer\"" -l 10

# Target developer tools offering remote roles
npx tsx src/index.ts -q "site:jobs.lever.co (\"developer documentation\" OR \"SDK\") \"remote\"" -l 3

# Scrape single or multiple target URLs directly
npx tsx src/index.ts -u https://jobs.lever.co/supabase https://boards.greenhouse.io/clerk

# Export strictly to CSV
npx tsx src/index.ts -p AI_DEVTOOLS -f csv

# Export strictly to JSON
npx tsx src/index.ts -p AI_DEVTOOLS -f json

# Export to both (Default behavior)
npx tsx src/index.ts -p AI_DEVTOOLS -f both

# Check available CLI options
npx tsx src/index.ts --help





$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File ""C:\Users\USER\Desktop\Portfolio projects\devtool-lead-scraper\run-scraper.ps1"""
$trigger = New-ScheduledTaskTrigger -Daily -At 12:00AM
Register-ScheduledTask -TaskName "DevTool Lead Scraper Midnight Run" -Action $action -Trigger $trigger -Description "Runs DevTool Lead Scraper every night at midnight"