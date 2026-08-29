import { createObjectCsvWriter } from "csv-writer";
import fs from "node:fs/promises";
import path from "node:path";
import { Lead } from "../types/index.js";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");

/**
 * Reads all existing CSV files in the output directory and collects
 * previously discovered domain names to avoid duplicate processing.
 */
export async function getHistoricalDomains(): Promise<Set<string>> {
  await ensureOutputDir();
  const historicalDomains = new Set<string>();

  try {
    const files = await fs.readdir(OUTPUT_DIR);
    const csvFiles = files.filter((f) => f.endsWith(".csv"));

    for (const file of csvFiles) {
      const filePath = path.join(OUTPUT_DIR, file);
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");

      if (lines.length < 2) continue; // Skip empty files or header-only files

      // Find the index of the Domain column from header
      const headers = lines[0]
        .split(",")
        .map((h) => h.replace(/"/g, "").trim());
      const domainIndex = headers.findIndex(
        (h) => h.toLowerCase() === "domain",
      );

      if (domainIndex === -1) continue;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Extract domain value from matching column index
        const columns = line.split(",");
        const rawDomain = columns[domainIndex]?.replace(/"/g, "").trim();

        if (rawDomain) {
          historicalDomains.add(rawDomain.toLowerCase());
        }
      }
    }

    if (historicalDomains.size > 0) {
      console.log(
        `📜 Loaded ${historicalDomains.size} previously saved domains from past CSV exports.`,
      );
    }
  } catch (error: any) {
    console.warn(`⚠️ Could not read historical CSV exports: ${error.message}`);
  }

  return historicalDomains;
}

/**
 * Ensures the output directory exists on disk before writing files
 */
async function ensureOutputDir(): Promise<void> {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (error: any) {
    console.error(`❌ Failed to create output directory:`, error.message);
  }
}

/**
 * Returns a standardized date string for filenames (e.g., 2026-08-23)
 */
function getDateStamp(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Exports qualified leads to a local JSON file
 */
export async function exportToJSON(
  leads: Lead[],
  filename?: string,
): Promise<string> {
  await ensureOutputDir();
  const file = filename || `leads_${getDateStamp()}.json`;
  const filePath = path.join(OUTPUT_DIR, file);

  try {
    await fs.writeFile(filePath, JSON.stringify(leads, null, 2), "utf-8");
    console.log(
      `💾 Successfully exported ${leads.length} leads to JSON: ${filePath}`,
    );
    return filePath;
  } catch (error: any) {
    console.error(`❌ JSON export failed:`, error.message);
    throw error;
  }
}

/**
 * Exports qualified leads to a clean, spreadsheet-ready CSV file
 */
export async function exportToCSV(
  leads: Lead[],
  filename?: string,
): Promise<string> {
  await ensureOutputDir();
  const file = filename || `leads_${getDateStamp()}.csv`;
  const filePath = path.join(OUTPUT_DIR, file);

  const csvWriter = createObjectCsvWriter({
    path: filePath,
    header: [
      { id: "companyName", title: "Company Name" },
      { id: "intentScore", title: "Intent Score (0-100)" },
      { id: "domain", title: "Domain" },
      { id: "hiringSignal", title: "Hiring Signal" },
      { id: "activeRoles", title: "Active Hiring Roles" },
      { id: "fundingSignal", title: "Funding Signal" },
      { id: "fundingStage", title: "Funding Stage" },
      { id: "contentPainPoints", title: "Content Pain Points" },
      { id: "summaryReasoning", title: "AI Summary / Reasoning" },
      { id: "sourceUrl", title: "Source URL" },
      { id: "discoveredAt", title: "Discovered Date" },
    ],
  });

  const formattedRecords = leads.map((lead) => ({
    ...lead,
    activeRoles: Array.isArray(lead.activeRoles)
      ? lead.activeRoles.join(" | ")
      : "",
    contentPainPoints: Array.isArray(lead.contentPainPoints)
      ? lead.contentPainPoints.join(" | ")
      : "",
    fundingStage: lead.fundingStage || "N/A",
  }));

  try {
    await csvWriter.writeRecords(formattedRecords);
    console.log(
      `📊 Successfully exported ${leads.length} leads to CSV: ${filePath}`,
    );
    return filePath;
  } catch (error: any) {
    console.error(`❌ CSV export failed:`, error.message);
    throw error;
  }
}
