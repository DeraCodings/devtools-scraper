Markdown
# DevTool Lead Scraper 🚀

An automated, intelligent lead discovery pipeline designed to surface high-intent developer tool companies actively hiring technical writers, Developer Advocates, and DevRel engineers. 

Built with **TypeScript**, **Node.js**, **SerpApi**, **Firecrawl**, **OpenRouter (LLMs)**, and **Telegram**, this tool cuts through search engine clutter by scraping target career pages, evaluating company intent using AI, deduplicating against historical exports, and delivering qualified outreach opportunities straight to a Telegram channel.

---

## 💡 Why This Exists

Manual lead generation for technical writing and DevRel freelancing is tedious. Generic job board alerts dump hundreds of irrelevant roles into your inbox, while pure web scrapers fail to distinguish between generic SaaS startups and genuine developer-focused tools.

This project automates the entire funnel:
1. **Targeting:** Runs targeted Google Dorks across ATS platforms (Greenhouse, Lever, Ashby) and DevTool niches (AI, Auth, BaaS, Headless CMS).
2. **Scraping:** Fetches raw page contents cleanly using Firecrawl API.
3. **AI Qualification:** Uses LLM reasoning via OpenRouter to score company fit, Developer Experience focus, and outreach potential (0–100 score).
4. **Deduplication:** Maintains historical CSV tracking to prevent duplicate outreach.
5. **Alerting:** Pushes only high-scoring leads directly to a Telegram channel for immediate action.

---

## 🛠️ Tech Stack

* **Runtime:** Node.js (v20+), TypeScript (`tsx` runner)
* **Search Engine API:** [SerpApi](https://serpapi.com/) (Google Search API)
* **Web Scraping:** [Firecrawl API](https://www.firecrawl.dev/) (Markdown extraction)
* **LLM Intelligence:** [OpenRouter](https://openrouter.ai/) (Structured output evaluation)
* **Notification System:** Telegram Bot API (`node-telegram-bot-api` / HTTP fetch)
* **Automation:** GitHub Actions (24/7 Cloud Scheduled Runs) & Windows Task Scheduler

---

## 📁 Repository Structure

```text
devtool-lead-scraper/
├── .github/
│   └── workflows/
│       └── scraper.yml         # GitHub Actions 24/7 cron workflow
├── src/
│   ├── config/                 # Search presets & scoring rules
│   ├── services/               # SerpApi, Firecrawl, OpenRouter & Telegram services
│   ├── utils/                  # CSV parser & deduplication helpers
│   └── index.ts                # Main CLI entry point
├── exported_domains.csv        # Historical deduplication storage
├── run-scraper.ps1             # Local Windows PowerShell runner script
├── package.json
├── tsconfig.json
└── .env.example


🚀 Quick Start & Local Setup
1. Prerequisites
Make sure you have Node.js (v20 or higher) installed on your machine.
2. Clone & Install Dependencies



Bash
git clone [https://github.com/your-username/devtool-lead-scraper.git](https://github.com/your-username/devtool-lead-scraper.git)
cd devtool-lead-scraper
npm install


3. Environment Configuration
Create a .env file in the root directory and populate your API credentials:



Code snippet
# Search Engine API
SERPAPI_KEY="your_serpapi_key"

# Web Scraping API
FIRECRAWL_KEY="your_firecrawl_api_key"

# AI Inference (OpenRouter)
OPENROUTER_KEY="your_openrouter_api_key"

# Telegram Notifications
TELEGRAM_BOT_TOKEN="123456789:ABCdefGHIjklMNOpqrsTUVwxyZ"
TELEGRAM_CHAT_ID="your_telegram_chat_id"


💻 Usage & CLI Presets
Run the CLI using npx tsx src/index.ts alongside your preferred search preset strategy and target limit.
Basic Command Structure



Bash
npx tsx src/index.ts --preset <PRESET_NAME> --limit <NUMBER_OF_LEADS>


Available Search Presets
Preset
Focus Area
ATS_HIRING
Scrapes Greenhouse, Lever, and Ashby boards for Technical Writers & DevRel roles.
AI_DEVTOOLS
Targets AI infrastructure, LLM APIs, Vector Databases, and RAG tooling.
AUTH_COMPETITORS
Targets Auth0/Clerk/Okta alternatives and Identity Management platforms.
BAAS_COMPETITORS
Targets Backend-as-a-Service, Firebase/Supabase/Appwrite alternatives.
CMS_COMPETITORS
Targets Headless CMS platforms and Content Infrastructure.

Execution Examples



Bash
# Run ATS hiring search with a limit of 15 leads
npx tsx src/index.ts --preset ATS_HIRING --limit 15

# Search AI DevTools space
npx tsx src/index.ts --preset AI_DEVTOOLS --limit 10


☁️ 24/7 Cloud Automation (GitHub Actions)
This repository includes a pre-configured GitHub Actions workflow (.github/workflows/scraper.yml) that executes automatically every midnight at 00:00 UTC.
Setting Up GitHub Actions
Push this repository to GitHub (ensure your .env file is in .gitignore).
Go to your repository Settings > Secrets and variables > Actions.
Add the following repository secrets matching your .env setup:
SERPAPI_KEY
FIRECRAWL_KEY
OPENROUTER_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
How It Works in the Cloud
The workflow initializes a clean Node.js container on GitHub's servers.
Runs configured presets (ATS_HIRING, AI_DEVTOOLS, etc.).
Evaluates leads and pushes high-intent matches to your Telegram.
Automatically commits and pushes updated exported_domains.csv files back to the repository using stefanzweifel/git-auto-commit-action so deduplication remains consistent across runs.
🖥️ Optional: Local Windows Scheduling
If you prefer to run the scraper locally on a Windows machine via Task Scheduler, use the included PowerShell script:
Update run-scraper.ps1 with your absolute project directory path.
Register the task in PowerShell (Admin):



PowerShell
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Path\To\devtool-lead-scraper\run-scraper.ps1""" -WorkingDirectory "C:\Path\To\devtool-lead-scraper"; $trigger = New-ScheduledTaskTrigger -Daily -At 12:00AM; Register-ScheduledTask -TaskName "DevTool Lead Scraper Midnight Run" -Action $action -Trigger$trigger


📄 Output Data & Deduplication
Historical Tracking: Domains discovered during each run are logged against exported_domains.csv. Subsequent runs skip previously scanned companies automatically.
Telegram Alerts: High-intent opportunities trigger a real-time card containing the company name, role link, intent score (0-100), and key reasoning highlights.
🤝 Contributing & Extending
Feel free to fork this repo and adapt it to your domain or outreach workflow!
To add new search strategies, extend the preset definitions in src/config/.
To adjust qualification parameters, update the system prompt fed into the OpenRouter evaluation module in src/services/.
📜 License
MIT License. Feel free to modify and build upon it!
