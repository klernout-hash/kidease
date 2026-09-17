import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { JOURNAL_MAX_PHOTO_BYTES } from "../src/lib/daily-care.ts";
import { PRIVATE_DOC_BAD_FILE, PRIVATE_DOC_MAX_BYTES } from "../src/lib/private-docs.ts";
import { SCREENING_BAD_FILE, SCREENING_MAX_BYTES } from "../src/lib/provider-screening.ts";
import {
  isListingPhotoTooBig,
  isPrivateDocTooBig,
  LISTING_PHOTO_MAX_BYTES,
  LISTING_PHOTO_MIN_SHORT_SIDE_PX,
  PRIVATE_DOC_MAX_BYTES as SHARED_PRIVATE_MAX,
} from "../src/lib/upload-limits.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function src(rel) {
  return readFileSync(join(root, rel), "utf8");
}

test("upload constants stay honest to the real caps", () => {
  assert.equal(PRIVATE_DOC_MAX_BYTES, 4 * 1024 * 1024);
  assert.equal(SCREENING_MAX_BYTES, PRIVATE_DOC_MAX_BYTES);
  assert.equal(SHARED_PRIVATE_MAX, PRIVATE_DOC_MAX_BYTES);
  assert.equal(LISTING_PHOTO_MAX_BYTES, 1_800_000);
  assert.equal(JOURNAL_MAX_PHOTO_BYTES, LISTING_PHOTO_MAX_BYTES);
  assert.equal(LISTING_PHOTO_MIN_SHORT_SIDE_PX, 800);
  assert.equal(PRIVATE_DOC_BAD_FILE, "Upload a PDF or image under 4 MB.");
  assert.equal(SCREENING_BAD_FILE, PRIVATE_DOC_BAD_FILE);
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /uploadDocTooBig: "Upload a PDF or image under 4 MB\."/);
  assert.match(copy, /uploadDocTooBig: "Téléversez un PDF ou une image de moins de 4 Mo\."/);
});

test("EN + FR helper copy names the real size and recommended photo resolution", () => {
  const copy = src("src/lib/copy.ts");
  assert.match(copy, /uploadDocHint: "PDF or image · max 4 MB"/);
  assert.match(copy, /uploadDocHint: "PDF ou image · max 4 Mo"/);
  assert.match(copy, /uploadPhotoHint: "JPEG\/PNG\/WebP · max 1\.8 MB · at least 800px on the short side \(recommended\)"/);
  assert.match(copy, /uploadPhotoHint: "JPEG\/PNG\/WebP · max 1,8 Mo · au moins 800 px sur le petit côté \(recommandé\)"/);
  assert.match(copy, /uploadClaimDocHint: "PDF or image · max 1\.8 MB"/);
  assert.match(copy, /uploadClaimDocHint: "PDF ou image · max 1,8 Mo"/);
  assert.match(copy, /photoTooBig: "Please choose a JPEG, PNG, or WebP under 1\.8 MB\."/);
  assert.match(copy, /photoTooBig: "Choisissez une photo JPEG, PNG ou WebP de moins de 1,8 Mo\."/);
  assert.match(copy, /uploadClaimDocTooBig: "Upload a PDF or image under 1\.8 MB\."/);
  assert.match(copy, /uploadClaimDocTooBig: "Téléversez un PDF ou une image de moins de 1,8 Mo\."/);
  assert.match(copy, /storefrontHint:[\s\S]{0,160}1\.8 MB/);
  assert.match(copy, /storefrontHint:[\s\S]{0,160}1,8 Mo/);
  assert.doesNotMatch(copy, /photoTooBig: "Please choose a photo under 1\.5 MB\."/);
  assert.doesNotMatch(copy, /photoTooBig: "Choisissez une photo de moins de 1,5 Mo\."/);
  assert.doesNotMatch(copy, /JPG or PNG under 1\.5 MB/);
  assert.doesNotMatch(copy, /JPG ou PNG de moins de 1,5 Mo/);
});

test("client rejects match the same byte caps the UI advertises", () => {
  assert.equal(isPrivateDocTooBig(PRIVATE_DOC_MAX_BYTES), false);
  assert.equal(isPrivateDocTooBig(PRIVATE_DOC_MAX_BYTES + 1), true);
  assert.equal(isListingPhotoTooBig(LISTING_PHOTO_MAX_BYTES), false);
  assert.equal(isListingPhotoTooBig(LISTING_PHOTO_MAX_BYTES + 1), true);
  assert.equal(isListingPhotoTooBig(0), true);
});

test("screening, licence, listing, and claim upload UIs show limits and too-big errors", () => {
  const screening = src("src/components/provider-screening.tsx");
  const forms = src("src/components/provider-listing-forms.tsx");
  const provider = src("src/routes/provider.tsx");
  const claim = src("src/routes/claim.tsx");
  const care = src("src/components/daily-care-desk.tsx");
  const hint = src("src/components/upload-limit-hint.tsx");

  assert.match(hint, /data-ke="upload-limit-hint"/);
  assert.match(hint, /role="alert"/);

  assert.match(screening, /uploadDocHint/);
  assert.match(screening, /uploadDocTooBig/);
  assert.match(screening, /toast\.error/);
  assert.match(screening, /isPrivateDocTooBig/);
  assert.match(screening, /UploadLimitHint/);

  assert.match(forms, /uploadDocHint/);
  assert.match(forms, /uploadPhotoHint/);
  assert.match(forms, /uploadDocTooBig/);
  assert.match(forms, /photoTooBig/);
  assert.match(forms, /toast\.error/);
  assert.match(forms, /UploadLimitHint/);

  assert.match(provider, /uploadPhotoHint/);
  assert.match(provider, /photoTooBig/);
  assert.match(provider, /setStorefrontError/);

  assert.match(claim, /uploadClaimDocHint/);
  assert.match(claim, /uploadClaimDocTooBig/);
  assert.match(claim, /isListingPhotoTooBig/);
  assert.doesNotMatch(claim, /file\.size > 1_800_000/);
  assert.match(care, /UploadLimitHint/);
  assert.match(care, /carePhotoTooBig/);
});
