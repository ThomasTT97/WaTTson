import express from 'express';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const app = express();
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

// Server-side Gemini API endpoint
app.post('/api/gemini/generate', aiLimiter, async (req, res) => {
  try {
    // Basic client validation
    const clientHeader = req.headers['x-wattson-client'];
    const authHeader = req.headers['authorization'];
    if (!clientHeader && !authHeader) {
      return res.status(403).json({ error: 'Direct access forbidden. Requests must originate from the waTTson client.' });
    }

    const { params, options } = req.body || {};
    if (!params || typeof params !== 'object') {
      return res.status(400).json({ error: 'Invalid request: "params" object is required.' });
    }

    // Guard against oversized prompt payloads
    const payloadStr = JSON.stringify(params);
    if (payloadStr.length > 500000) {
      return res.status(413).json({ error: 'Payload too large. Prompt context exceeds allowable limit.' });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
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

    const models = options?.preferFlashLite === false
      ? ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest']
      : ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];

    let lastError: any = null;
    for (const model of models) {
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
