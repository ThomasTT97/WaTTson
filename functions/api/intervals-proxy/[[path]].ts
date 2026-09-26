interface PagesContext {
  request: Request;
  env: Record<string, string>;
  params: {
    path?: string | string[];
  };
}

export async function onRequest(context: PagesContext): Promise<Response> {
  // Handle CORS preflight
  if (context.request.method.toUpperCase() === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  try {
    const url = new URL(context.request.url);
    let subPath = url.pathname.replace(/^\/api\/intervals-proxy/, '') || '/';
    if (!subPath.startsWith('/')) {
      subPath = `/${subPath}`;
    }
    const fullQuery = url.search;

    // Security validation against path traversal and protocol injection
    if (
      subPath.includes('..') ||
      subPath.includes('@') ||
      subPath.includes('\\') ||
      subPath.startsWith('//') ||
      subPath.startsWith('/http:') ||
      subPath.startsWith('/https:')
    ) {
      return new Response(JSON.stringify({ error: 'Invalid proxy path syntax.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!subPath.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Proxy access restricted to Intervals.icu /api/* endpoints.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const targetUrl = `https://intervals.icu${subPath}${fullQuery}`;

    // Filter headers to forward
    const forwardHeaders = new Headers();
    const blockedHeaders = [
      'host',
      'origin',
      'referer',
      'content-length',
      'connection',
      'cf-ray',
      'cf-connecting-ip',
      'cf-ipcountry',
      'x-real-ip'
    ];

    context.request.headers.forEach((value, key) => {
      if (!blockedHeaders.includes(key.toLowerCase())) {
        forwardHeaders.set(key, value);
      }
    });

    const method = context.request.method.toUpperCase();
    let body: any = undefined;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      body = await context.request.arrayBuffer();
    }

    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers: forwardHeaders,
      body: body && body.byteLength > 0 ? body : undefined
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', '*');

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message || 'Failed to proxy request to intervals.icu' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
