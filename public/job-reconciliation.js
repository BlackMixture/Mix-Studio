(function initJobReconciliation(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KreaJobReconciliation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function jobReconciliationFactory() {
  'use strict';

  function stringSet(values) {
    return new Set((values || []).map((value) => String(value || '')).filter(Boolean));
  }

  function buildJobReconciliation(queue, local) {
    const snapshot = queue || {};
    const current = local || {};
    const empty = {
      authoritative: false,
      migrations: [],
      staleJobIds: [],
      staleCompositeJobIds: [],
      staleAnimatingItemIds: [],
      staleUpscalingItemIds: [],
    };
    // `/api/queue` deliberately returns ok:false when ComfyUI is unavailable.
    // An empty list in that response is not proof that a job ended.
    if (snapshot.ok !== true) return empty;

    const rows = [
      ...(snapshot.running || []),
      ...(snapshot.pending || []),
      ...(snapshot.finalizing || []),
    ];
    const liveJobIds = stringSet(rows.map((row) => row && row.jobId));
    const ownedRows = rows.filter((row) => row && row.owned === true);
    const sequenceByJob = current.activeJobSequences || {};
    const migrations = [];
    const migratedOldIds = new Set();
    const claimedNewIds = new Set();

    for (const oldJobId of stringSet(current.activeJobIds)) {
      if (liveJobIds.has(oldJobId)) continue;
      const sequenceId = sequenceByJob instanceof Map
        ? sequenceByJob.get(oldJobId)
        : sequenceByJob[oldJobId];
      if (!sequenceId) continue;
      const replacement = ownedRows.find((row) => row.sequenceId === sequenceId
        && row.jobId && !claimedNewIds.has(String(row.jobId)));
      if (!replacement) continue;
      const newJobId = String(replacement.jobId);
      migrations.push({ oldJobId, newJobId, sequenceId });
      migratedOldIds.add(oldJobId);
      claimedNewIds.add(newJobId);
    }

    const staleJobIds = [...stringSet(current.activeJobIds)]
      .filter((jobId) => !liveJobIds.has(jobId) && !migratedOldIds.has(jobId));
    const staleCompositeJobIds = [...stringSet(current.compositeJobIds)]
      .filter((jobId) => !liveJobIds.has(jobId) && !migratedOldIds.has(jobId));

    // A server restart can leave ComfyUI jobs running without Mix Studio's
    // ownership metadata. Keep gallery overlays until a fully known snapshot
    // is available rather than incorrectly announcing completion.
    const hasExternalJobs = rows.some((row) => row && row.kind === 'external');
    const liveOwnedItemIds = stringSet(ownedRows.map((row) => row.itemId));
    const staleAnimatingItemIds = hasExternalJobs ? [] : [...stringSet(current.animatingItemIds)]
      .filter((itemId) => !liveOwnedItemIds.has(itemId));
    const staleUpscalingItemIds = hasExternalJobs ? [] : [...stringSet(current.upscalingItemIds)]
      .filter((itemId) => !liveOwnedItemIds.has(itemId));

    return {
      authoritative: true,
      migrations,
      staleJobIds,
      staleCompositeJobIds,
      staleAnimatingItemIds,
      staleUpscalingItemIds,
    };
  }

  return { buildJobReconciliation };
});
