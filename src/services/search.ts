import { getJson } from "serpapi";
import { config } from "../config/env.js";
import { isEnterpriseBlocked } from "../config/enterprise-blocklist.js";
import { SearchResult } from "../types/index.js";
import { retryWithBackoff } from "../utils/rate-limiter.js";

/**
 * High-intent search query templates for target DevTool platforms and channels
 */
export const TARGET_SEARCH_PRESETS = {
  // ATS boards for technical writers and DevRel (Greenhouse, Lever, Ashby, Workable)
  ATS_HIRING: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com OR site:apply.workable.com ("technical writer" OR "developer advocate" OR "devrel") -microsoft -google -amazon -salesforce -oracle -palantir',
  ],

  // DevRel specific hiring (Hypothesis: DevRel hiring = immediate demand for tech content & documentation)
  DEVREL_HIRING: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("Head of DevRel" OR "Developer Relations" OR "Developer Advocate" OR "DevRel Manager") ("API" OR "SDK" OR "developer tools" OR "infrastructure") -microsoft -google -amazon -salesforce -oracle -palantir',
  ],

  // DevTool Paid Writers Programs ($200-$800/article paid guest writer programs)
  WRITERS_PROGRAMS: [
    '("write for us" OR "writers program" OR "guest author program" OR "paid technical writing" OR "get paid to write") ("developer" OR "DevOps" OR "Kubernetes" OR "API" OR "Python" OR "Golang" OR "database" OR "cloud") -site:medium.com -site:linkedin.com -inurl:tag -inurl:category -inurl:author',
    '("technical writer program" OR "community writers program" OR "contribute an article") ("developer tools" OR "infrastructure" OR "open source") -site:medium.com',
  ],

  // Startup ecosystems: Wellfound (AngelList) and YC Work at a Startup
  STARTUP_BOARDS: [
    'site:wellfound.com/jobs ("technical writer" OR "developer advocate" OR "devrel") ("developer tools" OR "infrastructure" OR "API" OR "AI")',
    'site:workatastartup.com/jobs ("technical writer" OR "developer advocate" OR "devrel")',
  ],

  // Remote & Freelance Job Boards (ProBlogger, WeWorkRemotely, RemoteOK)
  FREELANCE_REMOTE_BOARDS: [
    'site:problogger.com/jobs ("technical" OR "developer" OR "software" OR "API" OR "coding")',
    '(site:weworkremotely.com OR site:remoteok.com OR site:himalayas.app) ("technical writer" OR "developer advocate") ("API" OR "developer" OR "SaaS")',
  ],

  // Social Hiring Calls (Founders & DevRel heads hiring on X and LinkedIn)
  SOCIAL_HIRING: [
    'site:linkedin.com/posts ("looking for a freelance technical writer" OR "hiring freelance technical writer" OR "need a technical writer for our DevTool")',
    'site:x.com ("freelance technical writer" OR "hiring a technical writer" OR "looking for a technical writer") ("API" OR "developer" OR "DevTool" OR "docs")',
  ],

  // AI Developer Tools & LLM Infrastructure
  AI_DEVTOOLS: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("AI developer tools" OR "LLM API" OR "vector database" OR "RAG") ("technical writer" OR "developer advocate" OR "devrel") -microsoft -google -amazon -palantir -salesforce',
  ],

  // Backend-as-a-Service, Modern Databases & Serverless
  BAAS_COMPETITORS: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("BaaS" OR "backend as a service" OR "serverless database" OR "Firebase alternative") ("technical writer" OR "developer advocate" OR "devrel") -microsoft -google -amazon -oracle',
  ],

  // Modern Auth Providers & Identity APIs
  AUTH_COMPETITORS: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("authentication" OR "identity API" OR "SSO" OR "passkeys") ("technical writer" OR "developer advocate" OR "devrel") -microsoft -google -amazon -okta',
  ],

  // Headless CMS & Content Infrastructure
  CMS_COMPETITORS: [
    'site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com ("headless CMS" OR "content infrastructure" OR "git-based CMS") ("technical writer" OR "developer advocate" OR "devrel") -microsoft -google -kontent -adobe',
  ],
};

/**
 * Extracts clean domain name from a URL string
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export interface ParsedTarget {
  domain: string;
  companySlug: string;
  platform: string;
}

/**
 * Intelligent URL parser that extracts the real company slug from ATS and job platforms
 */
