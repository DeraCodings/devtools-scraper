import { Lead } from "../types/index.js";

/**
 * Sends a clean Markdown notification message to Telegram for every newly qualified lead.
 */
export async function sendTelegramNotification(leads: Lead[]): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn(
      "⚠️ Telegram credentials missing in .env. Skipping Telegram notification.",
    );
    return;
  }

  if (leads.length === 0) return;

  console.log(`📡 Sending ${leads.length} lead alert(s) to Telegram...`);

  for (const lead of leads) {
    const rolesText = Array.isArray(lead.activeRoles)
      ? lead.activeRoles.join(", ")
      : lead.activeRoles || "N/A";

    // Construct message formatted in Telegram HTML
    const message = `
🔥 <b>New High-Intent DevTool Lead!</b>

🏢 <b>Company:</b> ${escapeHtml(lead.companyName)}
🎯 <b>Intent Score:</b> ${lead.intentScore}/100
💼 <b>Active Roles:</b> ${escapeHtml(rolesText)}
🌐 <b>Domain:</b> ${escapeHtml(lead.domain)}

🧠 <b>AI Summary:</b>
<i>${escapeHtml(lead.summaryReasoning)}</i>

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
            disable_web_page_preview: false,
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
        console.log(`📱 Telegram alert delivered for ${lead.companyName}!`);
      }
    } catch (error: any) {
      console.error(`❌ Error sending Telegram notification:`, error.message);
    }
  }
}

/**
 * Helper to escape basic HTML characters to prevent breaking Telegram message parsing
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
