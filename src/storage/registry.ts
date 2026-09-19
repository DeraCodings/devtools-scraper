import fs from "node:fs/promises";
import path from "node:path";
import { normalizeCompanyKey } from "../config/enterprise-blocklist.js";
import { Lead } from "../types/index.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const REGISTRY_FILE = path.join(DATA_DIR, "leads_registry.json");

export interface RegistryCompanyRecord {
  companyName: string;
  companySlug: string;
  domain: string;
  canonicalWebsite?: string;
  discoveredAt: string;
  lastSeenAt: string;
  jobUrls: string[];
  intentScore: number;
  leadType?: string;
}

export interface LeadsRegistry {
  version: number;
  lastUpdated: string;
  companies: Record<string, RegistryCompanyRecord>;
  seenJobUrls: Record<string, string>; // normalized job url -> normalized company key
}

let cachedRegistry: LeadsRegistry | null = null;

/**
 * Normalizes a URL for deduplication checking (stripping tracking query params, hashes, trailing slashes)
 */
export function normalizeJobUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    // Remove UTM and tracking params
    const searchParams = new URLSearchParams(parsed.search);
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "source",
      "gh_src",
    ];
    for (const p of trackingParams) {
      searchParams.delete(p);
    }
    const cleanSearch = searchParams.toString();
    const cleanPath = parsed.pathname.replace(/\/+$/, "");
    return `${parsed.protocol}//${parsed.hostname}${cleanPath}${cleanSearch ? "?" + cleanSearch : ""}`.toLowerCase();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Ensures the data directory exists
 */
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error: any) {
    console.error(`❌ Failed to create data directory:`, error.message);
  }
}

/**
 * Loads the persistent registry from disk, caching in memory
 */
export async function loadRegistry(): Promise<LeadsRegistry> {
  if (cachedRegistry) return cachedRegistry;

  await ensureDataDir();

  try {
    const raw = await fs.readFile(REGISTRY_FILE, "utf-8");
    cachedRegistry = JSON.parse(raw) as LeadsRegistry;
    return cachedRegistry;
  } catch (err: any) {
    // File doesn't exist yet or is invalid, initialize fresh registry
    const initialRegistry: LeadsRegistry = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      companies: {},
      seenJobUrls: {},
    };
    cachedRegistry = initialRegistry;
    await saveRegistry(initialRegistry);
    return initialRegistry;
  }
}

/**
 * Persists the registry to disk
 */
export async function saveRegistry(registry: LeadsRegistry): Promise<void> {
  await ensureDataDir();
  registry.lastUpdated = new Date().toISOString();
  cachedRegistry = registry;
  try {
    await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf-8");
  } catch (error: any) {
    console.error(`❌ Failed to save leads registry:`, error.message);
  }
}

/**
 * Checks if a company slug, company name, or direct job posting URL is already known
 */
export async function isLeadOrCompanyKnown(params: {
  companySlug?: string;
  companyName?: string;
  jobUrl?: string;
  domain?: string;
}): Promise<{ isKnown: boolean; reason?: string }> {
  const registry = await loadRegistry();

  // 1. Check exact job URL match
  if (params.jobUrl) {
    const normalizedUrl = normalizeJobUrl(params.jobUrl);
    if (registry.seenJobUrls[normalizedUrl]) {
      return {
        isKnown: true,
        reason: `Job URL already seen in past run: ${params.jobUrl}`,
      };
    }
  }

  // 2. Check company slug match
  if (params.companySlug) {
    const normalizedSlug = normalizeCompanyKey(params.companySlug);
    if (registry.companies[normalizedSlug]) {
      return {
        isKnown: true,
        reason: `Company slug "${params.companySlug}" already logged in registry.`,
      };
    }
  }

  // 3. Check normalized company name
  if (params.companyName) {
    const normalizedName = normalizeCompanyKey(params.companyName);
    if (registry.companies[normalizedName]) {
      return {
        isKnown: true,
        reason: `Company name "${params.companyName}" already logged in registry.`,
      };
    }
  }

  // 4. Check domain if not generic ATS
  if (params.domain) {
    const genericHosts = [
      "greenhouse.io",
      "lever.co",
      "ashbyhq.com",
      "workable.com",
      "ycombinator.com",
      "g2.com",
      "wellfound.com",
      "linkedin.com",
      "x.com",
      "twitter.com",
    ];
    const isGeneric = genericHosts.some((h) => params.domain?.includes(h));
    if (!isGeneric) {
      const normalizedDomain = normalizeCompanyKey(params.domain);
      if (registry.companies[normalizedDomain]) {
        return {
          isKnown: true,
          reason: `Company domain "${params.domain}" already logged in registry.`,
        };
      }
    }
  }

  return { isKnown: false };
}

/**
 * Records a discovered, qualified lead into the persistent registry
 */
export async function recordLeadInRegistry(lead: Lead): Promise<void> {
  const registry = await loadRegistry();

  const primaryKey =
    normalizeCompanyKey(lead.companySlug) ||
    normalizeCompanyKey(lead.companyName) ||
    normalizeCompanyKey(lead.domain);

  const cleanJobUrl = lead.jobPostingUrl
    ? normalizeJobUrl(lead.jobPostingUrl)
    : normalizeJobUrl(lead.sourceUrl);

  const existing = registry.companies[primaryKey];

  if (existing) {
    existing.lastSeenAt = new Date().toISOString();
    if (cleanJobUrl && !existing.jobUrls.includes(cleanJobUrl)) {
      existing.jobUrls.push(cleanJobUrl);
    }
    if (lead.companyWebsite && !existing.canonicalWebsite) {
      existing.canonicalWebsite = lead.companyWebsite;
    }
  } else {
    registry.companies[primaryKey] = {
      companyName: lead.companyName,
      companySlug: lead.companySlug || primaryKey,
      domain: lead.domain,
      canonicalWebsite: lead.companyWebsite,
      discoveredAt: lead.discoveredAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      jobUrls: cleanJobUrl ? [cleanJobUrl] : [],
      intentScore: lead.intentScore,
      leadType: lead.leadType,
    };
  }

  if (cleanJobUrl) {
    registry.seenJobUrls[cleanJobUrl] = primaryKey;
  }

  await saveRegistry(registry);
}
