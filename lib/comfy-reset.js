'use strict';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function comfyResetRequests() {
  return [
    { name: 'interrupt', path: '/interrupt', init: { method: 'POST' } },
    {
      name: 'clearQueue',
      path: '/queue',
      init: { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ clear: true }) },
    },
    {
      name: 'freeMemory',
      path: '/free',
      init: {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      },
    },
  ];
}

module.exports = {
  comfyResetRequests,
};
