// app/channel/page.tsx
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export const dynamic = "force-dynamic";

/* ---------------- validation ---------------- */
const channelSchema = z.object({
  username: z
    .string()
    .min(1, "Username is required")
    .transform((v) => v.replace(/^@/, "").trim())
    .refine((v) => /^[A-Za-z0-9_]{3,64}$/.test(v), {
      message: "Only letters, numbers, underscore (3-64). Example: Allone009",
    }),
});

/* ---------------- server actions ---------------- */
async function createChannel(formData: FormData) {
  "use server";
  const parsed = channelSchema.safeParse({ username: formData.get("username") });
  if (!parsed.success) return;
  try {
    await prisma.channel.create({ data: { username: parsed.data.username } });
  } catch {
    /* duplicate or db error - ignored */
  }
  revalidatePath("/channel");
}

async function updateChannel(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  const parsed = channelSchema.safeParse({ username: formData.get("username") });
  if (!parsed.success || !id) return;
  try {
    await prisma.channel.update({
      where: { id },
      data: { username: parsed.data.username },
    });
  } catch {
    /* duplicate or db error - ignored */
  }
  revalidatePath("/channel");
}

async function deleteChannel(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  if (!id) return;
  try {
    await prisma.channel.delete({ where: { id } });
  } catch {
    /* ignored */
  }
  revalidatePath("/channel");
}

/* ---------------- page ---------------- */
export default async function ChannelPage() {
  const channels = await prisma.channel.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-sky-500 selection:text-white py-12 px-4 sm:px-6">
      <main className="mx-auto max-w-2xl space-y-8">
        
        {/* Header Section */}
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-900/40 via-slate-900 to-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />
          
          <div className="flex items-center justify-between relative z-10">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-400 border border-sky-500/20 mb-2">
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.228-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.781-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.14.12.098.153.228.166.331.011.095.025.312.011.482z"/>
                </svg>
                Admin Pannel
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white">
                Managed Channels
              </h1>
              <p className="text-sm text-slate-400">
                Register and organize your broadcast spaces securely.
              </p>
            </div>
            
            {/* Counter Badge */}
            <div className="flex flex-col items-center justify-center rounded-xl bg-slate-900/80 border border-slate-800 px-4 py-3 shadow-inner">
              <span className="text-2xl font-black text-sky-400">{channels.length}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Active</span>
            </div>
          </div>
        </header>

        {/* Add Channel Form Card */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 p-5 shadow-lg backdrop-blur-md">
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Add New Channel
          </h2>
          <form action={createChannel} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500 font-mono text-sm">
                @
              </div>
              <input
                name="username"
                placeholder="Allone009"
                required
                className="w-full rounded-lg bg-slate-950 border border-slate-800 pl-8 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 transition-all font-mono"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-sky-600/20 hover:bg-sky-500 active:scale-[0.98] transition-all"
            >
              + Add Channel
            </button>
          </form>
        </div>

        {/* Channels List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400 px-1">
            <span>CHANNELS DIRECTORY</span>
            <span>ACTIONS</span>
          </div>

          {channels.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-800 p-12 text-center bg-slate-900/20">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-slate-500 mb-3">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <p className="text-sm font-medium text-slate-300">No channels added yet</p>
              <p className="text-xs text-slate-500 mt-1">Get started by entering a username above.</p>
            </div>
          )}

          <ul className="space-y-3">
            {channels.map((c) => (
              <li
                key={c.id}
                className="group flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 p-3.5 hover:border-slate-700 hover:bg-slate-900/80 transition-all shadow-sm"
              >
                {/* Edit form (inline) */}
                <form action={updateChannel} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500 font-mono text-xs">
                      @
                    </span>
                    <input
                      name="username"
                      defaultValue={c.username}
                      className="w-full rounded-lg bg-slate-950/60 border border-slate-800 pl-7 pr-3 py-1.5 text-sm text-slate-200 focus:bg-slate-950 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/20 font-mono transition-all"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                  >
                    Save
                  </button>
                </form>

                {/* Actions grouping */}
                <div className="flex items-center justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                  <a
                    href={`https://t.me/${c.username}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 px-3 py-1.5 text-xs font-medium text-sky-400 hover:bg-sky-500/20 transition-colors"
                  >
                    <span>Open</span>
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>

                  {/* Delete form */}
                  <form action={deleteChannel}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}