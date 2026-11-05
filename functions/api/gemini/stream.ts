import { GoogleGenAI, ThinkingLevel } from '@google/genai';

interface PagesContext {
  request: Request;
  env: Record<string, string>;
  params: Record<string, string | string[]>;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    // Origin verification
    const origin = context.request.headers.get('origin') || context.request.headers.get('referer');
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (!parsed.hostname.endsWith('.pages.dev') && !parsed.hostname.endsWith('.run.app') && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
          return new Response(
            JSON.stringify({ error: 'Access denied: Invalid request origin.' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } }
          );
        }
      } catch {
        return new Response(
          JSON.stringify({ error: 'Access denied: Malformed origin header.' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    const clientHeader = context.request.headers.get('x-wattson-client');
    const appIdHeader = context.request.headers.get('x-wattson-app-id');
    const authHeader = context.request.headers.get('authorization');
    const EXPECTED_APP_ID = 'c1b22b2d-9717-465e-bcf5-f44e5221095e';
    if ((!clientHeader || appIdHeader !== EXPECTED_APP_ID) && !authHeader) {
      return new Response(
        JSON.stringify({ error: 'Direct access forbidden. Requests must originate from the waTTson client.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = (await context.request.json()) as any;
    const { params, options } = body || {};

    if (!params || typeof params !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Invalid request: "params" object is required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payloadStr = JSON.stringify(params);
    if (payloadStr.length > 120000) {
      return new Response(
        JSON.stringify({ error: 'Payload too large. Prompt context exceeds allowable limit.' }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = context.env.GEMINI_API_KEY || context.env.API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'Server configuration error: GEMINI_API_KEY is not set in Cloudflare Pages environment variables.'
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let streamStarted = false;
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

            const responseStream = await ai.models.generateContentStream({
              ...(params || {}),
              model,
              config: mergedConfig
            });

            for await (const chunk of responseStream) {
              streamStarted = true;
              const text = chunk.text;
              if (text) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
              }
            }

            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
            return;
          } catch (err: any) {
            lastError = err;
            if (streamStarted) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err?.message || 'Stream interrupted.' })}\n\n`));
              controller.close();
              return;
            }
          }
        }

        if (!streamStarted) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: lastError?.message || 'All Gemini models failed.' })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
