import { GoogleGenAI, ThinkingLevel } from '@google/genai';

interface PagesContext {
  request: Request;
  env: Record<string, string>;
  params: Record<string, string | string[]>;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    // Client signature verification
    const clientHeader = context.request.headers.get('x-wattson-client');
    const authHeader = context.request.headers.get('authorization');
    if (!clientHeader && !authHeader) {
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

    // Guard against oversized prompt payloads
    const payloadStr = JSON.stringify(params);
    if (payloadStr.length > 500000) {
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

        return new Response(
          JSON.stringify({ text: response.text }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (err: any) {
        lastError = err;
        continue;
      }
    }

    const statusCode = lastError?.status || lastError?.code || 500;
    return new Response(
      JSON.stringify({ error: lastError?.message || 'All Gemini models failed.' }),
      {
        status: typeof statusCode === 'number' && statusCode >= 400 && statusCode < 600 ? statusCode : 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error?.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
