import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      let response = await handler.fetch(request, env, ctx);
      response = await normalizeCatastrophicSsrResponse(response);

      // Edge caching optimization: Cache static question JSONs, seed-contents & assets
      // s-maxage=2592000 (30 days on Cloudflare Edge CDN) prevents burning Worker requests
      // max-age=604800 (7 days on student's browser) gives instant 0ms load times
      // stale-while-revalidate=86400 revalidates in the background if questions are updated
      const url = new URL(request.url);
      if (
        (url.pathname.startsWith("/seed-contents/") ||
          url.pathname.endsWith(".json") ||
          url.pathname.startsWith("/assets/")) &&
        response.status === 200
      ) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set(
          "Cache-Control",
          "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
        );
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }

      return response;
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
