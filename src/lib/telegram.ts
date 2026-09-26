import * as cheerio from "cheerio";
import { applyClassification } from "./classify";
import type { ChannelInfo, TelegramPost } from "./types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function normalizeChannel(input: string): string {
  let value = input.trim();
  value = value.replace(/^https?:\/\/(www\.)?t\.me\/s\//i, "");
  value = value.replace(/^https?:\/\/(www\.)?t\.me\//i, "");
  value = value.replace(/^@/, "");
  value = value.split(/[/?#]/)[0] ?? "";
  return value;
}

export function isValidChannel(username: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(username);
}

function decodeCssUrl(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/url\((['"]?)(https?:\/\/[^'")]+)\1\)/i);
  return match?.[2] ?? null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPreview(channel: string, before?: number): Promise<string> {
  const url = new URL(`https://t.me/s/${channel}`);
  if (before) url.searchParams.set("before", String(before));

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (response.status === 404) {
    throw new Error("Channel not found.");
  }

  if (!response.ok) {
    throw new Error(`Telegram returned ${response.status}.`);
  }

  const html = await response.text();
  if (html.includes("tgme_page_error") || html.includes("If you have Telegram")) {
    const looksPrivate = !html.includes("tgme_widget_message");
    if (looksPrivate) {
      throw new Error("This channel is private, missing, or has no public preview.");
    }
  }

  return html;
}

function parseChannel(html: string, username: string): ChannelInfo {
  const $ = cheerio.load(html);
  const title =
    $(".tgme_channel_info_header_title")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim() || username;
  const description = $(".tgme_channel_info_description").first().text().trim();
  const avatar =
    $(".tgme_page_photo_image img").attr("src") ||
    decodeCssUrl($(".tgme_page_photo_image").attr("style")) ||
    null;

  const counters: Record<string, string> = {};
  $(".tgme_channel_info_counter").each((_, el) => {
    const node = $(el);
    const value =
      node.find(".tgme_channel_info_counter_value, .counter_value").first().text().trim();
    const type = node
      .find(".tgme_channel_info_counter_type, .counter_type")
      .first()
      .text()
      .trim()
      .toLowerCase();
    if (value && type) counters[type] = value;
    const joined = node.text().replace(/\s+/g, " ").trim();
    const fallback = joined.match(/^([\d.,]+[kmbKMB]?)\s+(subscribers|members|photos|links)/i);
    if (fallback?.[1] && fallback[2]) {
      counters[fallback[2].toLowerCase()] = fallback[1];
    }
  });

  return {
    username,
    title,
    description,
    avatar,
    subscribers: counters.subscribers ?? counters.members ?? null,
    photos: counters.photos ?? null,
    links: counters.links ?? null,
  };
}

function parsePosts(html: string, username: string): TelegramPost[] {
  const $ = cheerio.load(html);
  const posts: TelegramPost[] = [];

  $(".tgme_widget_message").each((_, el) => {
    const node = $(el);
    const dataPost = node.attr("data-post") ?? "";
    const idPart = dataPost.split("/")[1];
    const id = Number(idPart);
    if (!Number.isFinite(id)) return;

    const textHtml = node.find(".tgme_widget_message_text").first().html() ?? "";
    const text = stripHtml(textHtml);
    const time = node.find("time").first();
    const date =
      time.attr("datetime") ??
      time.attr("data-datetime") ??
      node.find(".datetime").attr("datetime") ??
      null;
    const photos: string[] = [];

    node.find(".tgme_widget_message_photo_wrap").each((__, photo) => {
      const src = decodeCssUrl($(photo).attr("style"));
      if (src) photos.push(src);
    });

    const post = applyClassification({
      id,
      channel: username,
      url: `https://t.me/${username}/${id}`,
      text,
      html: textHtml,
      date,
      dateLabel: time.text().trim() || null,
      views: node.find(".tgme_widget_message_views").first().text().trim() || null,
      photos,
      hasVideo: node.find(".tgme_widget_message_video").length > 0,
    });

    posts.push(post);
  });

  return posts.sort((a, b) => b.id - a.id);
}

export async function scrapeChannel(channel: string, pages = 2, before?: number) {
  const username = normalizeChannel(channel);
  if (!isValidChannel(username)) {
    throw new Error("Enter a valid public channel username, like @channelname.");
  }

  const pageCount = Math.min(Math.max(pages, 1), 5);
  const seen = new Set<number>();
  const posts: TelegramPost[] = [];
  let cursor = before;
  let html = "";

  for (let i = 0; i < pageCount; i += 1) {
    html = await fetchPreview(username, cursor);
    const batch = parsePosts(html, username);
    if (batch.length === 0) break;

    for (const post of batch) {
      if (!seen.has(post.id)) {
        seen.add(post.id);
        posts.push(post);
      }
    }

    const oldest = Math.min(...batch.map((post) => post.id));
    if (!Number.isFinite(oldest) || oldest === cursor) break;
    cursor = oldest;
  }

  const channelInfo = parseChannel(html, username);
  const ordered = posts.sort((a, b) => b.id - a.id);
  const nextBefore = ordered.length ? Math.min(...ordered.map((post) => post.id)) : null;

  return {
    channel: channelInfo,
    posts: ordered,
    nextBefore,
    fetched: ordered.length,
  };
}
