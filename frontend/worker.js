export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // 1. Try fetching requested static asset from build/
      const response = await env.ASSETS.fetch(request);

      // 2. If static asset is found (status 200/304), return it directly
      if (response && response.status !== 404) {
        return response;
      }

      // 3. For 404 responses on files with explicit file extensions (e.g. .json, .png, .js, .css, .woff2, .ico),
      // return a clean 404 Response so frontend fallbacks (e.g. GitHub Raw) catch it cleanly
      const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);
      if (hasFileExtension) {
        return new Response('Not Found', { status: 404 });
      }

      // 4. For ALL SPA navigation routes without file extensions (e.g. /login, /student/dashboard, /student/coding/as001-t001):
      // Fetch /index.html using a clean GET Request
      const indexReq = new Request(`${url.origin}/index.html`, {
        method: 'GET',
        headers: request.headers
      });
      const indexRes = await env.ASSETS.fetch(indexReq);

      if (indexRes && indexRes.status === 200) {
        return indexRes;
      }

      // Secondary fallback
      return await env.ASSETS.fetch(new Request(`${url.origin}/`, { method: 'GET' }));
    } catch (err) {
      try {
        const fallbackReq = new Request(`${url.origin}/index.html`, { method: 'GET' });
        return await env.ASSETS.fetch(fallbackReq);
      } catch (_) {
        return new Response('SPA Fallback Error', { status: 500 });
      }
    }
  }
};
