import { config } from "../config/env.js";
import { isEnterpriseBlocked } from "../config/enterprise-blocklist.js";
import { Lead, LeadAnalysis, ScrapedPage } from "../types/index.js";
import { retryWithBackoff } from "../utils/rate-limiter.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * System prompt defining lead qualifying criteria for technical content writing
 */
const SYSTEM_PROMPT = `
You are an expert DevTool Lead Qualifier for an elite technical content writing consultancy.
Your task is to analyze scraped website Markdown content and determine if the target company is an actionable, high-intent prospective client.

OUR CLIENT PROFILE:
We are an external technical writing consultancy and developer content studio. We write high-quality technical blog posts, API integration tutorials, documentation, and SDK quickstarts for developer tools and startups.

TARGET ICP (SWEET SPOT):
- DevTool, API, Cloud Infrastructure, Developer Experience (DX), Databases, AI DevTools, Observability, DevOps, BaaS, Auth.
- Company Stage: Seed, Series A, Series B, Series C, or agile bootstrapped startups (5 to 300 employees).

CRITICAL DISQUALIFICATION RULES:
1. MEGA-ENTERPRISES & GIANTS (STRICT DISQUALIFY):
   - Microsoft, Google, Amazon, Meta, Oracle, IBM, Palantir, Salesforce, Notion, Veeva, Kontent.ai, Cisco, SAP, Adobe, etc.
   - Any public corporation, conglomerate, or enterprise with >500 employees.
   - IT consultancies / staff augmentation firms (Accenture, Infosys, Wipro).
   If the company fits any of these, set "isEnterpriseOrConglomerate": true and "intentScore": 0.

2. NON-DEVTOOL / PURE CONSUMER:
   - General retail, eCommerce, non-technical B2B SaaS (e.g., HR tools, generic sales CRMs).
   If so, set "isDevTool": false and "intentScore": 0.

HIGH-INTENT SIGNALS & SCORING (Assign 50-100):
1. DevTool Paid Writers' Program ("Write for Us", Community Authors, Paid Contributor Program):
   - Score: 90 - 100.
   - LeadType: "WRITERS_PROGRAM".
   - Note any mentioned pay rate (e.g. $300-$800/article) in summaryReasoning.
2. Active Technical Writer / Documentation Role:
   - Score: 80 - 95.
   - LeadType: "JOB_POSTING".
3. DevRel / Developer Advocate / Developer Relations Hiring:
   - Score: 75 - 90.
   - LeadType: "DEVREL_HIRING".
   - Rationale: Hiring a full-time DevRel takes 3-6 months. During this gap, companies urgently need external technical writers to build guides, sample apps, and tutorials.
4. Recent Venture Funding or Major API/SDK Launch:
   - Score: 60 - 75.

OUTPUT FORMAT REQUIREMENTS:
You MUST respond with valid raw JSON matching this exact structure with no Markdown wrappers, commentary, or extra text:

{
  "companyName": "string (clean official name of the company)",
  "companyWebsite": "string (the canonical root homepage URL e.g. https://supabase.com, NOT an ATS or job board link)",
  "jobPostingUrl": "string (the specific job posting URL or writer program application link)",
  "leadType": "JOB_POSTING" | "WRITERS_PROGRAM" | "DEVREL_HIRING" | "FOUNDER_POST" | "GENERAL_DEVTOOL",
  "isDevTool": boolean,
  "isEnterpriseOrConglomerate": boolean,
  "intentScore": number (0 to 100 based on signals),
  "hiringSignal": boolean,
  "activeRoles": ["string array of relevant job titles found"],
  "fundingSignal": boolean,
  "fundingStage": "string or null",
  "contentPainPoints": ["string array of identified gaps, e.g., missing API tutorials"],
  "summaryReasoning": "1-2 concise sentences explaining why this prospect is good or bad",
  "outreachAngle": "1 actionable, specific pitch idea tailored to this lead"
}
`;

/**
 * Sends markdown content to OpenRouter and parses structured analysis
 */
