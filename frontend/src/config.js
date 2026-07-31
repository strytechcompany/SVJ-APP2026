
// ── LOCAL (same WiFi / hotspot — no sleep, instant) ──────────────────────────
// Run `node server.js` from the backend/ folder, then use this URL.
// const API_BASE_URL = 'https://sri-imeg.onrender.com/api';

const API_BASE_URL = 'http://192.168.29.235:5000/api';

// ── RENDER (cloud — works from any network / APK build) ──────────────────────
// Render service is currently suspended. Fix at render.com, then switch back:
// const API_BASE_URL = 'https://svj-app2026.onrender.com/api';

console.log('[Config] API_BASE_URL =', API_BASE_URL);

export default API_BASE_URL;
