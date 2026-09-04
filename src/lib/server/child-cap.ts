import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";
import { CHILD_LIMIT_MESSAGE, MAX_CHILDREN_PER_PARENT } from "@/lib/children-limit";

export const assertCanAddChild = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ n: number }>`
      select count(*)::int as n from children where user_id = ${context.userId}
    `;
    const count = rows[0]?.n ?? 0;
    if (count >= MAX_CHILDREN_PER_PARENT) {
      throw new Error(CHILD_LIMIT_MESSAGE);
    }
    return { count, remaining: MAX_CHILDREN_PER_PARENT - count };
  });
