/**
 * Raw search engine target found via SerpApi
 */
export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  domain: string;
  sourceQuery: string;
}

/**
 * Clean page content extracted via Firecrawl
 */
export interface ScrapedPage {
  url: string;
  domain: string;
  markdown: string;
  title?: string;
  scrapedAt: string;
}

/**
 * Structured LLM evaluation output from OpenRouter
 */
export interface LeadAnalysis {
  companyName: string;
  isDevTool: boolean;
  intentScore: number; // 0 to 100
  hiringSignal: boolean;
  activeRoles: string[];
  fundingSignal: boolean;
  fundingStage?: string;
  contentPainPoints: string[];
  summaryReasoning: string;
}

/**
 * Final consolidated lead record ready for CSV/JSON export
 */
export interface Lead extends LeadAnalysis {
  id: string;
  sourceUrl: string;
  domain: string;
  discoveredAt: string;
}
