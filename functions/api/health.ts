
export async function onRequest(context) {
  return new Response(JSON.stringify({ status: "ok" }), {
    headers: { "Content-Type": "application/json" }
  });
}
