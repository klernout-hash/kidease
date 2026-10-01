/**
 * Strict filter shape for the smart-match note.
 * Extra keys (listing id, name, price, rank) fail the parse.
 */

import { z } from "zod";

export const smartMatchNoteSchema = z
  .object({
    age: z.enum(["infant", "toddler", "preschool", "school-age", "any"]).optional(),
    budget: z.enum(["ten", "any"]).optional(),
    french: z.boolean().optional(),
    schedule: z.enum(["full", "part", "flexible"]).optional(),
    extraSupport: z.boolean().optional(),
  })
  .strict();

export type SmartMatchNote = z.infer<typeof smartMatchNoteSchema>;
