/**
 * SmartHarvest – API Configuration
 * config.js is loaded first by all HTML pages.
 *
 * DEPLOYMENT MODES
 * ─────────────────────────────────────────────────────────────────────────────
 * A) SINGLE RENDER DEPLOY (recommended for college demos)
 *    Flask serves BOTH frontend + API on one URL.
 *    API_BASE = "" (empty = same origin, no CORS needed)
 *    → Just push to GitHub, connect repo on Render, done.
 *
 * B) SPLIT DEPLOY (Vercel frontend + Render backend)
 *    Set RENDER_BACKEND_URL below to your Render service URL.
 *    → Two deployments, must configure CORS.
 *
 * C) LOCAL DEV
 *    Flask on localhost:5000 serves both pages and API automatically.
 */

(function () {

  /* ── Option B: your Render backend URL (only used in split-deploy) ── */
  const RENDER_BACKEND_URL = 'https://smartharvest-api.onrender.com';
  //  ↑ Replace with your actual Render URL if using split deploy (Option B)

  /* ── Auto-detect which mode we're in ─────────────────────────────── */
  const hostname = window.location.hostname;

  const isLocal = (
    hostname === 'localhost'  ||
    hostname === '127.0.0.1'  ||
    hostname === ''            // opened via file://
  );

  const isVercel  = hostname.endsWith('.vercel.app');
  const isNetlify = hostname.endsWith('.netlify.app');

  let apiBase;

  if (isLocal) {
    // Local dev: Flask on port 5000 serves everything
    apiBase = 'http://localhost:5000';
    console.info('[SmartHarvest] 🖥️  Local mode → API at', apiBase);

  } else if (isVercel || isNetlify) {
    // Split deploy: frontend on Vercel/Netlify, backend on Render
    apiBase = RENDER_BACKEND_URL;
    console.info('[SmartHarvest] 🌐 Split-deploy → API at', apiBase);
    if (apiBase.includes('smartharvest-api') && !apiBase.includes('YOUR')) {
      console.warn('[SmartHarvest] ⚠️  Update RENDER_BACKEND_URL in config.js with your actual Render URL!');
    }

  } else {
    // Single Render deploy: frontend and API on same domain → use "" (same-origin)
    apiBase = '';
    console.info('[SmartHarvest] ☁️  Render single-deploy → same-origin API');
  }

  window.SMARTHARVEST_API_BASE = apiBase;

})();
