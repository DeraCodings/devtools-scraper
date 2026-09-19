import { Command } from "commander";
import { isEnterpriseBlocked } from "./config/enterprise-blocklist.js";
import { analyzeBatch } from "./services/analyser.js";
import { dispatchLeadsToEveAgent } from "./services/eveDispatcher.js";
import { scrapeBatch, scrapePage } from "./services/scraper.js";
import {
  discoverTargets,
  parseUrlTarget,
  TARGET_SEARCH_PRESETS,
} from "./services/search.js";
import {
  exportToCSV,
  exportToJSON,
  getHistoricalDomains,
} from "./storage/exporter.js";
import { isLeadOrCompanyKnown } from "./storage/registry.js";
import { Lead, ScrapedPage, SearchResult } from "./types/index.js";

const program = new Command();

program
  .name("devtool-scraper")
  .description(
    "Intelligent CLI lead discovery pipeline for technical content writers and DevRel consultants",
  )
  .version("2.0.0");

const runScraper = async (options: any) => {
  console.log("\n🚀 Starting DevTool Lead Scraper CLI v2.0...\n");

  const limit = parseInt(options.limit || "5", 10);
  const searchTargets: SearchResult[] = [];
  const directPages: ScrapedPage[] = [];

  // Load existing domains & slugs from past exports & central registry
  const knownDomains = await getHistoricalDomains();

  // Step 1: Identify targets
  if (options.preset) {
    const presetKey =
      options.preset.toUpperCase() as keyof typeof TARGET_SEARCH_PRESETS;
    const queries = TARGET_SEARCH_PRESETS[presetKey];

    if (!queries) {
      console.error(
        `❌ Invalid preset "${options.preset}". Valid options:\n` +
          Object.keys(TARGET_SEARCH_PRESETS)
            .map((k) => `   • ${k}`)
            .join("\n"),
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
      const { domain, companySlug } = parseUrlTarget(url);

      if (isEnterpriseBlocked(companySlug) || isEnterpriseBlocked(domain)) {
        console.log(
          `🚫 Skipping direct URL ${url}: Enterprise blocklist matched (${companySlug || domain}).`,
        );
        continue;
      }

      const knownCheck = await isLeadOrCompanyKnown({
        companySlug,
        domain,
        jobUrl: url,
      });

      if (
        knownDomains.has(companySlug.toLowerCase()) ||
        knownDomains.has(domain.toLowerCase()) ||
        knownCheck.isKnown
      ) {
        console.log(
          `⏩ Skipping direct URL ${url}: "${companySlug || domain}" already in history.`,
        );
        continue;
      }

      const scraped = await scrapePage(url, domain, companySlug);
      if (scraped) directPages.push(scraped);
    }
  } else {
    console.error(
      "❌ Please specify a search target using --preset, --query, or --urls.",
    );
    process.exit(1);
  }

  // Filter out targets already known in registry or past exports
  const newTargets: SearchResult[] = [];
  for (const target of searchTargets) {
    const isKnownHistorical =
      knownDomains.has(target.companySlug.toLowerCase()) ||
      knownDomains.has(target.domain.toLowerCase());

    const knownCheck = await isLeadOrCompanyKnown({
      companySlug: target.companySlug,
      jobUrl: target.link,
      domain: target.domain,
    });

    if (isKnownHistorical || knownCheck.isKnown) {
      console.log(
        `⏩ Skipping target "${target.companySlug || target.domain}": ${knownCheck.reason || "Present in past CSV exports."}`,
      );
    } else {
      newTargets.push(target);
    }
  }

  console.log(
    `🎯 ${newTargets.length} new qualified targets remaining after historical deduplication.`,
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

  // Step 4: Export qualified leads to local files (with automatic append/merge)
  const format = (options.format || "both").toLowerCase();
  if (format === "json" || format === "both") {
    await exportToJSON(qualifiedLeads);
  }
  if (format === "csv" || format === "both") {
    await exportToCSV(qualifiedLeads);
  }

  // Step 5: Dispatch qualified leads to Eve Agent (handles research + unified Telegram notification)
  if (qualifiedLeads.length > 0) {
    console.log(
      `📡 Dispatching ${qualifiedLeads.length} qualified lead(s) to Eve Agent for research & alerting...`,
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
    "Search preset: ATS_HIRING, DEVREL_HIRING, WRITERS_PROGRAMS, STARTUP_BOARDS, FREELANCE_REMOTE_BOARDS, SOCIAL_HIRING, AI_DEVTOOLS, BAAS_COMPETITORS, AUTH_COMPETITORS, CMS_COMPETITORS",
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

