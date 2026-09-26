import { prisma } from "@/lib/prisma";
import type { TelegramPost, ChannelInfo, WorkTag } from "@/lib/types";

/** Tags we want to persist. Add "job" if you also want non-IT work posts. */
const SAVE_TAGS: WorkTag[] = ["it-job"];

export async function savePosts(channel: string, posts: TelegramPost[]) {
  if (!posts.length) return;

  const username = channel.toLowerCase().replace(/^@/, "");

  // Only keep IT-related posts
  const itPosts = posts.filter((p) => SAVE_TAGS.includes(p.tag));
  if (!itPosts.length) return;

  // Dedupe against what's already stored for this channel
  const existing = await prisma.post.findMany({
    where: { title: { startsWith: `[@${username}]` } },
    select: { authorId: true },
  });
  const knownIds = new Set(existing.map((p) => p.authorId));

  const rows = itPosts
    .filter((p) => !knownIds.has(p.id))
    .map((p) => ({
      title: `[@${username}] ${firstLine(p.text) || `IT Post #${p.id}`}`,
      content: p.text ?? null,
      authorId: p.id,
      photo: p.photos?.[0] ?? null,
    }));

  if (!rows.length) return;

  await prisma.post.createMany({ data: rows });
}

function firstLine(text: string | null | undefined): string {
  if (!text) return "";
  const line = text.split("\n").find((l) => l.trim().length > 0);
  return (line ?? "").trim().slice(0, 200);
}

export async function saveChannel(_info: ChannelInfo): Promise<void> {
  // no-op — Post-only schema
}