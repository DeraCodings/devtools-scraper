import { config } from "../config/env.js";
import { Lead, LeadAnalysis, ScrapedPage } from "../types/index.js";
import { retryWithBackoff } from "../utils/rate-limiter.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * System prompt defining lead qualifying criteria for technical content writing
 */
const SYSTEM_PROMPT = `
You are an expert DevTool Lead Qualifier for a technical content agency.
Your task is to analyze scraped website Markdown content and determine if the target company is a high-intent prospect.

QUALIFIED TARGET CATEGORIES:
1. Auth & Identity: Modern auth providers, IAM, passkeys, user management APIs (e.g., Clerk, Auth0, Stytch).
2. API Management & Gateways: API proxies, rate limiting, GraphQL/gRPC tooling, API analytics (e.g., Kong, Tyk, Treblle).
3. Cloud, Infra & DevOps: Infrastructure as Code, CI/CD, observability, edge compute (e.g., Terraform, Serverless).
4. Backend-as-a-Service (BaaS) & Databases: Managed backends, modern serverless databases, vector stores (e.g., Appwrite, Supabase, Neon, Pinecone).
5. AI Developer Tools & LLM Infra: Agent frameworks, LLM observability, prompt engineering APIs, AI SDKs (e.g., LangChain, LlamaIndex, Qdrant).

CRITERIA FOR QUALIFICATION:
- Must fit into one of the developer-facing categories above.
- High-intent signals (Assign Score 50-100):
  - Active hiring for Technical Writer, Developer Advocate, DevRel, Documentation Engineer, or Technical Content Marketer.
  - Newly raised Seed, Series A, or Series B funding.
  - Developer-facing API/SDK or product launch needing implementation guides, tutorials, or integration docs.

OUTPUT FORMAT REQUIREMENTS:
You MUST respond with valid raw JSON matching this exact structure with no Markdown wrappers, commentary, or extra text:

{
  "companyName": "string",
  "isDevTool": boolean,
  "intentScore": number (0 to 100 based on signals),
  "hiringSignal": boolean,
  "activeRoles": ["string array of relevant job titles found"],
  "fundingSignal": boolean,
  "fundingStage": "string or null",
  "contentPainPoints": ["string array of identified gaps, e.g., missing API tutorials"],
  "summaryReasoning": "1-2 concise sentences explaining why this prospect is good or bad"
}
`;

/**
 * Sends markdown content to OpenRouter and parses structured analysis
 */
export async function analyzePage(
  scrapedPage: ScrapedPage,
): Promise<Lead | null> {
  console.log(`🤖 LLM Analyzing lead potential for: ${scrapedPage.domain}`);

  const userPrompt = `
Analyze the following scraped page content for domain "${scrapedPage.domain}" (Source URL: ${scrapedPage.url}):

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

    const analysis: LeadAnalysis = JSON.parse(cleanedJsonText);

    // Filter out companies that are not DevTools or have very low intent scores (< 40)
    if (!analysis.isDevTool || analysis.intentScore < 40) {
      console.log(
        `⏩ Skipping ${scrapedPage.domain}: Not a qualified DevTool or low intent score (${analysis.intentScore}/100)`,
      );
      return null;
    }

    const lead: Lead = {
      ...analysis,
      id: crypto.randomUUID(),
      sourceUrl: scrapedPage.url,
      domain: scrapedPage.domain,
      discoveredAt: new Date().toISOString(),
    };

    console.log(
      `⭐ Qualified Lead Discovered! ${lead.companyName} (Score: ${lead.intentScore}/100)`,
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
