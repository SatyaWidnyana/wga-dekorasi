const { config, endpoint, send } = require('../server/core.cjs');
module.exports = endpoint(['GET'], async (req, res) => {
  try {
    const cfg = config();
    send(res, 200, {
      configured: true,
      reviewsEnabled: cfg.enabled,
      turnstileSiteKey: cfg.siteKey,
    });
  } catch {
    send(res, 200, { configured: false, reviewsEnabled: false });
  }
});
