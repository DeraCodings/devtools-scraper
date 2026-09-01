import { Command } from "commander";
import { analyzeBatch } from "./services/analyser.js";
import { scrapeBatch, scrapePage } from "./services/scraper.js";
import {
  discoverTargets,
  extractDomain,
  TARGET_SEARCH_PRESETS,
} from "./services/search.js";
import {
  exportToCSV,
  exportToJSON,
  getHistoricalDomains,
} from "./storage/exporter.js";
import { Lead, ScrapedPage, SearchResult } from "./types/index.js";
// import { sendTelegramNotification } from "./services/notifier.js";
import { dispatchLeadsToEveAgent } from "./services/eveDispatcher.js"; // Import the helper function

const program = new Command();

program
  .name("devtool-scraper")
  .description(
    "Lightweight CLI tool to scrape and filter high-intent DevTool prospective leads",
  )
  .version("1.0.0");

// Make the action directly attached or handle `scrape` gracefully
const runScraper = async (options: any) => {
  console.log("\n🚀 Starting DevTool Lead Scraper CLI...\n");

  const limit = parseInt(options.limit || "5", 10);
  const searchTargets: SearchResult[] = [];
  const directPages: ScrapedPage[] = [];

  // Load existing domains from past CSV runs
  const knownDomains = await getHistoricalDomains();

  // Step 1: Identify targets
  if (options.preset) {
    const presetKey =
      options.preset.toUpperCase() as keyof typeof TARGET_SEARCH_PRESETS;
    const queries = TARGET_SEARCH_PRESETS[presetKey];

    if (!queries) {
      console.error(
        `❌ Invalid preset "${options.preset}". Valid options: ATS_HIRING, YC_STARTUPS, G2_CAPTERRA`,
      );
      process.exit(1);
    }

    console.log(`🔍 Running preset search strategy: ${presetKey}`);
    const discovered = await discoverTargets([...queries], limit);
    searchTargets.push(...discovered);
  } else if (options.query) {
    console.log(`🔍 Running custom search query: "${options.query}"`);
    const discovered = await discoverTargets([options.query], limit);
    searchTargets.push(...discovered);
  } else if (options.urls && options.urls.length > 0) {
    console.log(`🌐 Processing ${options.urls.length} direct target URLs...`);
    for (const url of options.urls) {
      const domain = extractDomain(url);
      if (knownDomains.has(domain.toLowerCase())) {
        console.log(
          `⏩ Skipping direct URL ${url}: Domain "${domain}" already in past CSV exports.`,
        );
        continue;
      }
      const scraped = await scrapePage(url, domain);
      if (scraped) directPages.push(scraped);
    }
  } else {
    console.error(
      "❌ Please specify a search target using --preset, --query, or --urls.",
    );
    process.exit(1);
  }

  // Filter out targets already in past CSV exports
  const newTargets = searchTargets.filter((target) => {
    const isKnown = knownDomains.has(target.domain.toLowerCase());
    if (isKnown) {
      console.log(
        `⏩ Skipping target "${target.domain}": Previously exported in past CSV.`,
      );
    }
    return !isKnown;
  });

  console.log(
    `🎯 ${newTargets.length} new targets remaining after historical deduplication.`,
  );

  // Step 2: Scrape targets
  let scrapedPages: ScrapedPage[] = [...directPages];
  if (newTargets.length > 0) {
    const freshlyScraped = await scrapeBatch(newTargets, 2, 2000);
    scrapedPages.push(...freshlyScraped);
  }

  if (scrapedPages.length === 0) {
    console.log("⚠️ No new readable web pages to process. Exiting.");
    return;
  }

  // Step 3: Analyze and qualify via OpenRouter LLM
  const qualifiedLeads: Lead[] = await analyzeBatch(scrapedPages);

  if (qualifiedLeads.length === 0) {
    console.log(
      "ℹ️ No new leads met the high-intent qualification threshold during this run.",
    );
    return;
  }

  // Step 4: Export qualified leads to local files
  const format = (options.format || "both").toLowerCase();
  if (format === "json" || format === "both") {
    await exportToJSON(qualifiedLeads);
  }
  if (format === "csv" || format === "both") {
    await exportToCSV(qualifiedLeads);
  }

  // await sendTelegramNotification(qualifiedLeads);

  // Step 5: Dispatch qualified lead URLs to Eve Agent Webhook
  // const leadUrls = qualifiedLeads
  //   .map((lead) => lead.sourceUrl || (lead as any).website)
  //   .filter(Boolean);

  // if (leadUrls.length > 0) {
  //   console.log(
  //     `📡 Dispatching ${leadUrls.length} qualified leads to Eve Agent...`,
  //   );
  //   await dispatchLeadsToEveAgent(leadUrls);
  // }

  // Step 5: Dispatch qualified leads to Eve Agent (handles research + unified Telegram notification)
  if (qualifiedLeads.length > 0) {
    console.log(
      `📡 Dispatching ${qualifiedLeads.length} qualified lead(s) to Eve Agent for research...`,
    );
    await dispatchLeadsToEveAgent(qualifiedLeads);
  }

  console.log(
    `\n🎉 Pipeline completed successfully! Found ${qualifiedLeads.length} new qualified leads.\n`,
  );
};

program
  .command("scrape", { isDefault: true })
  .description("Scrape and qualify high-intent DevTool prospects")
  .option(
    "-p, --preset <preset>",
    "Search preset: ATS_HIRING, BAAS_COMPETITORS, AUTH_COMPETITORS, CMS_COMPETITORS, AI_DEVTOOLS, YC_STARTUPS, G2_CAPTERRA",
  )
  .option("-q, --query <query>", "Custom search query string")
  .option(
    "-u, --urls <urls...>",
    "Direct list of target URLs to scrape directly",
  )
  .option("-l, --limit <number>", "Max search results per query", "5")
  .option("-f, --format <format>", "Export format: json, csv, or both", "both")
  .action(runScraper);

program.parse(process.argv);
