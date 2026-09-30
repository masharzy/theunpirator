import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { piracyFindings, piracyWatchlists } from "@unpirator/db/schema";
import { notifyPlatform } from "./admin-notifications.js";
import { createLogger } from "@unpirator/logger";

const defaultLogger = createLogger({ service: "piracy-scanner" });

// Politeness caps keep every scanner within free tiers on a single run:
// YouTube search costs 100 quota units against the 10,000/day free budget.
const MAX_QUERIES_PER_WATCHLIST = 3;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TheUnpiratorBot/1.0; +https://theunpirator.example/bot)";

export function normalizeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol)) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key);
  if (url.searchParams.size === 0) url.search = "";
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
}

export function urlHashOf(raw) {
  const normalized = normalizeUrl(raw);
  return normalized ? createHash("sha256").update(normalized).digest("hex") : null;
}

export function matchKeywords(text, keywords) {
  if (!text) return [];
  const haystack = text.toLowerCase();
  return [...new Set(keywords.filter((k) => haystack.includes(k.toLowerCase())))];
}

function decodeHtmlEntities(text) {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Parses the public web preview of a Telegram channel (https://t.me/s/<handle>).
 * Returns [{ url, text, title }] — one entry per visible message. Private
 * channels and channels with previews disabled return [] (the page contains
 * no message widgets). Blocks are delimited by their data-post attribute,
 * which only message divs carry.
 */
export function parseTelegramPreview(html, channel) {
  const messages = [];
  const blocks = html.matchAll(
    /<div[^>]+data-post="([^"]+)"[^>]*>([\s\S]*?)(?=<div[^>]+data-post=|$)/g,
  );
  for (const [, post, body] of blocks) {
    const textMatch = body.match(
      /<div[^>]+class="[^"]*tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    );
    const text = decodeHtmlEntities(textMatch?.[1] || "");
    if (!text) continue;
    const [, id] = post.match(/(\d+)$/) || [];
    if (!id) continue;
    messages.push({
      url: `https://t.me/${channel}/${id}`,
      text,
      title: text.split("\n")[0].slice(0, 240),
    });
  }
  return messages;
}

async function fetchText(url, fetchFn) {
  const response = await fetchFn(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.text();
}

export async function scanTelegramChannel(channel, { fetchFn = fetch } = {}) {
  const html = await fetchText(`https://t.me/s/${channel}`, fetchFn);
  return parseTelegramPreview(html, channel);
}

export function parseYouTubeSearch(json) {
  return (json?.items || [])
    .filter((item) => item.id?.videoId && item.snippet)
    .map((item) => ({
      url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
      title: item.snippet.title || "",
      text: `${item.snippet.title || ""}\n${item.snippet.description || ""}`,
      channelTitle: item.snippet.channelTitle || "",
      publishedAt: item.snippet.publishedAt || null,
    }));
}

export async function scanYouTube(query, apiKey, { fetchFn = fetch } = {}) {
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "25");
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);
  return parseYouTubeSearch(JSON.parse(await fetchText(url, fetchFn)));
}

export function leakQueryFor(keyword) {
  return `${keyword} free download`;
}

/**
 * Scans every enabled watchlist. Sources without configured credentials are
 * skipped, so partial setups degrade instead of failing. Returns a summary
 * per tenant: { scanned, newFindings, updatedFindings, errors }.
 */
