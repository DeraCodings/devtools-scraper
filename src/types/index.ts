/**
 * Raw search engine target found via SerpApi
 */
export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  domain: string;
  companySlug: string;
  platform?: string;
  sourceQuery: string;
}

/**
 * Clean page content extracted via Firecrawl
 */
export interface ScrapedPage {
  url: string;
  domain: string;
  companySlug: string;
  markdown: string;
  title?: string;
  scrapedAt: string;
}

export type LeadType =
  | "JOB_POSTING"
  | "WRITERS_PROGRAM"
  | "DEVREL_HIRING"
  | "FOUNDER_POST"
  | "GENERAL_DEVTOOL";

/**
 * Structured LLM evaluation output from OpenRouter
 */
export interface LeadAnalysis {
  companyName: string;
  companyWebsite?: string;
  jobPostingUrl?: string;
  leadType?: LeadType;
  isDevTool: boolean;
  intentScore: number; // 0 to 100
  hiringSignal: boolean;
  activeRoles: string[];
  fundingSignal: boolean;
  fundingStage?: string;
  contentPainPoints: string[];
  summaryReasoning: string;
  outreachAngle?: string;
}

/**
 * Final consolidated lead record ready for CSV/JSON export and notification
 */
export interface Lead extends LeadAnalysis {
  id: string;
  sourceUrl: string;
  domain: string;
  companySlug: string;
  discoveredAt: string;
}

