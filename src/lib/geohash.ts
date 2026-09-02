const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** Precision 5 ≈ 4.9 km. Never send a finer hash to the telemetry pipeline. */
export function encodeGeohash(lat: number, lng: number, precision = 5) {
  let minLat = -90;
  let maxLat = 90;
  let minLng = -180;
  let maxLng = 180;
  let hash = "";
  let bit = 0;
  let ch = 0;
  let lngBit = true;
  while (hash.length < precision) {
    if (lngBit) {
      const mid = (minLng + maxLng) / 2;
      if (lng >= mid) {
        ch |= 1 << (4 - bit);
        minLng = mid;
      } else maxLng = mid;
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch |= 1 << (4 - bit);
        minLat = mid;
      } else maxLat = mid;
    }
    lngBit = !lngBit;
    if (bit < 4) bit += 1;
    else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}
