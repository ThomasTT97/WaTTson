export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);
  
  // Extract the path after /api/intervals/
  const subpath = params.path ? params.path.join('/') : '';
  const queryString = url.search;
  
  const targetUrl = `https://intervals.icu/api/${subpath}${queryString}`;

  const headers = new Headers();
  const allowedHeaders = ["authorization", "content-type", "accept"];
  
  for (const header of allowedHeaders) {
    const val = request.headers.get(header);
    if (val) headers.set(header, val);
  }

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
    redirect: 'follow'
  };

  if (["POST", "PUT", "PATCH"].includes(request.method)) {
    fetchOptions.body = await request.arrayBuffer();
  }

  try {
    const apiResponse = await fetch(targetUrl, fetchOptions);
    
    const responseHeaders = new Headers(apiResponse.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
    
    return new Response(apiResponse.body, {
      status: apiResponse.status,
      headers: responseHeaders
    });
  } catch (error: any) {
    console.error("Intervals Proxy Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Intervals proxy failed." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
