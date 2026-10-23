/**
 * Remove KidEase from the person's Facebook apps.
 * Graph: DELETE /me/permissions. The token stays in the Authorization header
 * so it is not written into a URL.
 *
 * @see https://developers.facebook.com/docs/graph-api/reference/user/permissions
 */
export const FACEBOOK_UNLINK_URL = "https://graph.facebook.com/v24.0/me/permissions";

export async function unlinkFacebookPermissions(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const token = accessToken.trim();
  if (!token) return false;
  const res = await fetchImpl(FACEBOOK_UNLINK_URL, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  return res.ok;
}
