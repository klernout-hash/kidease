import { createFileRoute } from "@tanstack/react-router";

/** Alexa custom skill endpoint. FEATURE_ALEXA_SKILL off → 404. Signature verified on every call. */
async function run(request: Request) {
  const body = await request.text();
  const { verifyAlexaRequest, handleAlexa } = await import("@/lib/server/alexa");
  const verified = await verifyAlexaRequest(
    process.env,
    {
      certUrl: request.headers.get("signaturecertchainurl") || "",
      signature: request.headers.get("signature-256") || "",
    },
    body,
    {
      fetchCert: async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error("cert fetch failed");
        return res.text();
      },
    },
  );
  if (!verified.ok) return Response.json({ ok: false, error: verified.error }, { status: verified.status });
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  const data = {
    async linkedUser(accessToken: string) {
      const rows = (await sql.query(
        `select s."userId" as user_id,
                exists(select 1 from provider_daycares p where p.user_id = s."userId") as provider
           from "session" s where s.token = $1 and s."expiresAt" > now() limit 1`,
        [accessToken],
      )) as { user_id: string; provider: boolean }[];
      const r = rows[0];
      return r ? { userId: r.user_id, role: r.provider ? ("provider" as const) : ("parent" as const) } : null;
    },
    async spotsNear(city: string) {
      const rows = (await sql.query(
        `select count(*)::int as centres, coalesce(sum(spots_infant + spots_toddler + spots_preschool), 0)::int as spots
           from daycares where lower(city) = lower($1) and (spots_infant + spots_toddler + spots_preschool) > 0`,
        [city],
      )) as { centres: number; spots: number }[];
      return rows[0] || { centres: 0, spots: 0 };
    },
    async dayLogCount(userId: string) {
      const rows = (await sql.query(
        `select count(*)::int as n from daily_journals where parent_user_id = $1 and day = current_date`,
        [userId],
      )) as { n: number }[];
      return rows[0]?.n || 0;
    },
    async newMessages(userId: string) {
      const rows = (await sql.query(
        `select count(*)::int as n from messages m
           join conversations c on c.id = m.conversation_id
           join provider_daycares p on p.daycare_id = c.daycare_id
          where p.user_id = $1 and m.sender = 'parent' and m.created_at > now() - interval '1 day'`,
        [userId],
      )) as { n: number }[];
      return rows[0]?.n || 0;
    },
  };
  return Response.json(await handleAlexa(verified.json, data));
}

export const Route = createFileRoute("/api/alexa")({
  server: {
    handlers: {
      POST: ({ request }) => run(request),
    },
  },
});
