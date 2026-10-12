// Markets strip — Phase 4 (docs/project-brief.md §5.4). Financial Modeling Prep (FMP) quotes for
// the ETF proxies in config.markets.symbols, fetched directly from the browser (no server, no
// bridge — just config.markets.fmpKey), polled during 09:30-16:00 ET on weekdays, plus one fetch
// any time there's no cached data yet at all (so a fresh install isn't stuck blank until the next
// market session). Outside that window with a cache already in hand — or before an fmpKey is set
// in config.js — it just shows the last close and makes no network calls. FMP's free tier is
// end-of-day only (confirmed via their own docs), so that close is the freshest data there is
// regardless of when it's fetched.
import { loadCache, saveCache, formatUpdatedAt } from "./store.js";
import { fetchJson } from "./network.js";

const MINUTE_MS = 60 * 1000;
const MAX_INTERVAL_MS = 30 * MINUTE_MS;
const CLOSED_CHECK_MS = 5 * MINUTE_MS;
// Bumped from "markets" — a tablet that already cached the pre-batch-fix result (only SPY, from
// when 3 of 4 parallel requests were silently failing) would otherwise keep re-showing that stale,
// incomplete cache forever outside market hours, since the fetch is normally gated to market hours
// once *any* cache exists. Changing the key makes it look like no cache exists yet on next load,
// which triggers an immediate fetch regardless of the clock (see the tick() comment below) and
// naturally self-heals — this isn't something to keep bumping routinely, just for a fetch/shape
// change like this one where an old cached value would otherwise be silently wrong forever.
const CACHE_KEY = "markets-v3";

function isMarketOpen(date, marketHours) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const isWeekday = !["Sat", "Sun"].includes(parts.weekday);
  const minutesNow = Number(parts.hour) * 60 + Number(parts.minute);
  const openMin = marketHours.startHourEt * 60 + marketHours.startMinuteEt;
  const closeMin = marketHours.endHourEt * 60;
  return isWeekday && minutesNow >= openMin && minutesNow < closeMin;
}

export async function fetchQuote(symbol, key) {
  const url = new URL("https://financialmodelingprep.com/stable/quote");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", key);
  const data = await fetchJson(url);
  const quote = Array.isArray(data) ? data[0] : data;
  if (
    !quote ||
    ![quote.price, quote.change, quote.changePercentage].every(
      (value) =>
        value !== null && value !== "" && Number.isFinite(Number(value)),
    )
  ) {
    throw new Error(`FMP ${symbol}: invalid quote`);
  }
  return { ...quote, _fetchedAt: Date.now() };
}

// One symbol at a time, awaited in sequence, against FMP's single-symbol /stable/quote endpoint —
// not Promise.all, and not FMP's /stable/batch-quote endpoint (that one is paid-plan-only:
// "Restricted Endpoint" on Kevin's free key, confirmed directly against FMP). Firing 4 single-symbol
// requests at once previously left only one symbol rendering, most likely a free-tier burst/
// concurrency limit; going one at a time avoids that entirely and costs nothing that matters for a
// tile that refreshes every 15 minutes. Each symbol still fails independently — one bad or
// throttled request just gets skipped, not thrown for the whole tile.
async function fetchAllQuotes(symbols, key) {
  const quotes = {};
  for (const s of symbols) {
    try {
      quotes[s.sym] = await fetchQuote(s.sym, key);
    } catch (err) {
      console.warn(`[markets] ${s.sym}`, err);
    }
  }
  return quotes;
}

function arrow(change) {
  return change > 0 ? "▲" : change < 0 ? "▼" : "▬";
}

function render(root, config, quotes, meta) {
  const isFr = config.locale?.startsWith("fr");
  const list = root.querySelector(".market-list");
  const toggle = root.querySelector(".market-toggle");
  const expanded = root.dataset.marketsExpanded === "true";
  list.innerHTML = "";

  for (const [index, s] of config.markets.symbols.entries()) {
    const q = quotes[s.sym];
    const row = document.createElement("div");
    row.className = `market-row${index > 0 && !expanded ? " market-row-secondary" : ""}${
      q
        ? ` ${q.change >= 0 ? "market-up" : "market-down"}`
        : " market-unavailable"
    }`;
    row.innerHTML = q
      ? `<span class="market-label">${s.label}</span>` +
        `<span class="market-values">` +
        `<span class="market-price">${Number(q.price).toFixed(2)}</span>` +
        `<span class="market-change">${arrow(Number(q.change))} ${
          Number(q.change) >= 0 ? "+" : ""
        }${Number(q.changePercentage).toFixed(2)}%</span>` +
        `</span>`
      : `<span class="market-label">${s.label}</span>` +
        `<span class="market-unavailable-label">${isFr ? "indisponible" : "unavailable"}</span>`;
    list.appendChild(row);
  }

  const secondaryCount = Math.max(config.markets.symbols.length - 1, 0);
  toggle.hidden = secondaryCount === 0;
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.textContent = expanded
    ? isFr
      ? "Afficher moins"
      : "Show less"
    : isFr
      ? "Afficher plus"
      : "Show more";

  const note = root.querySelector(".market-note");
  const missingCount = config.markets.symbols.filter(
    (s) => !quotes[s.sym],
  ).length;
  if (meta.stale) {
    note.textContent = `${isFr ? "Données anciennes" : "Stale data"} · ${formatUpdatedAt(meta.fetchedAt)}`;
  } else if (missingCount > 0) {
    note.textContent = isFr
      ? `${missingCount} indice${missingCount > 1 ? "s" : ""} indisponible${missingCount > 1 ? "s" : ""}`
      : `${missingCount} index${missingCount > 1 ? "es" : ""} unavailable`;
  } else if (meta.marketOpen) {
    note.textContent = isFr ? "Données différées" : "Delayed quotes";
  } else {
    note.textContent = `${isFr ? "marché fermé" : "market closed"} — ${formatUpdatedAt(meta.fetchedAt)}`;
  }
}

