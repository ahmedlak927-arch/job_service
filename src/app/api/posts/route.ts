// app/api/posts/route.ts
import { NextRequest } from "next/server";
import { scrapeChannel } from "@/lib/telegram";
import { savePosts } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import type { TelegramPost, WorkTag } from "@/lib/types";

export const dynamic = "force-dynamic";

const WITHIN_ALLOWED = [24, 48, 72, 96] as const;
const MAX_PAGES_SAFETY = 30;

function normalize(u: string) {
  return u.toLowerCase().replace(/^@/, "").trim();
}

/** Pull the channel name back out of a `[@channel] ...` title prefix. */
function extractChannel(title: string): string {
  const m = title.match(/^\[@([^\]]+)\]/);
  return m?.[1] ?? "";
}

/** Strip the `[@channel] ` prefix from a title for display. */
function stripPrefix(title: string): string {
  return title.replace(/^\[@[^\]]+\]\s*/, "");
}

/** Convert a DB Post row into the TelegramPost shape the UI expects. */
function rowToTelegramPost(row: {
  id: number;
  title: string;
  content: string | null;
  photo: string | null;
  authorId: number;
  createdAt: Date;
}): TelegramPost {
  const channel = extractChannel(row.title);
  const text = row.content ?? stripPrefix(row.title);

  return {
    id: row.authorId,
    channel,
    url: channel
      ? `https://t.me/${channel}/${row.authorId}`
      : `https://t.me/${row.authorId}`,
    text,
    html: text,
    tag: "it-job" as WorkTag,
    score: 0,
    matchedKeywords: [],
    photos: row.photo ? [row.photo] : [],
    hasVideo: false,
    views: null,
    date: row.createdAt.toISOString(),
    dateLabel: null,
  };
}

/** Build the ChannelInfo payload the client expects (never null). */
function channelPayload(username: string) {
  return {
    username,
    title: username,
    avatar: null as string | null,
    subscribers: null as number | null,
    description: null as string | null,
  };
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const rawChannel = sp.get("channel") ?? "";
  const channel = normalize(rawChannel);
  const source = sp.get("source") ?? "scrape";

  /* ---------- resolve the window (hours) ---------- */
  const withinRaw = Number(sp.get("within"));
  const withinHours: number = (WITHIN_ALLOWED as readonly number[]).includes(
    withinRaw
  )
    ? withinRaw
    : 24;
  const sinceMs = Date.now() - withinHours * 3600_000;
  const sinceDate = new Date(sinceMs);

  /* ---------- optional page cap (poller uses maxPages=1) ---------- */
  const maxPagesRaw = Number(sp.get("maxPages"));
  const maxPages =
    Number.isFinite(maxPagesRaw) && maxPagesRaw > 0
      ? Math.min(Math.max(maxPagesRaw, 1), MAX_PAGES_SAFETY)
      : MAX_PAGES_SAFETY;

  /* ---------- Cached DB read ---------- */
  if (source === "db") {
    const stored = await prisma.post.findMany({
      where: {
        ...(channel ? { title: { startsWith: `[@${channel}]` } } : {}),
        createdAt: { gte: sinceDate },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    return Response.json({
      channel: channel ? channelPayload(channel) : null,
      posts: stored.map(rowToTelegramPost),
      nextBefore: null,
      fromCache: true,
      within: withinHours,
    });
  }

  /* ---------- Live scrape ---------- */
  if (!channel) {
    return Response.json({ error: "channel required" }, { status: 400 });
  }

  const beforeParam = sp.get("before");
  const before = beforeParam ? Number(beforeParam) : undefined;

  try {
    const collected: TelegramPost[] = [];
    let cursor: number | undefined = before;
    let pagesFetched = 0;
    let crossedCutoff = false;
    let lastNextBefore: number | null = null;

    while (pagesFetched < maxPages && !crossedCutoff) {
      const result = await scrapeChannel(channel, 1, cursor);

      if (result.posts.length) {
        await savePosts(channel, result.posts);
      }

      if (!result.posts.length) {
        lastNextBefore = null;
        break;
      }

      for (const p of result.posts) {
        const t = p.date ? new Date(p.date).getTime() : Number.POSITIVE_INFINITY;
        if (t < sinceMs) {
          crossedCutoff = true;
          break;
        }
        collected.push(p);
      }

      cursor = result.nextBefore ?? undefined;
      lastNextBefore = result.nextBefore ?? null;
      pagesFetched += 1;

      if (!cursor) break;
    }

    const itPosts = collected.filter((p) => p.tag === "it-job");

    return Response.json({
      channel: channelPayload(channel),
      posts: itPosts,
      nextBefore: crossedCutoff ? null : lastNextBefore,
      fromCache: false,
      within: withinHours,
      pagesFetched,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load channel.";

    const stored = await prisma.post.findMany({
      where: {
        title: { startsWith: `[@${channel}]` },
        createdAt: { gte: sinceDate },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    });

    if (stored.length) {
      return Response.json({
        channel: channelPayload(channel),
        posts: stored.map(rowToTelegramPost),
        nextBefore: null,
        fromCache: true,
        within: withinHours,
        warning: message,
      });
    }

    return Response.json({ error: message }, { status: 400 });
  }
}