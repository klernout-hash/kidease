/** USD per million tokens. Override with env when the price changes. */

export const DEFAULT_INPUT_USD_PER_M = 0.2;
export const DEFAULT_OUTPUT_USD_PER_M = 0.5;

export function costMicros(input: {
  inputTokens: number;
  outputTokens: number;
  inputUsdPerM?: number;
  outputUsdPerM?: number;
}): number {
  const inRate = input.inputUsdPerM ?? DEFAULT_INPUT_USD_PER_M;
  const outRate = input.outputUsdPerM ?? DEFAULT_OUTPUT_USD_PER_M;
  const usd =
    (Math.max(0, input.inputTokens) / 1_000_000) * inRate +
    (Math.max(0, input.outputTokens) / 1_000_000) * outRate;
  return Math.round(usd * 1_000_000);
}

export function formatUsdMicros(micros: number): string {
  const usd = Math.max(0, micros) / 1_000_000;
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}