export function initMarkets(config, root) {
  if (config.markets.provider === "tradingview") {
    const frame = document.createElement("iframe");
    frame.title = "S&P 500, Nasdaq 100, Dow Jones et Russell 2000 — ETF par TradingView";
    // Provider-generated embed URL, hosted on a different origin. No third-party
    // scripts run in Maison's origin or gain access to Spotify/device storage.
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox");
    const widget = {
      colorTheme: document.documentElement.dataset.theme === "paper" ? "light" : "dark", dateRange: "1M", showChart: root.dataset.detail === "true", width: "100%", height: root.dataset.detail === "true" ? 540 : 310,
      isTransparent: false, showSymbolLogo: false,
      tabs: [{ title: "Indices · ETF", symbols: [
        { s: "AMEX:SPY", d: "S&P 500 · SPY" },
        { s: "NASDAQ:QQQ", d: "Nasdaq 100 · QQQ" },
        { s: "AMEX:DIA", d: "Dow Jones · DIA" },
        { s: "AMEX:IWM", d: "Russell 2000 · IWM" },
      ] }],
      utm_source: location.hostname, utm_medium: "widget_new", utm_campaign: "market-overview",
    };
    frame.src = "https://www.tradingview-widget.com/embed-widget/market-overview/?locale=fr#" + encodeURIComponent(JSON.stringify(widget));
    const observer = new document.defaultView.MutationObserver(() => {
      const theme = document.documentElement.dataset.theme === "paper" ? "light" : "dark";
      if (theme === widget.colorTheme) return;
      widget.colorTheme = theme;
      frame.src = "https://www.tradingview-widget.com/embed-widget/market-overview/?locale=fr#" + encodeURIComponent(JSON.stringify(widget));
    });
    observer.observe(document.documentElement, {attributes:true,attributeFilter:["data-theme"]});
    frame.className = "markets-widget";
    root.querySelector(".market-list").replaceChildren(frame);
    const attribution = document.createElement("a");
    attribution.href = "https://www.tradingview.com/markets/";
    attribution.target = "_blank";
    attribution.rel = "noopener nofollow";
    attribution.textContent = "Marchés par TradingView";
    root.querySelector(".market-list").appendChild(attribution);
    root.querySelector(".market-toggle").hidden = true;
    root.querySelector(".market-note").textContent = "SPY · QQQ · DIA · IWM : ETF suivant les indices, cotés en USD. Cours et délais indiqués par TradingView. Connexion Internet requise.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "market-retry";
    retry.textContent = "Recharger les marchés";
    retry.addEventListener("click", () => { frame.src = frame.src; });
    root.appendChild(retry);
    return { stop: () => observer.disconnect() };
  }
  let interval = config.refresh.markets;
  let current = loadCache(CACHE_KEY);
  let currentMeta = {
    marketOpen: false,
    stale: true,
    fetchedAt: current?.fetchedAt || Date.now(),
  };
  let key = config.markets.fmpKey;
  try {
    key = localStorage.getItem("maison-panel:fmp-key") || key;
  } catch {
    /* storage blocked */
  }
  function show(quotes, meta) {
    currentMeta = meta;
    render(root, config, quotes, meta);
  }
  root.dataset.marketsExpanded = "true";
  root.querySelector(".market-toggle").addEventListener("click", () => {
    root.dataset.marketsExpanded =
      root.dataset.marketsExpanded === "true" ? "false" : "true";
    show(current?.data || {}, currentMeta);
  });
  show(current?.data || {}, currentMeta);
  if (!key) {
    root.querySelector(".market-note").textContent =
      "Marchés non connectés · ajoutez une clé dans Réglages";
    return;
  }

  async function tick() {
    const now = new Date();
    const open = isMarketOpen(now, config.markets.marketHours);
    const hasCredentials = Boolean(key);
    const cached = current;
    let failed = false;

    // Fetch during market hours (to catch the close as it lands), or any time there's no cache
    // yet at all — otherwise a fresh install loading outside 09:30-16:00 ET would show nothing
    // until the next session, even though last close is available from FMP right now regardless
    // of the clock.
    if (hasCredentials && (open || !cached)) {
      try {
        const quotes = await fetchAllQuotes(config.markets.symbols, key);
        if (Object.keys(quotes).length === 0)
          throw new Error("no quotes returned");
        const merged = { ...cached?.data, ...quotes };
        current = { data: merged, fetchedAt: Date.now() };
        saveCache(CACHE_KEY, merged);
        interval = config.refresh.markets;
        const stale = config.markets.symbols.some(
          (s) => merged[s.sym] && !quotes[s.sym],
        );
        show(merged, {
          marketOpen: open,
          stale,
          fetchedAt: stale ? cached.fetchedAt : current.fetchedAt,
        });
      } catch (err) {
        console.warn("[markets]", err);
        interval = Math.min(interval * 2, MAX_INTERVAL_MS);
        failed = true;
        show(cached?.data || {}, {
          marketOpen: open,
          stale: true,
          fetchedAt: cached?.fetchedAt || Date.now(),
        });
      }
    } else if (cached) {
      show(cached.data, { ...currentMeta, marketOpen: false });
    }

    setTimeout(tick, open || failed ? interval : CLOSED_CHECK_MS);
  }

  tick();
}
