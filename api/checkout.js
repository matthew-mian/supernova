// Vercel Serverless Function: /api/checkout
//
// Creates a Creem checkout session SERVER-SIDE (secret API key stays here,
// never sent to the browser) and returns { checkoutUrl }.
//
// The browser then calls Creem.openCheckout({ checkoutUrl }) to pop the
// embedded overlay — no page redirect.
//
// API reference: https://docs.creem.io/features/checkout/checkout-api
//   POST https://test-api.creem.io/v1/checkouts   (test mode)
//   POST https://api.creem.io/v1/checkouts        (live mode)
//   Header: x-api-key: YOUR_API_KEY
//   Body:   { product_id, success_url, ... }
//   Resp:   { id, checkout_url, product_id, status }
//
// Required env var (set in Vercel Project Settings → Environment Variables):
//   CREEM_API_KEY  — test keys are prefixed creem_test_, live keys are not
//
// ESM (package.json has "type":"module") — use `export default`, NOT module.exports.

const CREEM_PRODUCT_ID = 'prod_7G2zTME0gRxz09wGHsG0L4';

export default async function handler(req, res) {
  // Allow GET (test by visiting /api/checkout in browser) and POST.
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use POST or GET.' });
  }

  // ---- Secret API key — SERVER-SIDE ONLY. Never put this in client HTML or commit it. ----
  // 必须通过环境变量注入：Vercel → Project Settings → Environment Variables → CREEM_API_KEY
  //   - 测试环境 key 以 creem_test_ 开头（test-api.creem.io）
  //   - 生产环境 key 无前缀（api.creem.io）
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'CREEM_API_KEY is not set. Add it in Vercel Project Settings → Environment Variables.' });
  }

  // Test keys → test API base; live keys → live API base.
  const isTest = apiKey.startsWith('creem_test_');
  const base = isTest ? 'https://test-api.creem.io' : 'https://api.creem.io';

  // Product ID can be overridden via env, else falls back to the hardcoded one.
  const productId = process.env.CREEM_PRODUCT_ID || CREEM_PRODUCT_ID;

  // success_url: where Creem redirects on the hosted flow. For the embedded
  // overlay we cancel this redirect via Creem.close() in onComplete, but
  // success_url is still useful as a fallback. Point it at the app.
  const successUrl = process.env.CREEM_SUCCESS_URL || 'https://supernova-1sn7.vercel.app/';

  try {
    const resp = await fetch(base + '/v1/checkouts', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: productId,
        success_url: successUrl
      })
    });

    // Parse response defensively (Creem returns JSON)
    let data = {};
    try { data = await resp.json(); } catch (_) { data = {}; }

    if (!resp.ok || !data.checkout_url) {
      return res.status(resp.status || 502).json({
        error:
          (data && (data.message || data.error)) ||
          'Creem checkout session creation failed (HTTP ' + resp.status + ')'
      });
    }

    // Don't cache — each checkout needs a fresh session URL.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ checkoutUrl: data.checkout_url });
  } catch (e) {
    return res.status(502).json({
      error: 'Cannot reach Creem API: ' + (e.message || String(e))
    });
  }
};
