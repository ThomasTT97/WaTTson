import express from 'express';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

// Helper to dynamically read fresh GEMINI_API_KEY from .env (overriding stale container env)
const getGeminiApiKey = (): string | undefined => {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (key === 'GEMINI_API_KEY' && val) {
              return val;
            }
          }
        }
      }
    }
  } catch {}
  return process.env.GEMINI_API_KEY || process.env.API_KEY;
};

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Cloud Run / AI Studio)
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Security headers with Helmet (configured for iframe preview and popup OAuth compatibility)
app.use(
  helmet({
    contentSecurityPolicy: false,
    frameguard: false, // Critical: allows embedding in the AI Studio preview iframe
    crossOriginOpenerPolicy: false, // Allows Google Auth popups to communicate
    crossOriginResourcePolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// Reduced JSON body size limit from 15mb to 2mb to prevent memory exhaustion DoS
app.use(express.json({ limit: '2mb' }));

// Rate limiter for AI generations (prevents denial of wallet and LLM proxy abuse)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // max 50 coaching generations per IP in 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many coaching requests. Please take a breather and try again in a few minutes.' }
});

// Rate limiter for Intervals.icu outbound proxy
const proxyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // max 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Intervals.icu proxy rate limit exceeded. Please wait a moment.' }
});

// Security origin verification helper
const isAllowedOrigin = (req: express.Request): boolean => {
  const origin = req.headers.origin || req.headers.referer;
  const host = req.headers.host;
  
  // If an Origin or Referer header is present, strictly validate it
  if (origin) {
    try {
      const parsed = new URL(origin);
      const isAllowedHost = 
        parsed.hostname === 'localhost' || 
        parsed.hostname === '127.0.0.1' || 
        parsed.hostname.endsWith('.run.app') || 
        parsed.hostname.endsWith('.pages.dev');
      return isAllowedHost;
    } catch {
      return false;
    }
  }

  // Only allow missing Origin/Referer for local development test requests, never for public hosts
  if (host && (host.startsWith('localhost') || host.startsWith('127.0.0.1'))) {
    return true;
  }

  return false;
};

const EXPECTED_APP_ID = 'c1b22b2d-9717-465e-bcf5-f44e5221095e';

// Server-side Gemini API endpoint
app.post('/api/gemini/generate', aiLimiter, async (req, res) => {
  try {
    // 1. Origin and Host verification to block third-party bot scanners
    if (!isAllowedOrigin(req)) {
      return res.status(403).json({ error: 'Access denied: Invalid request origin.' });
    }

    // 2. Client & App verification (blocks unauthorized API scrapers)
    const clientHeader = req.headers['x-wattson-client'];
    const appIdHeader = req.headers['x-wattson-app-id'];
    const authHeader = req.headers['authorization'];
    if ((!clientHeader || appIdHeader !== EXPECTED_APP_ID) && !authHeader) {
      return res.status(403).json({ error: 'Direct access forbidden. Requests must originate from the waTTson client.' });
    }

    const { params, options } = req.body || {};
    if (!params || typeof params !== 'object') {
      return res.status(400).json({ error: 'Invalid request: "params" object is required.' });
    }

    // 3. Guard against oversized payloads (limit to 120kb)
    const payloadStr = JSON.stringify(params);
    if (payloadStr.length > 120000) {
      return res.status(413).json({ error: 'Payload too large. Prompt context exceeds allowable limit.' });
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is not set.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    // Whitelist only safe, lightweight coaching models
    const allowedModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];
    const models = options?.preferFlashLite === false
      ? ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']
      : ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];

    let lastError: any = null;
    for (const model of models) {
      if (!allowedModels.includes(model)) continue;
      try {
        const thinkingLevel = model === 'gemini-3.1-flash-lite'
          ? ThinkingLevel.MINIMAL
          : (options?.thinkingLevel || ThinkingLevel.LOW);

        const mergedConfig = {
          ...(params?.config || {}),
          thinkingConfig: params?.config?.thinkingConfig || { thinkingLevel }
        };

        const response = await ai.models.generateContent({
          ...(params || {}),
          model,
          config: mergedConfig
        });

        return res.json({ text: response.text });
      } catch (err: any) {
        console.warn(`[Gemini Server] Model ${model} failed, attempting next fallback...`, err?.message || err);
        lastError = err;
        continue;
      }
    }

    const statusCode = lastError?.status || lastError?.code || 500;
    return res.status(typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      error: lastError?.message || 'All Gemini models failed.'
    });
  } catch (error: any) {
    console.error('[Gemini Server] Unexpected error:', error);
    return res.status(500).json({ error: error?.message || 'Internal server error' });
  }
});

