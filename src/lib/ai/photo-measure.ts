/** Browser-only brightness and softness. Used when the model cannot be reached. */

export async function measurePhotoDataUrl(dataUrl: string): Promise<{ meanLuma: number; edgeScore: number }> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("unreadable"));
    img.src = dataUrl;
  });
  const width = 32;
  const height = 32;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { meanLuma: 255, edgeScore: 99 };
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const luma = new Float32Array(width * height);
  let sum = 0;
  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    const y = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    luma[pixel] = y;
    sum += y;
  }
  let edge = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      edge += Math.abs(luma[y * width + x]! - luma[y * width + x + 1]!);
      count += 1;
    }
  }
  return { meanLuma: luma.length ? sum / luma.length : 255, edgeScore: count ? edge / count : 99 };
}
