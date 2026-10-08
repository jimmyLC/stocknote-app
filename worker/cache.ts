// 用 Cloudflare Cache API 快取市場資料（一天更新一次）。
// 本機開發若沒有 caches.default 就自動略過，不影響功能。

const ONE_DAY = 60 * 60 * 24;

function defaultCache(): Cache | undefined {
  try {
    return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  } catch {
    return undefined;
  }
}

export interface WaitUntil {
  waitUntil(promise: Promise<unknown>): void;
}

export async function cachedJson<T>(
  key: string,
  ctx: WaitUntil,
  producer: () => Promise<T>,
): Promise<{ body: T; cached: boolean }> {
  const cache = defaultCache();
  const request = new Request(key, { method: "GET" });

  if (cache) {
    const hit = await cache.match(request);
    if (hit) return { body: (await hit.json()) as T, cached: true };
  }

  const body = await producer();

  if (cache) {
    const response = new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `max-age=${ONE_DAY}`,
      },
    });
    ctx.waitUntil(cache.put(request, response));
  }

  return { body, cached: false };
}
