/**
 * Does not connect to a database.
 * Refuses a production URL. The demo children are added only from
 * /preview/attendance after you sign in, and only when
 * KIDEASE_ATTENDANCE_PREVIEW=1 on a machine that is not Vercel production.
 */
const url = String(process.env.DATABASE_URL || "");
const vercel = String(process.env.VERCEL_ENV || "").toLowerCase();
let host = "";
try {
  host = url ? new URL(url).hostname : "";
} catch {
  host = "invalid";
}
const productionHost = /neon\.tech|kidease\.ca|amazonaws\.com|render\.com/i.test(host);
if (vercel === "production" || productionHost) {
  console.error("Refusing to seed attendance. This script does not write to production.");
  process.exit(1);
}
console.log("No database was opened.");
console.log("1. Run the app with KIDEASE_ATTENDANCE_PREVIEW=1.");
console.log("2. Sign in with a local account. Do not use a production profile.");
console.log("3. Open /preview/attendance and press Add three demo children.");
console.log("4. Staff view: /provider?desk=today. Parent view: /account.");
console.log("The three names are DEMO Avery, DEMO Blair, and DEMO Casey at DEMO QA Centre.");
