import { createObjectCsvWriter } from "csv-writer";
import fs from "node:fs/promises";
import path from "node:path";
import { Lead } from "../types/index.js";
import {
  loadRegistry,
  normalizeJobUrl,
  recordLeadInRegistry,
} from "./registry.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");
const DATA_DIR = path.resolve(process.cwd(), "data");

/**
 * Reads all existing CSV files in the output directory and persistent registry
 * to collect previously discovered domain and slug names.
 */
export async function getHistoricalDomains(): Promise<Set<string>> {
  await ensureOutputDir();
  const historicalKeys = new Set<string>();

  // 1. Load keys from the persistent registry
  try {
    const registry = await loadRegistry();
    for (const [key, comp] of Object.entries(registry.companies)) {
      historicalKeys.add(key.toLowerCase());
      if (comp.companySlug) historicalKeys.add(comp.companySlug.toLowerCase());
      if (comp.domain) historicalKeys.add(comp.domain.toLowerCase());
      if (comp.companyName) historicalKeys.add(comp.companyName.toLowerCase());
    }
  } catch (err: any) {
    console.warn(`⚠️ Could not load historical registry: ${err.message}`);
  }

  // 2. Load from past CSV exports in output/
  try {
    const files = await fs.readdir(OUTPUT_DIR);
    const csvFiles = files.filter((f) => f.endsWith(".csv"));

    for (const file of csvFiles) {
      const filePath = path.join(OUTPUT_DIR, file);
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      if (lines.length < 2) continue;

      const headers = lines[0]
        .split(",")
        .map((h) => h.replace(/"/g, "").trim().toLowerCase());

      const domainIdx = headers.indexOf("domain");
      const slugIdx = headers.indexOf("company slug");
      const nameIdx = headers.indexOf("company name");

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(",");
        if (domainIdx !== -1 && cols[domainIdx]) {
          historicalKeys.add(cols[domainIdx].replace(/"/g, "").trim().toLowerCase());
        }
        if (slugIdx !== -1 && cols[slugIdx]) {
          historicalKeys.add(cols[slugIdx].replace(/"/g, "").trim().toLowerCase());
        }
        if (nameIdx !== -1 && cols[nameIdx]) {
          historicalKeys.add(cols[nameIdx].replace(/"/g, "").trim().toLowerCase());
        }
      }
    }
  } catch (error: any) {
    console.warn(`⚠️ Could not read historical CSV exports: ${error.message}`);
  }

  if (historicalKeys.size > 0) {
    console.log(
      `📜 Loaded ${historicalKeys.size} previously saved identifiers from persistent registry & past CSVs.`,
    );
  }

  return historicalKeys;
}

/**
 * Ensures output & data directories exist on disk before writing files
 */
async function ensureOutputDir(): Promise<void> {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error: any) {
    console.error(`❌ Failed to create output/data directory:`, error.message);
  }
}

/**
 * Returns a standardized date string for filenames (e.g., 2026-08-23)
 */
function getDateStamp(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Exports qualified leads to a local JSON file (merging with existing day's leads)
 */
export async function exportToJSON(
  leads: Lead[],
  filename?: string,
): Promise<string> {
  await ensureOutputDir();
  const file = filename || `leads_${getDateStamp()}.json`;
  const filePath = path.join(OUTPUT_DIR, file);

  try {
    let existingLeads: Lead[] = [];
    try {
      const currentContent = await fs.readFile(filePath, "utf-8");
      existingLeads = JSON.parse(currentContent);
    } catch {
      // File doesn't exist yet, start fresh
      existingLeads = [];
    }

    // Merge without duplicates based on job URL or company slug
    const seenUrls = new Set(
      existingLeads.map((l) => normalizeJobUrl(l.jobPostingUrl || l.sourceUrl)),
    );

    for (const lead of leads) {
      const url = normalizeJobUrl(lead.jobPostingUrl || lead.sourceUrl);
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        existingLeads.push(lead);
      }
      // Record in central registry
      await recordLeadInRegistry(lead);
    }

    await fs.writeFile(
      filePath,
      JSON.stringify(existingLeads, null, 2),
      "utf-8",
    );
    console.log(
      `💾 Successfully exported/merged ${existingLeads.length} total leads to JSON: ${filePath}`,
    );
    return filePath;
  } catch (error: any) {
    console.error(`❌ JSON export failed:`, error.message);
    throw error;
  }
}

const CSV_HEADERS = [
  { id: "companyName", title: "Company Name" },
  { id: "leadType", title: "Lead Type" },
  { id: "intentScore", title: "Intent Score (0-100)" },
  { id: "jobPostingUrl", title: "Direct Job / Program Link" },
  { id: "companyWebsite", title: "Company Website" },
  { id: "companySlug", title: "Company Slug" },
  { id: "domain", title: "Domain" },
  { id: "hiringSignal", title: "Hiring Signal" },
  { id: "activeRoles", title: "Active Hiring Roles" },
  { id: "fundingSignal", title: "Funding Signal" },
  { id: "fundingStage", title: "Funding Stage" },
  { id: "contentPainPoints", title: "Content Pain Points" },
  { id: "summaryReasoning", title: "AI Summary / Reasoning" },
  { id: "outreachAngle", title: "Outreach Angle" },
  { id: "sourceUrl", title: "Source URL" },
  { id: "discoveredAt", title: "Discovered Date" },
];

/**
 * Exports qualified leads to a clean, spreadsheet-ready CSV file
 * (merging with existing day's CSV to prevent preset overwrite)
 */
export async function exportToCSV(
  leads: Lead[],
  filename?: string,
): Promise<string> {
  await ensureOutputDir();
  const file = filename || `leads_${getDateStamp()}.csv`;
  const filePath = path.join(OUTPUT_DIR, file);
  const consolidatedPath = path.join(DATA_DIR, "consolidated_leads.csv");

  // Read existing daily JSON if available to get full merged set
  const jsonDailyPath = path.join(OUTPUT_DIR, `leads_${getDateStamp()}.json`);
  let allLeads: Lead[] = [...leads];

  try {
    const raw = await fs.readFile(jsonDailyPath, "utf-8");
    const jsonLeads: Lead[] = JSON.parse(raw);
    const seenUrls = new Set(
      allLeads.map((l) => normalizeJobUrl(l.jobPostingUrl || l.sourceUrl)),
    );
    for (const jl of jsonLeads) {
      const url = normalizeJobUrl(jl.jobPostingUrl || jl.sourceUrl);
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        allLeads.push(jl);
      }
    }
  } catch {
    // No daily json yet, continue with provided leads
  }

  const formatRecord = (lead: Lead) => ({
    companyName: lead.companyName || "N/A",
    leadType: lead.leadType || "JOB_POSTING",
    intentScore: lead.intentScore,
    jobPostingUrl: lead.jobPostingUrl || lead.sourceUrl || "N/A",
    companyWebsite: lead.companyWebsite || "N/A",
    companySlug: lead.companySlug || "N/A",
    domain: lead.domain || "N/A",
    hiringSignal: lead.hiringSignal,
    activeRoles: Array.isArray(lead.activeRoles)
      ? lead.activeRoles.join(" | ")
      : "",
    fundingSignal: lead.fundingSignal,
    fundingStage: lead.fundingStage || "N/A",
    contentPainPoints: Array.isArray(lead.contentPainPoints)
      ? lead.contentPainPoints.join(" | ")
      : "",
    summaryReasoning: lead.summaryReasoning || "N/A",
    outreachAngle: lead.outreachAngle || "N/A",
    sourceUrl: lead.sourceUrl || "N/A",
    discoveredAt: lead.discoveredAt,
  });

  const formattedRecords = allLeads.map(formatRecord);

  try {
    // Write daily CSV
    const dailyCsvWriter = createObjectCsvWriter({
      path: filePath,
      header: CSV_HEADERS,
      append: false,
    });
    await dailyCsvWriter.writeRecords(formattedRecords);

    // Also update persistent consolidated CSV in data/
    const consolidatedCsvWriter = createObjectCsvWriter({
      path: consolidatedPath,
      header: CSV_HEADERS,
      append: false,
    });
    await consolidatedCsvWriter.writeRecords(formattedRecords);

    // Record in central registry
    for (const lead of leads) {
      await recordLeadInRegistry(lead);
    }

    console.log(
      `📊 Successfully exported ${allLeads.length} total leads to CSV: ${filePath}`,
    );
    return filePath;
  } catch (error: any) {
    console.error(`❌ CSV export failed:`, error.message);
    throw error;
  }
}