// Server-side Gemini Streaming API endpoint (SSE)
app.post('/api/gemini/stream', aiLimiter, async (req, res) => {
  try {
    if (!isAllowedOrigin(req)) {
      return res.status(403).json({ error: 'Access denied: Invalid request origin.' });
    }

    const clientHeader = req.headers['x-wattson-client'];
    const appIdHeader = req.headers['x-wattson-app-id'];
    const authHeader = req.headers['authorization'];
    if ((!clientHeader || appIdHeader !== EXPECTED_APP_ID) && !authHeader) {
      return res.status(403).json({ error: 'Direct access forbidden. Requests must originate from the waTTson client.' });
    }

    const { params, options } = req.body || {};
    if (!params || typeof params !== 'object') {
      return res.status(400).json({ error: 'Invalid request: "params" object is required.' });
    }

    const payloadStr = JSON.stringify(params);
    if (payloadStr.length > 120000) {
      return res.status(413).json({ error: 'Payload too large. Prompt context exceeds allowable limit.' });
    }

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is not set.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build'
        }
      }
    });

    const allowedModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];
    const models = options?.preferFlashLite === false
      ? ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash']
      : ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-2.5-flash'];

    // Setup Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    let isClientConnected = true;
    req.on('close', () => {
      isClientConnected = false;
    });

    let streamStarted = false;
    let lastError: any = null;

    for (const model of models) {
      if (!isClientConnected) break;
      try {
        const thinkingLevel = model === 'gemini-3.1-flash-lite'
          ? ThinkingLevel.MINIMAL
          : (options?.thinkingLevel || ThinkingLevel.LOW);

        const mergedConfig = {
          ...(params?.config || {}),
          thinkingConfig: params?.config?.thinkingConfig || { thinkingLevel }
        };

        const responseStream = await ai.models.generateContentStream({
          ...(params || {}),
          model,
          config: mergedConfig
        });

        for await (const chunk of responseStream) {
          if (!isClientConnected) break;
          streamStarted = true;
          const text = chunk.text;
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }
        }

        if (isClientConnected) {
          res.write('data: [DONE]\n\n');
          res.end();
        }
        return;
      } catch (err: any) {
        console.warn(`[Gemini Stream] Model ${model} failed:`, err?.message || err);
        lastError = err;
        if (streamStarted) {
          if (isClientConnected) {
            res.write(`data: ${JSON.stringify({ error: err?.message || 'Stream interrupted.' })}\n\n`);
            res.end();
          }
          return;
        }
        continue;
      }
    }

    if (!streamStarted && isClientConnected) {
      res.write(`data: ${JSON.stringify({ error: lastError?.message || 'All Gemini models failed.' })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error('[Gemini Stream] Unexpected error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error?.message || 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ error: error?.message || 'Internal server error' })}\n\n`);
      res.end();
    }
  }
});

// Strava Auth
app.get('/api/auth/strava/url', (req, res) => {
  const redirectUri = `${req.headers.referer || process.env.APP_URL}/auth/strava/callback`;
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'activity:read,activity:write',
  });
  res.json({ url: `https://www.strava.com/oauth/authorize?${params}` });
});

// Intervals.icu Auth
app.get('/api/auth/intervals/url', (req, res) => {
  const redirectUri = `${req.headers.referer || process.env.APP_URL}/auth/intervals/callback`;
  const params = new URLSearchParams({
    client_id: process.env.INTERVALS_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read,write',
  });
  res.json({ url: `https://intervals.icu/oauth/authorize?${params}` });
});

// Callback handler
app.get(['/auth/strava/callback', '/auth/intervals/callback'], async (req, res) => {
  res.send(`
    <html>
      <body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', code: '${req.query.code}', provider: '${req.path.includes('strava') ? 'strava' : 'intervals'}' }, '*');
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
        <p>Authentication successful. This window should close automatically.</p>
      </body>
    </html>
  `);
});

// Proxy for intervals.icu requests (hardened against SSRF, path traversal & abuse)
app.use('/api/intervals-proxy', proxyLimiter, async (req, res) => {
  try {
    const rawSubPath = req.url.startsWith('/') ? req.url : `/${req.url}`;

    // Validate path against traversal, protocol injection, or non-API targets
    if (
      rawSubPath.includes('..') ||
      rawSubPath.includes('@') ||
      rawSubPath.includes('\\') ||
      rawSubPath.startsWith('//') ||
      rawSubPath.startsWith('/http:') ||
      rawSubPath.startsWith('/https:')
    ) {
      return res.status(400).json({ error: 'Invalid proxy path syntax.' });
    }

    // Only allow verified Intervals.icu API endpoints
    if (!rawSubPath.startsWith('/api/')) {
      return res.status(403).json({ error: 'Proxy access restricted to Intervals.icu /api/* endpoints.' });
    }

    const targetUrl = `https://intervals.icu${rawSubPath}`;

    // Filter headers to only forward safe request headers
    const safeForwardHeaders: Record<string, string> = {};
    const blockedHeaders = ['host', 'origin', 'referer', 'content-length', 'connection', 'x-forwarded-for'];
    for (const [key, value] of Object.entries(req.headers)) {
      if (!blockedHeaders.includes(key.toLowerCase()) && typeof value === 'string') {
        safeForwardHeaders[key] = value;
      }
    }

    const bodyMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    let bodyData: any = undefined;
    if (bodyMethods.includes(req.method.toUpperCase()) && req.body && Object.keys(req.body).length > 0) {
      bodyData = JSON.stringify(req.body);
      safeForwardHeaders['content-type'] = 'application/json';
    }

    // Fetch with a 25s timeout to prevent thread hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: safeForwardHeaders,
      body: bodyData,
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    res.status(response.status);
    response.headers.forEach((value, name) => {
      if (!['content-encoding', 'transfer-encoding', 'content-length'].includes(name.toLowerCase())) {
        res.setHeader(name, value);
      }
    });

    const dataBuffer = await response.arrayBuffer();
    return res.send(Buffer.from(dataBuffer));
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Intervals.icu gateway timeout' });
    }
    console.error('[Intervals Proxy] Error:', error);
    return res.status(502).json({ error: error?.message || 'Failed to proxy request to intervals.icu' });
  }
});

// Dev vs Production static handling
const startServer = async () => {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
};

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
