import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Dispatches a list of scraped company lead URLs to the deployed Eve Agent webhook.
 */
export async function dispatchLeadsToEveAgent(urls: string[]) {
  const agentWebhookUrl = process.env.EVE_AGENT_WEBHOOK_URL;
  const routeToken = process.env.EVE_ROUTE_TOKEN;

  if (!agentWebhookUrl || !routeToken) {
    console.warn(
      "Skipping dispatch: EVE_AGENT_WEBHOOK_URL or EVE_ROUTE_TOKEN missing.",
    );
    return;
  }

  if (urls.length === 0) {
    console.log("No leads to dispatch.");
    return;
  }

  try {
    const response = await fetch(agentWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${routeToken}`,
      },
      body: JSON.stringify({ urls }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log(
      `Successfully dispatched ${urls.length} leads to Eve agent:`,
      data,
    );
  } catch (error: any) {
    console.error("Failed to dispatch leads to Eve agent:", error?.message);
  }
}