export function parseUrlTarget(url: string): ParsedTarget {
  const domain = extractDomain(url);
  let companySlug = "";
  let platform = "direct";

  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);

    // Greenhouse: boards.greenhouse.io/<company>/jobs/<id> OR boards.greenhouse.io/<company>
    if (domain.includes("greenhouse.io")) {
      platform = "greenhouse";
      companySlug = pathSegments[0] || "";
    }
    // Lever: jobs.lever.co/<company>/<id> OR jobs.lever.co/<company>
    else if (domain.includes("lever.co")) {
      platform = "lever";
      companySlug = pathSegments[0] || "";
    }
    // Ashby: jobs.ashbyhq.com/<company>/<id> OR jobs.ashbyhq.com/<company>
    else if (domain.includes("ashbyhq.com")) {
      platform = "ashby";
      companySlug = pathSegments[0] || "";
    }
    // Workable: apply.workable.com/<company>/j/<id> OR apply.workable.com/<company>
    else if (domain.includes("workable.com")) {
      platform = "workable";
      companySlug = pathSegments[0] || "";
    }
    // Personio: <company>.jobs.personio.de OR jobs.personio.de/<company>
    else if (domain.includes("personio.")) {
      platform = "personio";
      const sub = domain.split(".")[0];
      companySlug = sub !== "jobs" ? sub : pathSegments[0] || "";
    }
    // Wellfound: wellfound.com/company/<company>/jobs
    else if (domain.includes("wellfound.com")) {
      platform = "wellfound";
      if (pathSegments[0] === "company" && pathSegments[1]) {
        companySlug = pathSegments[1];
      }
    }
    // Work at a Startup: workatastartup.com/companies/<company>
    else if (domain.includes("workatastartup.com")) {
      platform = "workatastartup";
      if (pathSegments[0] === "companies" && pathSegments[1]) {
        companySlug = pathSegments[1];
      }
    }
    // ProBlogger: problogger.com/jobs/candidate/job/<id>/<title>
    else if (domain.includes("problogger.com")) {
      platform = "problogger";
      companySlug = pathSegments[pathSegments.length - 1] || "problogger";
    }
    // Direct company website (e.g., supabase.com/careers)
    else {
      platform = "direct";
      const parts = domain.split(".");
      companySlug = parts.length > 2 ? parts[parts.length - 2] : parts[0];
    }
  } catch {
    companySlug = domain.split(".")[0];
  }

  // Clean company slug of punctuation
  companySlug = companySlug.toLowerCase().replace(/[^a-z0-9_-]/g, "");

  return { domain, companySlug, platform };
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

  const results: SearchResult[] = rawResults.map((item: any) => {
    const link = item.link || "";
    const { domain, companySlug, platform } = parseUrlTarget(link);

    return {
      title: item.title || "",
      link,
      snippet: item.snippet || "",
      domain,
      companySlug,
      platform,
      sourceQuery: query,
    };
  });

  return results;
}

/**
 * Aggregates results across multiple targeted queries, filters enterprise giants,
 * and removes duplicates based on real company slug / domain
 */
export async function discoverTargets(
  queries: string[],
  resultsPerQuery: number = 5,
): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  const seenCompanyKeys = new Set<string>();

  for (const query of queries) {
    try {
      const results = await searchGoogle(query, resultsPerQuery);

      for (const result of results) {
        // Exclude common search noise domains
        const isNoiseDomain = [
          "indeed.com",
          "glassdoor.com",
          "youtube.com",
          "wikipedia.org",
          "reddit.com",
        ].some((noise) => result.domain.includes(noise));

        if (isNoiseDomain) continue;

        // Enterprise Blocklist Check: Drop mega-enterprises immediately
        if (
          isEnterpriseBlocked(result.companySlug) ||
          isEnterpriseBlocked(result.domain) ||
          isEnterpriseBlocked(result.title)
        ) {
          console.log(
            `🚫 Enterprise Blocklist Skip: "${result.companySlug || result.domain}" (${result.title})`,
          );
          continue;
        }

        // Deduplicate using company slug or domain
        const uniqueKey = (result.companySlug || result.domain).toLowerCase();

        if (uniqueKey && !seenCompanyKeys.has(uniqueKey)) {
          seenCompanyKeys.add(uniqueKey);
          allResults.push(result);
        } else {
          console.log(
            `⏩ Skipping duplicate company in current search batch: "${uniqueKey}"`,
          );
        }
      }
    } catch (err: any) {
      console.error(
        `⚠️ Skipping query "${query}" due to error: ${err.message}`,
      );
    }
  }

  console.log(`🎯 Discovered ${allResults.length} unique qualified targets.`);
  return allResults;
}

