import { GoogleGenAI } from "@google/genai";

export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const { contents, config, model } = await request.json();
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY environment variable is not configured." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    const ai = new GoogleGenAI({ 
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const response = await ai.models.generateContent({
      contents,
      config,
      model: model || "gemini-3.6-flash"
    });

    return new Response(JSON.stringify({ text: response.text }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Cloudflare Gemini Error:", error);
    return new Response(JSON.stringify({ error: error.message || "An error occurred with Gemini execution." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
