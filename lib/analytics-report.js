'use strict';

const { MODEL_LABELS } = require('../public/analytics');

function boundary(value, name) {
  if (value === undefined) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an ISO date or timestamp`);
  return parsed;
}

// Process a local export. The returned report deliberately contains no IDs,
// raw properties, URLs, prompts, or other event-level records.
function summarizeAnalytics(events, options = {}) {
  if (!Array.isArray(events)) throw new Error('Expected a JSON array of event objects');
  const from = boundary(options.from, 'from'), to = boundary(options.to, 'to');
  if (from !== null && to !== null && from >= to) throw new Error('from must be earlier than to');
  const browsers = new Set(), visits = new Set(), engagedBrowsers = new Set(), engagedVisits = new Set(), browserVisits = new Map();
  const ids = new Set(), seen = new Set(), days = new Map(), models = new Map();
  const totals = { appLaunches: 0, acceptedGenerationRequests: 0, observedPageIdentities: 0 };
  const quality = { duplicateEventsSkipped: 0, invalidTimestampsSkipped: 0, missingIdentityEvents: 0, unknownModelEvents: 0 };
  for (const row of events) {
    if (!row || !['App_Launched', 'Generation_Started'].includes(row.event)) continue;
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time)) { quality.invalidTimestampsSkipped++; continue; }
    if ((from !== null && time < from) || (to !== null && time >= to)) continue;
    const eventId = row.uuid || row.id;
    if (typeof eventId === 'string' && eventId) {
      if (seen.has(eventId)) { quality.duplicateEventsSkipped++; continue; }
      seen.add(eventId);
    }
    let props = row.properties;
    if (typeof props === 'string') { try { props = JSON.parse(props); } catch { props = {}; } }
    if (!props || typeof props !== 'object') props = {};
    const identity = typeof row.distinct_id === 'string' ? row.distinct_id : props.distinct_id;
    const measured = props.measurement_version === 2 && props.identity_scope === 'browser' &&
      typeof identity === 'string' && identity && typeof props.visit_id === 'string' && props.visit_id;
    if (measured) {
      browsers.add(identity);
      if (row.event === 'App_Launched') {
        visits.add(props.visit_id);
        if (!browserVisits.has(identity)) browserVisits.set(identity, new Set());
        browserVisits.get(identity).add(props.visit_id);
      } else { engagedBrowsers.add(identity); engagedVisits.add(props.visit_id); }
    }
    const day = new Date(time).toISOString().slice(0, 10);
    if (!days.has(day)) days.set(day, { date: day, appLaunches: 0, acceptedGenerationRequests: 0, ids: new Set(), browsers: new Set(), visits: new Set() });
    const bucket = days.get(day);
    if (measured) { bucket.browsers.add(identity); if (row.event === 'App_Launched') bucket.visits.add(props.visit_id); }
    if (typeof identity === 'string' && identity) { if (!measured) { ids.add(identity); bucket.ids.add(identity); } }
    else quality.missingIdentityEvents++;
    const key = row.event === 'App_Launched' ? 'appLaunches' : 'acceptedGenerationRequests';
    totals[key]++; bucket[key]++;
    if (row.event === 'Generation_Started') {
      const model = MODEL_LABELS.has(props.model_name) ? props.model_name : 'Unknown / legacy';
      if (model === 'Unknown / legacy') quality.unknownModelEvents++;
      models.set(model, (models.get(model) || 0) + 1);
    }
  }
  totals.observedPageIdentities = ids.size;
  Object.assign(totals, {
    activeBrowsers: browsers.size, visits: visits.size,
    engagedBrowsers: engagedBrowsers.size, engagedVisits: engagedVisits.size,
    returningBrowsersWithinWindow: [...browserVisits.values()].filter(v => v.size > 1).length,
    repeatVisitsWithinWindow: [...browserVisits.values()].reduce((n,v) => n + Math.max(0,v.size-1), 0),
  });
  return {
    identityScope: 'v2 random browser IDs per origin; not people. observedPageIdentities counts legacy IDs only. Returns mean multiple visits within the selected window, not lifetime retention.',
    generationScope: 'successful browser API submissions; not completed outputs, GPU starts, or all backend jobs',
    coverage: 'only events delivered by participating browsers; excludes opt-outs, blockers, offline clients and uncaptured server-side work',
    window: { fromInclusive: from === null ? null : new Date(from).toISOString(), toExclusive: to === null ? null : new Date(to).toISOString(), timezone: 'UTC' },
    totals,
    daily: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)).map(({ ids: dailyIds, browsers: dailyBrowsers, visits: dailyVisits, ...rest }) => ({ ...rest, observedPageIdentities: dailyIds.size, activeBrowsers: dailyBrowsers.size, visits: dailyVisits.size })),
    models: [...models].sort(([a], [b]) => a.localeCompare(b)).map(([model, acceptedGenerationRequests]) => ({ model, acceptedGenerationRequests })),
    quality,
  };
}

module.exports = { summarizeAnalytics };
