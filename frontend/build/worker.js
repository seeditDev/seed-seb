export default {
  async fetch(request, env, ctx) {
    // Try fetching the static asset from build/ directory
    const response = await env.ASSETS.fetch(request);

    // If static asset returns 404 (e.g. SPA route like /student/coding/as001-t001), fallback to index.html
    if (response.status === 404) {
      const url = new URL(request.url);
      return await env.ASSETS.fetch(new Request(`${url.origin}/index.html`, request));
    }

    return response;
  }
};
