/** True only when the centre has claimed and can take requests on KidEase. */
export function isPlatformLive(_id: string, claimed = false) {
  return Boolean(claimed);
}
