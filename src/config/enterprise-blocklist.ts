/**
 * Blocklist of mega-enterprises, consulting giants, and non-target companies.
 * 
 * Freelance technical content writers and small dev-marketing agencies thrive
 * working with agile Seed, Series A, Series B, Series C, and bootstrapped DevTools
 * (5–300 employees). 
 * 
 * Enterprise giants (>500 employees, public corporations, consulting firms)
 * have lengthy corporate procurement, rigid HR pipelines for in-house FTEs,
 * and virtually zero chance of hiring an agile external freelance writer 
 * from a cold outreach.
 */

export const ENTERPRISE_BLOCKLIST: Set<string> = new Set([
  // Mega-cap tech
  "microsoft",
  "google",
  "alphabet",
  "amazon",
  "aws",
  "apple",
  "meta",
  "facebook",
  "oracle",
  "ibm",
  "cisco",
  "intel",
  "nvidia",
  "salesforce",
  "sap",
  "adobe",
  "vmware",
  "dell",
  "hp",
  "hpe",

  // Large enterprise tech & public SaaS
  "palantir",
  "notion",
  "veeva",
  "veevasystems",
  "kontent",
  "kontentai",
  "servicenow",
  "workday",
  "intuit",
  "autodesk",
  "atlassian",
  "splunk",
  "servicenow",
  "servicetitan",
  "hubspot",
  "zendesk",
  "twilio", // Twilio hires through established portals or agency RFPs, not cold ATS pitches (though their blog has a writers program, we handle that via WRITERS_PROGRAM preset)
  "datadog",
  "snowflake",
  "crowdstrike",
  "paloaltonetworks",
  "fortinet",
  "cloudflare",
  "akamai",
  "dropbox",
  "box",
  "docusign",
  "zoom",
  "uber",
  "lyft",
  "airbnb",
  "doordash",
  "instacart",
  "stripe", // Too large for cold ATS pitching; agency contracts handled internally
  "shopify",
  "square",
  "block",
  "paypal",
  "ebay",
  "broadcom",
  "qualcomm",
  "amd",
  "anduril",
  "andurilindustries",

  // Consulting, outsourcing, & IT services
  "accenture",
  "deloitte",
  "pwc",
  "ey",
  "kpmg",
  "mckinsey",
  "bain",
  "bcg",
  "infosys",
  "tcs",
  "tataconsultancy",
  "wipro",
  "cognizant",
  "capgemini",
  "hcl",
  "hcltech",
  "genpact",
  "dxctechnology",
  "luxoft",
  "epam",
  "slalom",
  "thoughtworks",
  "boozallen",
  "leidos",
  "caci",

  // Financial institutions & banks
  "jpmorgan",
  "chase",
  "goldmansachs",
  "morganstanley",
  "citigroup",
  "bankofamerica",
  "wellsfargo",
  "capitalone",
  "fidelity",
  "vanguard",
  "blackrock",
  "americanexpress",
  "visa",
  "mastercard",

  // Telecommunications & defense
  "verizon",
  "att",
  "tmobile",
  "comcast",
  "charter",
  "lockheedmartin",
  "raytheon",
  "boeing",
  "generaldefense",
  "northropgrumman",

  // Healthcare / Pharma conglomerates
  "pfizer",
  "johnsonandjohnson",
  "moderna",
  "novartis",
  "unitedhealth",
  "anthem",
  "cvs",
  "merck",
]);

/**
 * Normalizes a company name, domain, or slug into a clean comparable string
 */
export function normalizeCompanyKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/\.[a-z]{2,}$/i, "") // strip TLD
    .replace(/[^a-z0-9]/g, ""); // strip punctuation
}

/**
 * Checks if a company name, domain, or slug matches an enterprise blocklist item
 */
export function isEnterpriseBlocked(rawIdentifier: string): boolean {
  if (!rawIdentifier) return false;

  const normalized = normalizeCompanyKey(rawIdentifier);
  if (ENTERPRISE_BLOCKLIST.has(normalized)) return true;

  // Check substring matches for prominent names
  for (const blocked of ENTERPRISE_BLOCKLIST) {
    if (normalized.length >= 4 && (normalized === blocked || normalized.startsWith(blocked) || normalized.endsWith(blocked))) {
      return true;
    }
  }

  return false;
}
