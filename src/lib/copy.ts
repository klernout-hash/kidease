import { en } from "./copy-en.ts";
import { fr } from "./copy-fr.ts";
import { installFrenchCopy } from "./copy-runtime.ts";

installFrenchCopy(fr);

export const copy = { en, fr } as const;

export type { CopyKey } from "./copy-en.ts";
export { ensureFrenchCopy, tx } from "./copy-runtime.ts";
export {
  bookingPayLeadKey,
  compareEmptyKey,
  featPayBodyKey,
  parentPayEmptyKey,
  parentPayLeadKey,
} from "./copy-keys.ts";
