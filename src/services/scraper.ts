import FirecrawlApp from "@mendable/firecrawl-js";
import { config } from "../config/env.js";
import { ScrapedPage, SearchResult } from "../types/index.js";
import { processInBatches, retryWithBackoff } from "../utils/rate-limiter.js";

// Initialize the Firecrawl client with API key
const firecrawl = new FirecrawlApp({ apiKey: config.FIRECRAWL_API_KEY });

/**
 * Max character limit per page to stay well within cheap/free LLM context windows
 */
const MAX_MARKDOWN_CHARS = 15000;

/**
 * Scrapes a single URL and converts its content to clean Markdown
 */
export async function scrapePage(
  url: string,
  domain: string,
): Promise<ScrapedPage | null> {
  console.log(`🕷️ Firecrawl scraping: ${url}`);

  try {
    const response = await retryWithBackoff(async () => {
      // Firecrawl scrape returns structured document representations
      const scrapeResult = await firecrawl.scrapeUrl(url, {
        formats: ["markdown"],
      });

      if (!scrapeResult.success) {
        throw new Error(
          `Firecrawl error: ${scrapeResult.error || "Unknown failure"}`,
        );
      }

      return scrapeResult;
    });

    const rawMarkdown = response.markdown || "";

    // Truncate overly verbose pages to conserve token budgets
    const markdown =
      rawMarkdown.length > MAX_MARKDOWN_CHARS
        ? rawMarkdown.slice(0, MAX_MARKDOWN_CHARS) +
          "\n\n...[Content Truncated for Token Limit]..."
        : rawMarkdown;

    if (!markdown.trim()) {
      console.warn(
        `⚠️ Warning: No readable markdown content extracted for ${url}`,
      );
      return null;
    }

    return {
      url,
      domain,
      markdown,
      title: response.metadata?.title || domain,
      scrapedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error(`❌ Failed to scrape ${url}:`, error.message || error);
    return null;
  }
}

/**
 * Scrapes a batch of search target results concurrently within rate-limiting rules
 */
export async function scrapeBatch(
  targets: SearchResult[],
  batchSize: number = 2,
  delayMs: number = 2000,
): Promise<ScrapedPage[]> {
  console.log(`🚀 Starting batch scrape for ${targets.length} targets...`);

  const results = await processInBatches<SearchResult, ScrapedPage | null>(
    targets,
    batchSize,
    delayMs,
    async (target) => await scrapePage(target.link, target.domain),
  );

  // Filter out any failed or empty page scrapes
  const validPages = results.filter(
    (page): page is ScrapedPage => page !== null,
  );

  console.log(
    `✅ Successfully scraped ${validPages.length}/${targets.length} pages.`,
  );
  return validPages;
}
