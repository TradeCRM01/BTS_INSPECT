type AssetFetcher = { fetch: (request: Request) => Promise<Response> };

const HTML_TYPE = /text\/html/i;

/** Missing /assets/* falls through to index.html. Never cache that as a chunk. */
export function rejectHtmlAssetResponse(response: Response): Response {
  const contentType = response.headers.get('content-type') ?? '';
  if (HTML_TYPE.test(contentType)) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function rejectHtmlAsset(
  request: Request,
  assets: AssetFetcher,
): Promise<Response> {
  return rejectHtmlAssetResponse(await assets.fetch(request));
}

export async function onRequest(context: {
  request: Request;
  env: { ASSETS: AssetFetcher };
}): Promise<Response> {
  const response = await context.env.ASSETS.fetch(context.request);
  return rejectHtmlAssetResponse(response);
}
