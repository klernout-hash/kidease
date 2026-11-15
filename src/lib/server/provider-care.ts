import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { familyVaultEnabled } from "@/lib/features";
import { listCentreFamilyDocs } from "@/lib/server/family-vault";

/** Documents a family has shared with a centre this person can open. */
export const listProviderFamilyDocs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!familyVaultEnabled()) return { enabled: false as const, documents: [] };
    const documents = await listCentreFamilyDocs(context.userId);
    return { enabled: true as const, documents };
  });