export async function analyzePage(
  scrapedPage: ScrapedPage,
): Promise<Lead | null> {
  console.log(
    `🤖 LLM Analyzing lead potential for: ${scrapedPage.companySlug || scrapedPage.domain}`,
  );

  const userPrompt = `
Analyze the following scraped page content:
Target URL: ${scrapedPage.url}
Detected Domain: ${scrapedPage.domain}
Detected Company Slug: ${scrapedPage.companySlug}

---
${scrapedPage.markdown}
---
`;

  try {
    const rawResponseText = await retryWithBackoff(async () => {
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/devtool-lead-scraper",
          "X-Title": "DevTool Lead Scraper CLI",
        },
        body: JSON.stringify({
          model: config.OPENROUTER_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1, // Low temperature for deterministic evaluation
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenRouter API error (${response.status}): ${errorText}`,
        );
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content;
    });

    if (!rawResponseText) {
      console.warn(`⚠️ Empty response from LLM for ${scrapedPage.domain}`);
      return null;
    }

    // Clean potential markdown code blocks returned by non-compliant free models
    const cleanedJsonText = rawResponseText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    const analysis: LeadAnalysis & { isEnterpriseOrConglomerate?: boolean } =
      JSON.parse(cleanedJsonText);

    // Enterprise Disqualification Filter
    if (
      analysis.isEnterpriseOrConglomerate ||
      isEnterpriseBlocked(analysis.companyName) ||
      isEnterpriseBlocked(scrapedPage.companySlug) ||
      isEnterpriseBlocked(scrapedPage.domain)
    ) {
      console.log(
        `🚫 Disqualified Enterprise: "${analysis.companyName || scrapedPage.companySlug}" exceeds size sweet-spot (>500 employees / public enterprise).`,
      );
      return null;
    }

    // Filter out non-DevTools or low intent scores (< 45)
    if (!analysis.isDevTool || analysis.intentScore < 45) {
      console.log(
        `⏩ Skipping ${analysis.companyName || scrapedPage.domain}: Not a qualified DevTool or low intent score (${analysis.intentScore}/100)`,
      );
      return null;
    }

    // Fallback resolution for URLs
    const fallbackWebsite =
      analysis.companyWebsite && !analysis.companyWebsite.includes("greenhouse") && !analysis.companyWebsite.includes("lever") && !analysis.companyWebsite.includes("ashby")
        ? analysis.companyWebsite
        : !scrapedPage.domain.includes("greenhouse") && !scrapedPage.domain.includes("lever") && !scrapedPage.domain.includes("ashby")
          ? `https://${scrapedPage.domain}`
          : `https://${scrapedPage.companySlug}.com`;

    const finalJobUrl = analysis.jobPostingUrl || scrapedPage.url;

    const lead: Lead = {
      ...analysis,
      id: crypto.randomUUID(),
      sourceUrl: scrapedPage.url,
      domain: scrapedPage.domain,
      companySlug: scrapedPage.companySlug,
      companyWebsite: fallbackWebsite,
      jobPostingUrl: finalJobUrl,
      leadType: analysis.leadType || "JOB_POSTING",
      discoveredAt: new Date().toISOString(),
    };

    console.log(
      `⭐ Qualified Lead Discovered! ${lead.companyName} [${lead.leadType}] (Score: ${lead.intentScore}/100)`,
    );
    return lead;
  } catch (error: any) {
    console.error(
      `❌ LLM analysis failed for ${scrapedPage.domain}:`,
      error.message || error,
    );
    return null;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Analyzes a batch of scraped pages sequentially
 */
export async function analyzeBatch(pages: ScrapedPage[]): Promise<Lead[]> {
  console.log(`🧠 Evaluating ${pages.length} pages via OpenRouter...`);
  const leads: Lead[] = [];

  for (const page of pages) {
    try {
      const lead = await analyzePage(page);
      if (lead) {
        leads.push(lead);
      }
      // Wait between requests to avoid hitting rate limits
      await sleep(3000);
    } catch (error: any) {
      console.error(
        `❌ Error analyzing page ${page.domain}:`,
        error.message || error,
      );
    }
  }

  console.log(
    `📊 Analysis complete. Qualified ${leads.length} high-intent leads.`,
  );
  return leads;
}

