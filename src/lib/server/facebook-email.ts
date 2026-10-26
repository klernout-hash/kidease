/**
 * Browser-facing save. The database work lives in facebook-contact.ts so this
 * module can stay a server function and stay out of the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const saveFacebookContactEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email?: string }) => ({
    email: String(input?.email || "")
      .trim()
      .toLowerCase(),
  }))
  .handler(async ({ context, data }) => {
    const { saveFacebookContact } = await import("@/lib/server/facebook-contact");
    return saveFacebookContact(context.userId, data.email);
  });
