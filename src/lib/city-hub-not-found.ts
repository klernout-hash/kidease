/** Unknown or non-Canadian `/daycare/city/:slug`. No US catalogue rows. */
export const CITY_HUB_NOT_FOUND_TITLE = "Page not found · KidEase";
export const CITY_HUB_NOT_FOUND_DESCRIPTION =
  "KidEase lists licensed daycare in Canada only. There is no directory for this city.";

export function cityHubNotFoundHead() {
  return {
    meta: [
      { title: CITY_HUB_NOT_FOUND_TITLE },
      { name: "description", content: CITY_HUB_NOT_FOUND_DESCRIPTION },
      { name: "robots", content: "noindex, nofollow" },
    ],
  };
}
