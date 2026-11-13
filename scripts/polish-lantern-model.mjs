#!/usr/bin/env node
/** Offline Lighthouse13.6 model snapshot. Never navigates or makes requests. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pathOnly = (value) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.pathname : url.protocol;
  } catch {
    return null;
  }
};
const isEstimateEligible = (node, name) => name !== 'lcp' || node.type !== 'network' ||
  node.request.resourceType !== 'Image' || !['Low', 'VeryLow'].includes(node.request.priority);
function serializeGraph(graph, estimate, name) {
  const nodes = [];
  graph.traverse((node) => {
    const result = {
      id: String(node.id),
      type: node.type,
      observedStartMicroseconds: node.startTime,
      observedEndMicroseconds: node.endTime,
      dependencies: node.getDependencies().map((parent) => String(parent.id)),
      dependents: node.getDependents().map((child) => String(child.id)),
      eligibleForEstimate: isEstimateEligible(node, name),
      simulation: estimate.nodeTimings.get(node) || null,
    };
    if (node.type === 'network') {
      const request = node.request;
      result.network = {
        path: pathOnly(request.url),
        resourceType: request.resourceType,
        priority: request.priority,
        renderBlocking: request.renderBlocking,
        isLinkPreload: request.isLinkPreload,
        transferSize: request.transferSize,
        resourceSize: request.resourceSize,
        initiatorType: node.initiatorType,
        hasRenderBlockingPriority: node.hasRenderBlockingPriority(),
        isMainDocument: node.isMainDocument(),
      };
    } else {
      const counts = {};
      for (const event of node.childEvents) counts[event.name] = (counts[event.name] || 0) + 1;
      result.cpu = {
        eventName: node.event.name,
        didPerformLayout: node.didPerformLayout(),
        evaluateScriptPaths: [...node.getEvaluateScriptURLs()].map(pathOnly),
        childEventCounts: counts,
      };
    }
    nodes.push(result);
  });
  nodes.sort((a, b) => (a.simulation?.endTime || 0) - (b.simulation?.endTime || 0));
  const eligible = nodes.filter((node) => node.eligibleForEstimate && node.simulation);
  const endpoint = eligible.at(-1) || null;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const latestDependencyPath = [];
  let node = endpoint;
  while (node && !latestDependencyPath.includes(node.id)) {
    latestDependencyPath.push(node.id);
    node = node.dependencies.map((id) => nodeById.get(id)).filter(Boolean)
      .sort((a, b) => (b.simulation?.endTime || 0) - (a.simulation?.endTime || 0))[0];
  }
  return {
    estimateMs: estimate.timeInMs,
    nodeCount: nodes.length,
    endpointId: endpoint?.id || null,
    latestDependencyPath,
    latestFinishingEligibleNodeIds: eligible.slice(-20).reverse().map((value) => value.id),
    nodes,
  };
}
export async function modelLcp(artifacts, lhr, sourceSha, toolsPath) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha || '')) throw new Error('Exact sourceSHA required');
  const toolRoot = resolve(toolsPath || resolve(dirname(fileURLToPath(import.meta.url)), '../../audit-tools'));
  const imported = async (name) => import(pathToFileURL(resolve(toolRoot, 'node_modules/lighthouse/core/computed/metrics', name)).href);
  const { LanternLargestContentfulPaint } = await imported('lantern-largest-contentful-paint.js');
  const { LanternFirstContentfulPaint } = await imported('lantern-first-contentful-paint.js');
  for (const key of ['Trace', 'DevtoolsLog', 'GatherContext', 'URL', 'SourceMaps', 'HostDPR']) {
    if (artifacts[key] === undefined) throw new Error(`Missing matching Lighthouse artifact: ${key}`);
  }
  if (artifacts.GatherContext.gatherMode !== 'navigation' || lhr.configSettings.throttlingMethod !== 'simulate') {
    throw new Error('Requires matching simulated-navigation Lighthouse artifacts/report.');
  }
  const input = {
    trace: artifacts.Trace,
    devtoolsLog: artifacts.DevtoolsLog,
    gatherContext: artifacts.GatherContext,
    settings: lhr.configSettings,
    URL: artifacts.URL,
    SourceMaps: artifacts.SourceMaps,
    HostDPR: artifacts.HostDPR,
    simulator: null,
  };
  const context = { computedCache: new Map(), settings: lhr.configSettings };
  const { ProcessedNavigation } = await import(pathToFileURL(resolve(toolRoot, 'node_modules/lighthouse/core/computed/processed-navigation.js')).href);
  const navigation = await ProcessedNavigation.request(artifacts.Trace, context);
const report = {
  sourceSha,
  lighthouseVersion: lhr.lighthouseVersion,
  requestedPath: pathOnly(lhr.requestedUrl),
  observed: { fcpMs: navigation.timings.firstContentfulPaint, lcpMs: navigation.timings.largestContentfulPaint, candidateType: navigation.largestContentfulPaintEvt?.args?.data?.type },
  settings: { throttling: lhr.configSettings.throttling, throttlingMethod: lhr.configSettings.throttlingMethod },
  reported: lhr.audits.metrics.details.items[0],
  interpretation: 'Recomputed offline from the same mobile navigation artifacts. Dependency paths omit scheduler contention and are not an additive decomposition. No URLs with queries/hosts, headers, cookies, post bodies or raw CPU event args are exported.',
  models: {},
};
for (const [name, metric] of [['fcp', LanternFirstContentfulPaint], ['lcp', LanternLargestContentfulPaint]]) {
  const result = await metric.request(input, context);
  report.models[name] = {
    timing: result.timing,
    optimistic: serializeGraph(result.optimisticGraph, result.optimisticEstimate, name),
    pessimistic: serializeGraph(result.pessimisticGraph, result.pessimisticEstimate, name),
  };
}
report.recomputedLcpMatchesLhr = Math.abs(report.models.lcp.timing - lhr.audits['largest-contentful-paint'].numericValue) < 1;
report.recomputedFcpMatchesLhr = Math.abs(report.models.fcp.timing - lhr.audits['first-contentful-paint'].numericValue) < 1;
return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [artifactPath, lhrPath, outputPath, sourceSha, toolsPath] = process.argv.slice(2);
  if (!artifactPath || !lhrPath || !outputPath) throw new Error('Usage: node helper.mjs artifacts.json report.json output.json SOURCE_SHA [audit-tools]');
  const parsed = JSON.parse(readFileSync(artifactPath, 'utf8'));
  const lhr = JSON.parse(readFileSync(lhrPath, 'utf8'));
  const report = await modelLcp(parsed.artifacts || parsed, lhr, sourceSha, toolsPath);
  report.inputArtifactsFile = artifactPath;
  report.inputLhrFile = lhrPath;
  writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ sourceSha, outputPath, lcpMs: report.models.lcp.timing, fcpMs: report.models.fcp.timing, recomputedLcpMatchesLhr: report.recomputedLcpMatchesLhr, recomputedFcpMatchesLhr: report.recomputedFcpMatchesLhr }));
}
