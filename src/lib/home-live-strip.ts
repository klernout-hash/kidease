/**
 * Home hero live chips.
 * A metro with 0 live centres must not read as “All listings · N” local live.
 * Edmonton (and any metro with live centres) keeps Live · N and All listings · N.
 */

export type HomeLiveStrip = {
  liveLabelKey: "liveToggleCount";
  liveCount: number;
  secondaryLabelKey: "allToggleCount" | "featuredStripCount";
  secondaryCount: number;
  /** Matches search: “0 live · browse directory”. */
  zeroLiveHint: boolean;
  featuredTitleKey: "featured" | "featuredStripTitle";
};

export function homeLiveStrip(liveCount: number, featuredCount: number): HomeLiveStrip {
  const live = Number.isFinite(liveCount) ? Math.max(0, Math.floor(liveCount)) : 0;
  const featured = Number.isFinite(featuredCount) ? Math.max(0, Math.floor(featuredCount)) : 0;
  const zero = live === 0;
  return {
    liveLabelKey: "liveToggleCount",
    liveCount: live,
    secondaryLabelKey: zero ? "featuredStripCount" : "allToggleCount",
    secondaryCount: featured,
    zeroLiveHint: zero,
    featuredTitleKey: zero ? "featuredStripTitle" : "featured",
  };
}