export async function runPiracyScan({
  db,
  env = process.env,
  fetchFn = fetch,
  logger = defaultLogger,
  notify = notifyPlatform,
  now = new Date(),
  tenantId = null,
}) {
  const youtubeKey = env.YOUTUBE_API_KEY || null;
  const watchlistRows = await db
    .select()
    .from(piracyWatchlists)
    .where(
      tenantId
        ? and(eq(piracyWatchlists.enabled, true), eq(piracyWatchlists.tenantId, tenantId))
        : eq(piracyWatchlists.enabled, true),
    );
  const summary = { watchlists: 0, scanned: 0, newFindings: 0, updatedFindings: 0, errors: 0 };

  for (const watchlist of watchlistRows) {
    summary.watchlists += 1;
    const candidates = [];
    const errors = [];

    for (const channel of watchlist.telegramChannels) {
      try {
        for (const message of await scanTelegramChannel(channel, { fetchFn })) {
          const matched = matchKeywords(message.text, watchlist.keywords);
          if (matched.length)
            candidates.push({
              source: "telegram",
              url: message.url,
              title: message.title,
              snippet: message.text.slice(0, 2000),
              matchedKeywords: matched,
            });
        }
        summary.scanned += 1;
      } catch (error) {
        errors.push(`${channel}: ${error.message}`);
      }
    }

    if (youtubeKey) {
      const queries = watchlist.keywords
        .slice(0, MAX_QUERIES_PER_WATCHLIST)
        .map((keyword) => leakQueryFor(keyword));
      for (const query of queries) {
        try {
          for (const video of await scanYouTube(query, youtubeKey, { fetchFn })) {
            const matched = matchKeywords(video.text, watchlist.keywords);
            if (matched.length)
              candidates.push({
                source: "youtube",
                url: video.url,
                title: video.title.slice(0, 240),
                snippet: video.text.slice(0, 2000),
                matchedKeywords: matched,
              });
          }
          summary.scanned += 1;
        } catch (error) {
          errors.push(`youtube "${query}": ${error.message}`);
        }
      }
    }

    for (const error of errors) {
      summary.errors += 1;
      logger.warn({ watchlistId: watchlist.id, error }, "piracy scan source failed");
    }

    for (const candidate of candidates) {
      const urlHash = urlHashOf(candidate.url);
      if (!urlHash) continue;
      const [existing] = await db
        .select({ id: piracyFindings.id })
        .from(piracyFindings)
        .where(
          and(eq(piracyFindings.tenantId, watchlist.tenantId), eq(piracyFindings.urlHash, urlHash)),
        )
        .limit(1);
      if (existing) {
        await db
          .update(piracyFindings)
          .set({ lastSeenAt: now, lastCheckedAt: now, updatedAt: now })
          .where(eq(piracyFindings.id, existing.id));
        summary.updatedFindings += 1;
      } else {
        await db.insert(piracyFindings).values({
          tenantId: watchlist.tenantId,
          watchlistId: watchlist.id,
          source: candidate.source,
          url: candidate.url,
          urlHash,
          title: candidate.title,
          snippet: candidate.snippet,
          matchedKeywords: candidate.matchedKeywords,
          firstSeenAt: now,
          lastSeenAt: now,
          lastCheckedAt: now,
        });
        summary.newFindings += 1;
      }
    }

    if (summary.newFindings > 0) {
      await Promise.resolve(
        notify(db, {
          type: "piracy_finding",
          title: "New piracy finding detected",
          body: `Scan of "${watchlist.name}" surfaced ${summary.newFindings} new findings`,
          tenantId: watchlist.tenantId,
          actionUrl: "/dashboard/piracy",
          dedupeKey: `piracy:${watchlist.id}:${now.toISOString().slice(0, 13)}`,
          roles: ["super_admin", "operations_admin", "support_admin"],
        }),
      ).catch((error) => logger.warn({ error }, "piracy finding notification failed"));
    }
  }
  return summary;
}

/** Web findings go stale when the link dies; verified with a plain fetch. */
export async function expireDeadWebFindings({
  db,
  fetchFn = fetch,
  logger = defaultLogger,
  now = new Date(),
  batchSize = 50,
}) {
  const rows = await db
    .select({ id: piracyFindings.id, url: piracyFindings.url })
    .from(piracyFindings)
    .where(and(eq(piracyFindings.source, "web"), eq(piracyFindings.status, "active")))
    .limit(batchSize);
  let expired = 0;
  for (const row of rows) {
    try {
      const response = await fetchFn(row.url, {
        method: "HEAD",
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
      });
      if (response.status >= 400) throw new Error(`status ${response.status}`);
      await db
        .update(piracyFindings)
        .set({ lastCheckedAt: now, updatedAt: now })
        .where(eq(piracyFindings.id, row.id));
    } catch {
      expired += 1;
      await db
        .update(piracyFindings)
        .set({ status: "false_positive", lastCheckedAt: now, updatedAt: now })
        .where(eq(piracyFindings.id, row.id));
      logger.info({ findingId: row.id }, "web finding no longer resolves, closed");
    }
  }
  return { checked: rows.length, expired };
}

export function platformForUrl(url) {
  const host = (normalizeUrl(url) || "").replace(/^https?:\/\//, "");
  if (/^t\.me|telegram\.me/.test(host)) return "telegram";
  if (/youtube\.com|youtu\.be/.test(host)) return "youtube";
  if (/facebook\.com|fb\.watch/.test(host)) return "facebook";
  return "web_host";
}
