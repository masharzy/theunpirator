import { describe, expect, it, vi } from "vitest";
import { piracyWatchlists } from "@unpirator/db/schema";
import {
  expireDeadWebFindings,
  leakQueryFor,
  matchKeywords,
  normalizeUrl,
  parseTelegramPreview,
  parseYouTubeSearch,
  platformForUrl,
  runPiracyScan,
  urlHashOf,
} from "../src/services/piracy-scanner.js";
import { generateTakedownNotice } from "../src/services/takedown-notices.js";

const telegramHtml = `
<div class="tgme_widget_message_wrap js-widget_message_wrap">
<div class="tgme_widget_message text_not_supported_wrap js-message_text" data-post="freecoursesbd/120" data-view="forwards">
<div class="tgme_widget_message_text js-message_text" dir="auto">🔥 10 Minute School <b>HSC 24 full course FREE</b> download link below 👇<br/>Drive: https://drive.google.com/file/d/abc</div>
</div>
<div class="tgme_widget_message text_not_supported_wrap js-message_text" data-post="freecoursesbd/121">
<div class="tgme_widget_message_text js-message_text" dir="auto">Join our group for more updates</div>
</div>
</div>`;

describe("piracy scanner", () => {
  it("normalizes tracking parameters out of URLs for dedupe", () => {
    expect(normalizeUrl("https://Drive.Google.com/file/d/abc?utm_source=fb&ref=x#top")).toBe(
      "https://drive.google.com/file/d/abc",
    );
    expect(normalizeUrl("https://example.com/path/")).toBe("https://example.com/path");
    expect(normalizeUrl("ftp://example.com")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });

  it("hashes the normalized form so variants dedupe to one finding", () => {
    const a = urlHashOf("https://t.me/freecoursesbd/120?utm_source=x");
    const b = urlHashOf("https://t.me/freecoursesbd/120");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches keywords case-insensitively and dedupes hits", () => {
    expect(matchKeywords("HSC 24 FULL Course free", ["hsc 24", "full course", "hsc 24"])).toEqual([
      "hsc 24",
      "full course",
    ]);
    expect(matchKeywords(null, ["hsc"])).toEqual([]);
  });

  it("parses telegram web previews into messages with canonical URLs", () => {
    const messages = parseTelegramPreview(telegramHtml, "freecoursesbd");
    expect(messages).toHaveLength(2);
    expect(messages[0].url).toBe("https://t.me/freecoursesbd/120");
    expect(messages[0].text).toContain("HSC 24 full course FREE");
    expect(messages[0].text).not.toContain("<b>");
  });

  it("maps youtube search responses to candidate findings", () => {
    const items = parseYouTubeSearch({
      items: [
        {
          id: { videoId: "abc123" },
          snippet: { title: "HSC free course", description: "dl link", channelTitle: "X" },
        },
        { id: {}, snippet: { title: "no video id" } },
      ],
    });
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://www.youtube.com/watch?v=abc123");
    expect(items[0].text).toContain("dl link");
  });

  it("maps URLs to takedown platforms", () => {
    expect(platformForUrl("https://t.me/foo/1")).toBe("telegram");
    expect(platformForUrl("https://youtu.be/abc")).toBe("youtube");
    expect(platformForUrl("https://fb.watch/xyz")).toBe("facebook");
    expect(platformForUrl("https://unknown-host.net/dl")).toBe("web_host");
  });

  it("builds leak-search queries from keywords", () => {
    expect(leakQueryFor("Unmesh HSC course")).toBe("Unmesh HSC course free download");
  });

  it("runPiracyScan persists only matching candidates and dedupes by url hash", async () => {
    const watchlist = {
      id: "wl-1",
      tenantId: "tenant-1",
      name: "HSC watchlist",
      enabled: true,
      keywords: ["hsc 24 full course"],
      telegramChannels: ["freecoursesbd"],
    };
    const inserted = [];
    const fakeDb = {
      select: () => ({
        from: (table) => {
          const rows = table === piracyWatchlists ? [watchlist] : [];
          const chain = {
            where: () => chain,
            limit: () => Promise.resolve(rows),
            then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
          };
          return chain;
        },
      }),
      insert: () => ({
        values: (values) => {
          inserted.push(values);
          return { returning: async () => [values] };
        },
      }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    };
    const fetchFn = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      text: async () => (String(url).startsWith("https://t.me/") ? telegramHtml : "{}"),
    }));
    const notify = vi.fn();

    const summary = await runPiracyScan({
      db: fakeDb,
      env: {},
      fetchFn,
      logger: { warn: vi.fn(), info: vi.fn() },
      notify,
      tenantId: "tenant-1",
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(summary.scanned).toBe(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].source).toBe("telegram");
    expect(inserted[0].url).toBe("https://t.me/freecoursesbd/120");
    expect(inserted[0].tenantId).toBe("tenant-1");
    expect(inserted[0].matchedKeywords).toContain("hsc 24 full course");
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe("takedown notices", () => {
  const finding = {
    url: "https://t.me/freecoursesbd/120",
    title: "HSC 24 full course free",
    firstSeenAt: new Date("2026-09-30T00:00:00Z"),
  };
  const caseRow = { platform: "telegram" };
  const tenant = { name: "10 Minute School Ltd" };
  const account = { email: "legal@example.com" };

  it("generates a DMCA email with the infringing URL and complainant", () => {
    const notice = generateTakedownNotice({ finding, caseRow, tenant, account });
    expect(notice.platform).toBe("telegram");
    expect(notice.channel).toBe("email");
    expect(notice.to).toBe("dmca@telegram.org");
    expect(notice.body).toContain("https://t.me/freecoursesbd/120");
    expect(notice.body).toContain("10 Minute School Ltd");
    expect(notice.body).toContain("legal@example.com");
    expect(notice.body).toContain("penalty of perjury");
  });

  it("routes youtube to the web form with submission instructions", () => {
    const notice = generateTakedownNotice({
      finding: { ...finding, url: "https://www.youtube.com/watch?v=abc" },
      caseRow: { platform: "youtube" },
      tenant,
      account,
    });
    expect(notice.channel).toBe("web_form");
    expect(notice.instructions).toContain("copyright_complaint");
  });
});

describe("expireDeadWebFindings", () => {
  it("closes web findings that no longer resolve", async () => {
    const rows = [
      { id: "f1", url: "https://dead.example/x" },
      { id: "f2", url: "https://alive.example/y" },
    ];
    const updates = [];
    const fakeDb = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }),
      update: () => ({
        set: (values) => ({ where: async () => updates.push(values) }),
      }),
    };
    const fetchFn = vi.fn(async (url) => {
      if (String(url).includes("dead")) throw new Error("ENOTFOUND");
      return { status: 200 };
    });
    const result = await expireDeadWebFindings({
      db: fakeDb,
      fetchFn,
      logger: { info: vi.fn(), warn: vi.fn() },
    });
    expect(result.checked).toBe(2);
    expect(result.expired).toBe(1);
  });
});
