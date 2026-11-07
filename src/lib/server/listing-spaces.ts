import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import {
  deleteListingSpace,
  listListingSpacesForCentre,
  saveListingSpace,
  setListingSpacePhotos,
  writeListingPhotoList,
} from "@/lib/listing-spaces-store";

export const listListingSpaces = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return listListingSpacesForCentre(sql, context.userId, data.daycareId);
  });

export const saveListingSpaceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      daycareId: string;
      id?: string;
      name: string;
      spaceType: string;
      amenities?: string[];
      accessibility?: string[];
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return saveListingSpace(sql, context.userId, data);
  });

export const deleteListingSpaceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; spaceId: string; confirm?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return deleteListingSpace(sql, context.userId, data);
  });

export const setListingSpacePhotosFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; spaceId: string; photoSrcs: string[] }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return setListingSpacePhotos(sql, context.userId, data);
  });

export const saveListingPhotoListFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { daycareId: string; photos: string[]; confirmRemoval?: boolean }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    return writeListingPhotoList(sql, context.userId, data);
  });
