// app/channel/actions.ts
"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const channelSchema = z.object({
  username: z
    .string()
    .min(1, "Username is required")
    .transform((v) => v.replace(/^@/, "").trim())
    .refine((v) => /^[A-Za-z0-9_]{3,64}$/.test(v), {
      message: "Only letters, numbers, underscore (3-64). Example: Allone009",
    }),
});

export async function createChannel(formData: FormData) {
  const parsed = channelSchema.safeParse({ username: formData.get("username") });
  if (!parsed.success) return;
  try {
    await prisma.channel.create({ data: { username: parsed.data.username } });
  } catch {}
  revalidatePath("/channel");
}

export async function updateChannel(formData: FormData) {
  const id = Number(formData.get("id"));
  const parsed = channelSchema.safeParse({ username: formData.get("username") });
  if (!parsed.success || !id) return;
  try {
    await prisma.channel.update({
      where: { id },
      data: { username: parsed.data.username },
    });
  } catch {}
  revalidatePath("/channel");
}

export async function deleteChannel(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  try {
    await prisma.channel.delete({ where: { id } });
  } catch {}
  revalidatePath("/channel");
}

export async function saveCheckedChannels(formData: FormData) {
  const checkedIds: number[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("ch_")) {
      const id = Number(value);
      if (Number.isFinite(id) && id > 0) checkedIds.push(id);
    }
  }

  try {
    await prisma.$transaction([
      prisma.channel.updateMany({
        where: { id: { in: checkedIds } },
        data: { checked: true },
      }),
      prisma.channel.updateMany({
        where: { id: { notIn: checkedIds } },
        data: { checked: false },
      }),
    ]);
  } catch {}
  revalidatePath("/channel");
}