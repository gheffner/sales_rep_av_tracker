// Copy this file to `config.js` and fill in your values for direct-to-AWS local dev.
// `config.js` is gitignored so secrets stay out of source control.
// In production the container generates its own config.js pointing at same-origin
// /api/sql (no headers) — see the Dockerfile.
window.SQL_CONFIG = {
  url: 'https://YOUR-API-GATEWAY-ID.execute-api.us-east-1.amazonaws.com/prod/db/agent_platform/sql',
  headers: {
    'X-Identity': 'your-username',
    'X-Internal-Secret': 'PLACEHOLDER_SECRET'
  }
};
