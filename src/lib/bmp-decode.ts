/**
 * Uncompressed Windows BMP (24- and 32-bit). Sharp's prebuild does not decode BMP,
 * so listing uploads are turned into raw RGB and then handed to sharp.
 */

export type DecodedBmp = {
  width: number;
  height: number;
  rgb: Uint8Array;
};

export function decodeWindowsBmp(input: Uint8Array): DecodedBmp | null {
  if (input.byteLength < 54 || input[0] !== 0x42 || input[1] !== 0x4d) return null;
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const dib = view.getUint32(14, true);
  if (dib < 40 || pixelOffset >= input.byteLength) return null;
  const width = view.getInt32(18, true);
  const heightRaw = view.getInt32(22, true);
  const planes = view.getUint16(26, true);
  const bits = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (planes !== 1 || compression !== 0) return null;
  if (width < 1 || width > 16000) return null;
  const topDown = heightRaw < 0;
  const height = Math.abs(heightRaw);
  if (height < 1 || height > 16000) return null;
  if (bits !== 24 && bits !== 32) return null;
  const bytesPerPixel = bits / 8;
  const rowStride = Math.ceil((width * bytesPerPixel) / 4) * 4;
  if (pixelOffset + rowStride * height > input.byteLength) return null;
  const rgb = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const srcY = topDown ? y : height - 1 - y;
    const row = pixelOffset + srcY * rowStride;
    for (let x = 0; x < width; x++) {
      const s = row + x * bytesPerPixel;
      const d = (y * width + x) * 3;
      rgb[d] = input[s + 2] ?? 0;
      rgb[d + 1] = input[s + 1] ?? 0;
      rgb[d + 2] = input[s] ?? 0;
    }
  }
  return { width, height, rgb };
}
