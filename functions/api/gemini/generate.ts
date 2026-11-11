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

    // Client signature verification
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

    // Guard against oversized prompt payloads
    const payloadStr = JSON.stringify(params);
    if (payloadStr.length > 120000) {
      return new Response(
        JSON.stringify({ error: 'Payload too large. Prompt context exceeds allowable limit.' }),
        { status: 413, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = (context.env.GEMINI_API_KEY || context.env.API_KEY || '').trim();
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

    let lastError: any = null;
    let authErrorMessage: string | null = null;
    for (const model of models) {
      try {
        const userThinkingLevel = params?.config?.thinkingConfig?.thinkingLevel;
        const thinkingLevel = model === 'gemini-3.1-flash-lite'
          ? (userThinkingLevel || ThinkingLevel.MINIMAL)
          : ((userThinkingLevel && userThinkingLevel !== ThinkingLevel.MINIMAL) ? userThinkingLevel : (options?.thinkingLevel || ThinkingLevel.LOW));

        const safeConfig: Record<string, any> = {
          ...(params?.config || {}),
          thinkingConfig: { thinkingLevel }
        };

        if (model.startsWith('gemini-3.8') || model.startsWith('gemini-4')) {
          delete safeConfig.temperature;
          delete safeConfig.topP;
          delete safeConfig.topK;
          delete safeConfig.candidateCount;
        }

        const response = await ai.models.generateContent({
          ...(params || {}),
          model,
          config: safeConfig
        });

        return new Response(
          JSON.stringify({ text: response.text }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (err: any) {
        lastError = err;
        const raw = err?.message || '';
        if (raw.includes('API key not valid') || raw.includes('API_KEY_INVALID')) {
          authErrorMessage = 'The Gemini API key is invalid. Please select or verify a valid API key in Settings > Secrets.';
          break;
        }
        if (err?.status === 403 || raw.includes('PERMISSION_DENIED')) {
          authErrorMessage = 'Gemini API permission denied. Please verify your API key in Settings > Secrets.';
          break;
        }
        continue;
      }
    }

    const statusCode = authErrorMessage ? 400 : (lastError?.status || lastError?.code || 500);
    const message = authErrorMessage || lastError?.message || 'All Gemini models failed.';
    return new Response(
      JSON.stringify({ error: message }),
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
