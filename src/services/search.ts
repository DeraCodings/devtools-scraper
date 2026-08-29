import { getJson } from "serpapi";
import { config } from "../config/env.js";
import { SearchResult } from "../types/index.js";
import { retryWithBackoff } from "../utils/rate-limiter.js";

/**
 * High-intent search query templates for target DevTool platforms
 */
export const TARGET_SEARCH_PRESETS = {
  ATS_HIRING: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("technical writer" OR "developer advocate" OR "devrel")',
  ],
  BAAS_COMPETITORS: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("BaaS" OR "backend as a service" OR "serverless database" OR "Firebase alternative") ("technical writer" OR "developer advocate" OR "devrel")',
  ],
  AUTH_COMPETITORS: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("authentication" OR "identity API" OR "SSO" OR "passkeys") ("technical writer" OR "developer advocate" OR "devrel")',
  ],
  CMS_COMPETITORS: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("headless CMS" OR "content infrastructure" OR "git-based CMS") ("technical writer" OR "developer advocate" OR "devrel")',
  ],
  AI_DEVTOOLS: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("AI developer tools" OR "LLM API" OR "vector database" OR "RAG") ("technical writer" OR "developer advocate" OR "devrel")',
  ],
  YC_STARTUPS: [
    'site:ycombinator.com/companies ("developer tools" OR "API" OR "infrastructure")',
  ],
  G2_CAPTERRA: [
    'site:g2.com/categories ("API Management" OR "Database" OR "DevOps")',
  ],
};

/**
 * Extracts clean domain name from a URL string
 */

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Executes a Google search via SerpApi with rate-limit retries
 */
export async function searchGoogle(
  query: string,
  numResults: number = 10,
): Promise<SearchResult[]> {
  console.log(`🔎 Executing SerpApi search: "${query}"`);

  const response = await retryWithBackoff(async () => {
    return await getJson({
      engine: "google",
      q: query,
      num: numResults,
      api_key: config.SERPAPI_API_KEY,
    });
  });

  const rawResults = response.organic_results || [];

  const results: SearchResult[] = rawResults.map((item: any) => ({
    title: item.title || "",
    link: item.link || "",
    snippet: item.snippet || "",
    domain: extractDomain(item.link || ""),
    sourceQuery: query,
  }));

  return results;
}

/**
 * Aggregates results across multiple targeted queries and removes duplicate domains
 */
export async function discoverTargets(
  queries: string[],
  resultsPerQuery: number = 5,
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  const seenDomains = new Set<string>();

  for (const query of queries) {
    try {
      const results = await searchGoogle(query, resultsPerQuery);

      for (const result of results) {
        // Exclude common noise domains
        const isExcluded = [
          "linkedin.com",
          "indeed.com",
          "glassdoor.com",
          "youtube.com",
        ].includes(result.domain);

        if (result.domain && !seenDomains.has(result.domain) && !isExcluded) {
          seenDomains.add(result.domain);
          allResults.push(result);
        }
      }
    } catch (err: any) {
      console.error(
        `⚠️ Skipping query "${query}" due to error: ${err.message}`,
      );
    }
  }

  console.log(`🎯 Discovered ${allResults.length} unique targets.`);
  return allResults;
}
