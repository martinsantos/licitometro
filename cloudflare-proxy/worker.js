/**
 * Cloudflare Worker — Transparent proxy for *.mendoza.gov.ar
 *
 * Routes scraper requests through Cloudflare's network to bypass
 * datacenter IP blocks on mendoza.gov.ar infrastructure.
 *
 * Usage: POST/GET https://proxy.licitometro.ar/
 *   Header: X-Target-URL: https://comprasapps.mendoza.gov.ar/...
 *   Body: forwarded as-is
 *
 * Security: Only proxies to whitelisted mendoza.gov.ar domains.
 */

const ALLOWED_DOMAINS = [
  'comprasapps.mendoza.gov.ar',
  'portalgateway.mendoza.gov.ar',
  'boe.mendoza.gov.ar',
  'datosabiertos-compras.mendoza.gov.ar',
  'www.mendoza.gov.ar',
  'mendoza.gov.ar',
  'informacionoficial.mendoza.gob.ar',
];

// Simple shared secret to prevent abuse
const PROXY_SECRET = 'licitometro-mza-2026';

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Target-URL, X-Proxy-Secret',
        },
      });
    }

    // Health check
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', ts: new Date().toISOString() }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate secret
    const secret = request.headers.get('X-Proxy-Secret');
    if (secret !== PROXY_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Get target URL
    const targetUrl = request.headers.get('X-Target-URL');
    if (!targetUrl) {
      return new Response('Missing X-Target-URL header', { status: 400 });
    }

    // Validate domain whitelist
    let targetHost;
    try {
      targetHost = new URL(targetUrl).hostname;
    } catch {
      return new Response('Invalid X-Target-URL', { status: 400 });
    }

    if (!ALLOWED_DOMAINS.some(d => targetHost === d || targetHost.endsWith('.' + d))) {
      return new Response(`Domain ${targetHost} not allowed`, { status: 403 });
    }

    // Forward request with retry (some edges can't reach origin on first try)
    try {
      const headers = new Headers();
      for (const [key, value] of request.headers) {
        if (['content-type', 'accept', 'accept-encoding', 'accept-language'].includes(key.toLowerCase())) {
          headers.set(key, value);
        }
      }
      headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      let body = null;
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        body = await request.arrayBuffer();
      }

      // Retry up to 3 times — some CF edges timeout connecting to Argentine origins
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        const fetchOptions = {
          method: request.method,
          headers,
          redirect: 'follow',
        };
        if (body) fetchOptions.body = body;

        try {
          response = await fetch(targetUrl, fetchOptions);
          if (response.status !== 522) break; // Success or non-retryable error
          // 522 = origin connection timeout, retry
          if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
        } catch (fetchErr) {
          if (attempt >= 2) throw fetchErr;
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('X-Proxied-From', targetHost);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
