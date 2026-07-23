export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    try {
      // 1. Try fetching requested static asset from build/
      const response = await env.ASSETS.fetch(request);

      // 2. If static asset is found (status !== 404), return it directly
      if (response.status !== 404) {
        return response;
      }

      // 3. For 404 responses:
      // If request has a file extension (e.g. .js, .css, .json, .png, .jpg), return original 404
      // so frontend fallbacks (e.g. GitHub Raw fallback) can catch it
      const hasFileExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);
      if (hasFileExtension) {
        return response;
      }

      // 4. For SPA navigation routes without extensions (e.g. /student/coding/as001-t001), serve index.html
      const indexUrl = new URL('/index.html', request.url);
      return await env.ASSETS.fetch(indexUrl);
    } catch (err) {
      try {
        const indexUrl = new URL('/index.html', request.url);
        return await env.ASSETS.fetch(indexUrl);
      } catch (_) {
        return new Response('Internal Error', { status: 500 });
      }
    }
  }
};
