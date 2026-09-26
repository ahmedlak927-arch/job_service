// app/api/channels/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const channels = await prisma.channel.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, username: true, checked: true },
    });
    return NextResponse.json(channels);
  } catch (e) {
    console.error("[/api/channels] GET failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { checkedIds?: number[] };
    const checkedIds = Array.isArray(body.checkedIds)
      ? body.checkedIds.filter((n) => Number.isFinite(n) && n > 0)
      : [];

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

    const channels = await prisma.channel.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, username: true, checked: true },
    });
    return NextResponse.json(channels);
  } catch (e) {
    console.error("[/api/channels] POST failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}