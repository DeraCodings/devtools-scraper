import { Client } from "eve/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export async function dispatchLeadsToEveAgent(urls: string[]) {
  const host = process.env.EVE_URL; // e.g., https://devtool-research-agent.vercel.app
  const bearerToken = process.env.EVE_ROUTE_TOKEN;

  if (!host || !bearerToken) {
    console.warn(
      "⚠️ Skipping dispatch: EVE_URL or EVE_ROUTE_TOKEN environment variables missing.",
    );
    return;
  }

  if (urls.length === 0) {
    console.log("ℹ️ No leads to dispatch.");
    return;
  }

  try {
    const client = new Client({
      host,
      auth: {
        bearer: bearerToken,
      },
      redirect: "error",
    });

    console.log(
      `📡 Creating Eve agent session for ${urls.length} target leads...`,
    );

    const { response } = await client.sessions.create({
      message: [
        "Conduct a complete prospect research analysis for the following target URLs.",
        "Discover key surfaces, inspect representative pages, score the content landscape depth, and identify cold-outreach angles.",
        "Do not ask follow-up questions; complete the research with the available information.",
        "",
        JSON.stringify({ urls }),
      ].join("\n"),
    });

    const result = await response.result();

    if (result.status !== "completed") {
      throw new Error(
        `Eve session failed (${result.status}): ${result.message ?? "Unknown error"}`,
      );
    }

    console.log(
      `✅ Successfully completed Eve research for ${urls.length} leads.`,
    );
  } catch (error: any) {
    console.error("❌ Failed to dispatch leads to Eve agent:", error?.message);
  }
}
