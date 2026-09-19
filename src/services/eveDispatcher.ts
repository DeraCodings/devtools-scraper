import { Client } from "eve/client";
import { Lead } from "../types/index.js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

function escapeHtml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getLeadTypeBadge(leadType?: string): string {
  switch (leadType) {
    case "WRITERS_PROGRAM":
      return "✍️ <b>[PAID WRITERS PROGRAM]</b>";
    case "DEVREL_HIRING":
      return "🥑 <b>[DEVREL HIRING → TECH WRITER NEED]</b>";
    case "JOB_POSTING":
      return "💼 <b>[ACTIVE TECHNICAL WRITER ROLE]</b>";
    case "FOUNDER_POST":
      return "📢 <b>[FOUNDER / SOCIAL HIRING CALL]</b>";
    default:
      return "🔥 <b>[HIGH-INTENT DEVTOOL LEAD]</b>";
  }
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

  const devrelCallout =
    lead.leadType === "DEVREL_HIRING"
      ? `\n🥑 <b>DevRel Pitch Angle:</b>\n<i>Company is scaling Developer Relations! Pitch contract technical tutorials, quickstarts, and integration guides while this full-time role is being onboarded.</i>\n`
      : "";

  const customAngleCallout = lead.outreachAngle
    ? `\n🎯 <b>Strategic Angle:</b>\n<i>${escapeHtml(lead.outreachAngle)}</i>\n`
    : "";

  const directJobUrl = lead.jobPostingUrl || lead.sourceUrl;
  const companySiteUrl = lead.companyWebsite || `https://${lead.domain}`;

  const message = `
${getLeadTypeBadge(lead.leadType)}

🏢 <b>Company:</b> ${escapeHtml(lead.companyName)}
🎯 <b>Intent Score:</b> ${lead.intentScore}/100
📊 <b>Content Depth:</b> ${escapeHtml(String(researchData.content_depth_score || "Sweet Spot"))}
💼 <b>Active Roles:</b> ${escapeHtml(rolesText)}
🌐 <b>Website:</b> <a href="${companySiteUrl}">${escapeHtml(lead.companySlug || lead.domain)}</a>

🧠 <b>AI Qualification Summary:</b>
<i>${escapeHtml(lead.summaryReasoning)}</i>
${devrelCallout}${customAngleCallout}
💡 <b>Eve Cold-Outreach Angles:</b>
${anglesFormatted}

🔗 <a href="${directJobUrl}"><b>👉 View Direct Job Posting / Application</b></a>
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
    // Resolve the company's real home website so Eve analyzes docs and tutorials, not an ATS form
    const isAtsHost = [
      "greenhouse.io",
      "lever.co",
      "ashbyhq.com",
      "workable.com",
    ].some((ats) => lead.domain.includes(ats));

    const targetUrl =
      lead.companyWebsite && !isAtsHost
        ? lead.companyWebsite
        : isAtsHost
          ? `https://${lead.companySlug}.com`
          : `https://${lead.domain}`;

    try {
      console.log(
        `📡 Creating Eve agent session for ${lead.companyName} (${targetUrl})...`,
      );

      const { response } = await client.sessions.create({
        message: [
          `Conduct a complete prospect research analysis for DevTool company: ${lead.companyName} (${targetUrl}).`,
          "Discover key surfaces, inspect developer documentation and blog tutorials, score the content landscape depth, and identify high-converting cold-outreach angles for a technical content writer.",
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

