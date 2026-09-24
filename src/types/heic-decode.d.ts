declare module "heic-decode" {
  export default function decode(options: {
    buffer: Uint8Array | ArrayBuffer;
  }): Promise<{ width: number; height: number; data: Uint8ClampedArray }>;
}
