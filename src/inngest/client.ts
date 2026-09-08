import { Inngest } from "inngest";
import { INNGEST_APP_ID } from "@/lib/inngest";

/**
 * App-wide Inngest client. Safe to import when INNGEST_* keys are missing —
 * `new Inngest()` does not throw. Event send and Cloud sync no-op / fail
 * closed until Kyle pastes keys on Vercel kidease-git.
 */
export const inngest = new Inngest({ id: INNGEST_APP_ID });
