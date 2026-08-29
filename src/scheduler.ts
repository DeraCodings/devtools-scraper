import cron from "node-cron";
import { exec } from "node:child_process";

console.log("⏰ Starting DevTool Lead Scraper Scheduler...");
console.log("🔄 Scheduled to run every 6 hours.");

// Cron syntax: "0 */6 * * *" = Minute 0, every 6 hours
cron.schedule("0 */6 * * *", () => {
  console.log(`\n[${new Date().toISOString()}] 🚀 Running scheduled scrape...`);

  exec(
    "npx tsx src/index.ts --preset ATS_HIRING --limit 5",
    (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Cron job error: ${error.message}`);
        return;
      }
      if (stderr) console.error(stderr);
      console.log(stdout);
    },
  );
});
