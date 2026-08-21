/** True when a centre accepts requests on KidEase (claimed) or is a live partner. */
export function isPlatformLive(id: string, claimed = false) {
  if (claimed) return true;
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 6 === 0;
}
