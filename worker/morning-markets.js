export function completedSession(chart, today) {
  const result = chart?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const rows = (result?.timestamp || []).map((t, i) => ({
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t * 1000)),
    close: closes[i],
  })).filter(r => r.date < today && Number.isFinite(r.close) && r.close > 0).sort((a,b) => a.date.localeCompare(b.date));
  if (rows.length < 2) throw new Error('Missing completed sessions');
  const last = rows.at(-1), previous = rows.at(-2);
  if (Date.parse(today) - Date.parse(last.date) > 7 * 86400000) throw new Error('Old market data');
  return { ...last, change: (last.close / previous.close - 1) * 100 };
}

export async function morningMarkets(request) {
  if (request.method !== 'GET') return new Response(null, { status: 405 });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
  const key = new Request(new URL(`/api/morning-markets?day=${today}`, request.url));
  const cache = caches.default;
  const cached = await cache.match(key);
  if (cached) return cached;
  const rows = await Promise.all(['SPY','QQQ','DIA','IWM'].map(async symbol => {
    try {
      const response = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=1mo&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Provider unavailable');
      return { symbol, ...completedSession(await response.json(), today) };
    } catch { return { symbol, unavailable: true }; }
  }));
  const response = Response.json({ today, rows, fetchedAt: Date.now(), source: 'Yahoo Finance' }, {
    headers: { 'Cache-Control': `public, max-age=${rows.some(r => r.unavailable) ? 60 : 1800}`, 'X-Content-Type-Options': 'nosniff' },
  });
  await cache.put(key, response.clone());
  return response;
}
