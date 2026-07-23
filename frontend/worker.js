export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // 1. Try fetching requested static asset from build/
      const response = await env.ASSETS.fetch(request);

      // 2. If static asset is found (status !== 404), return it directly
      if (response && response.status !== 404) {
        return response;
      }

      // 3. For 404 responses on files with extensions (e.g. .json, .png, .js, .css),
      // return a clean 404 Response so frontend GitHub Raw fallback triggers smoothly
      const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);
      if (hasFileExtension) {
        return new Response('Not Found', { status: 404 });
      }

      // 4. For SPA navigation routes without extensions (e.g. /login, /student/dashboard, /student/coding/as001-t001):
      // Fetch /index.html using an explicit GET Request object
      const indexRequest = new Request(`${url.origin}/index.html`, {
        method: 'GET'
      });
      return await env.ASSETS.fetch(indexRequest);
    } catch (err) {
      try {
        const fallbackRequest = new Request(`${url.origin}/index.html`, { method: 'GET' });
        return await env.ASSETS.fetch(fallbackRequest);
      } catch (_) {
        return new Response('Not Found', { status: 404 });
      }
    }
  }
};
