import { Client } from "eve/client";
import { Lead } from "../types/index.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendUnifiedTelegramNotification(
  lead: Lead,
  researchData: any,
): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn("⚠️ Telegram credentials missing. Skipping notification.");
    return;
  }

  const rolesText = Array.isArray(lead.activeRoles)
    ? lead.activeRoles.join(", ")
    : lead.activeRoles || "N/A";

  const outreachAngles = researchData.outreach_angles || [];
  const anglesFormatted =
    outreachAngles.length > 0
      ? outreachAngles
          .map((a: any) =>
            typeof a === "string"
              ? `• ${escapeHtml(a)}`
              : `• <b>${escapeHtml(a.type || "Angle")}:</b> ${escapeHtml(a.angle)}`,
          )
          .join("\n\n")
      : "<i>No outreach angles extracted.</i>";

  const message = `
🔥 <b>New Qualified Lead + Research Scorecard!</b>

🏢 <b>Company:</b> ${escapeHtml(lead.companyName)}
🎯 <b>Intent Score:</b> ${lead.intentScore}/100
📊 <b>Content Depth:</b> ${escapeHtml(String(researchData.content_depth_score || "Sweet Spot"))}
💼 <b>Active Roles:</b> ${escapeHtml(rolesText)}
🌐 <b>Domain:</b> ${escapeHtml(lead.domain)}

🧠 <b>AI Qualification Summary:</b>
<i>${escapeHtml(lead.summaryReasoning)}</i>

💡 <b>Eve Cold-Outreach Angles:</b>
${anglesFormatted}

🔗 <a href="${lead.sourceUrl}">View Source / Job Posting</a>
  `.trim();

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      console.error(
        `❌ Failed to send Telegram alert for ${lead.companyName}:`,
        err,
      );
    } else {
      console.log(
        `📱 Unified Telegram alert delivered for ${lead.companyName}!`,
      );
    }
  } catch (error: any) {
    console.error(`❌ Error sending Telegram notification:`, error.message);
  }
}

export async function dispatchLeadsToEveAgent(leads: Lead[]) {
  const host = process.env.EVE_URL;
  const bearerToken = process.env.EVE_ROUTE_TOKEN;

  if (!host || !bearerToken || leads.length === 0) return;

  const client = new Client({
    host,
    auth: { bearer: bearerToken },
    redirect: "error",
  });

  for (const lead of leads) {
    const targetUrl = lead.sourceUrl || `https://${lead.domain}`;

    try {
      console.log(
        `📡 Creating Eve agent session for ${lead.companyName} (${targetUrl})...`,
      );

      const { response } = await client.sessions.create({
        message: [
          `Conduct a complete prospect research analysis for: ${targetUrl}.`,
          "Discover key surfaces, inspect representative pages, score the content landscape depth, and identify cold-outreach angles.",
          "Do not ask follow-up questions; complete the research with the available information.",
          "",
          JSON.stringify({ urls: [targetUrl] }),
        ].join("\n"),
      });

      const result = await response.result();

      if (result.status !== "completed" && result.status !== "waiting") {
        throw new Error(
          `Eve session failed (${result.status}): ${result.message ?? "Unknown error"}`,
        );
      }

      const responseText = result.message || "";
      const jsonMatch =
        responseText.match(/```json\n([\s\S]*?)\n```/) ||
        responseText.match(/\{[\s\S]*\}/);

      let researchData: any = {};
      if (jsonMatch) {
        try {
          researchData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } catch (e) {
          console.warn(
            "Could not parse JSON block from Eve response, fallback to empty object.",
          );
        }
      }

      await sendUnifiedTelegramNotification(lead, researchData);
    } catch (error: any) {
      console.error(
        `❌ Failed research session for ${lead.companyName}:`,
        error?.message,
      );
    }
  }
}
