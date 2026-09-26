// src/components/dashboard.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import Link from "next/link";
import type { ChannelInfo, PostsResponse, TelegramPost, WorkTag } from "@/lib/types";
import { saveCheckedChannels } from "../app/channel/actions";

type FilterMode = "it-job" | "work" | "all";
type WithinHours = 24 | 48 | 72 | 96;

type ChannelRow = {
  id: number;
  username: string;
  checked: boolean;
};

const SUGGESTED = ["telegram", "durov"];
const POLL_INTERVAL_MS = 30_000;
const WITHIN_OPTIONS: WithinHours[] = [24, 48, 72, 96];
const WITHIN_STORAGE_KEY = "worksignal:within";

function formatWhen(dateValue: string | null, label: string | null) {
  if (dateValue) {
    const date = new Date(dateValue);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en-GB", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }).format(date);
    }
  }
  return label || "Date hidden";
}

function tagLabel(tag: WorkTag) {
  if (tag === "it-job") return "IT job";
  if (tag === "job") return "Work";
  return "General";
}

export function Dashboard() {
  const [channelInput, setChannelInput] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("it-job");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [posts, setPosts] = useState<TelegramPost[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);

  const [newCount, setNewCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const [within, setWithin] = useState<WithinHours>(24);
  const [withinReady, setWithinReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(WITHIN_STORAGE_KEY);
      const n = raw ? Number(raw) : NaN;
      if (WITHIN_OPTIONS.includes(n as WithinHours)) setWithin(n as WithinHours);
    } catch {}
    finally {
      setWithinReady(true);
    }
  }, []);

  useEffect(() => {
    if (!withinReady) return;
    try {
      localStorage.setItem(WITHIN_STORAGE_KEY, String(within));
    } catch {}
  }, [within, withinReady]);

  async function loadPosts(username: string, before?: number) {
    const params = new URLSearchParams({
      channel: username,
      within: String(within),
    });
    if (before) params.set("before", String(before));
    const response = await fetch(`/api/posts?${params.toString()}`);
    const data = (await response.json()) as PostsResponse & { error?: string };
    if (!response.ok) throw new Error(data.error || "Could not load posts.");
    return data;
  }

  const refreshSilently = useCallback(
    async (username: string) => {
      if (isPolling) return;
      setIsPolling(true);
      try {
        const params = new URLSearchParams({
          channel: username,
          within: String(within),
          maxPages: "1",
        });
        const response = await fetch(`/api/posts?${params.toString()}`);
        if (!response.ok) return;
        const data = (await response.json()) as PostsResponse;

        setPosts((current) => {
          const known = new Set(current.map((p) => p.id));
          const fresh = data.posts.filter((p) => !known.has(p.id));
          if (fresh.length > 0) {
            const merged = [...fresh, ...current].sort((a, b) => b.id - a.id);
            setNewCount((n) => n + fresh.length);
            return merged;
          }
          return current;
        });

        if (data.channel) setChannel(data.channel);
        setLastSyncAt(Date.now());
      } catch {}
      finally {
        setIsPolling(false);
      }
    },
    [isPolling, within]
  );

  useEffect(() => {
    if (!channel) return;
    const id = setInterval(() => {
      void refreshSilently(channel.username);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [channel, refreshSilently]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    const username = channelInput.trim();
    if (!username) {
      setError("Enter a public Telegram channel.");
      return;
    }

    setLoading(true);
    setError(null);
    setNewCount(0);

    try {
      const cacheRes = await fetch(
        `/api/posts?channel=${encodeURIComponent(username)}&source=db&within=${within}`
      );
      if (cacheRes.ok) {
        const cached = (await cacheRes.json()) as PostsResponse;
        if (cached.posts?.length) {
          setPosts(cached.posts);
          setNextBefore(null);
        }
      }

      const data = await loadPosts(username);
      setChannel(data.channel);
      setPosts(data.posts);
      setNextBefore(data.nextBefore);
      setLastSyncAt(Date.now());
    } catch (err) {
      setChannel(null);
      setPosts([]);
      setNextBefore(null);
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function onLoadMore() {
    if (!channel || !nextBefore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const data = await loadPosts(channel.username, nextBefore);
      setPosts((current) => {
        const ids = new Set(current.map((post) => post.id));
        return [...current, ...data.posts.filter((post) => !ids.has(post.id))];
      });
      setNextBefore(data.nextBefore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load older posts.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function openCheckModal() {
    setModalOpen(true);
    setModalError(null);
    setModalLoading(true);
    try {
      const res = await fetch("/api/channels", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load channels.");
      const data = (await res.json()) as ChannelRow[];
      setChannels(data);
      setSelected(new Set(data.filter((c) => c.checked).map((c) => c.id)));
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Load failed.");
    } finally {
      setModalLoading(false);
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSaveCheck() {
    startSaving(async () => {
      const formData = new FormData();
      for (const id of selected) formData.set(`ch_${id}`, String(id));
      await saveCheckedChannels(formData);

      const selectedRows = channels.filter((c) => selected.has(c.id));

      let first: PostsResponse | null = null;
      let firstUsername: string | null = null;
      for (const row of selectedRows) {
        try {
          const data = await loadPosts(row.username);
          if (!first) {
            first = data;
            firstUsername = row.username;
          }
        } catch {}
      }

      if (first) {
        if (first.channel) {
          setChannel(first.channel);
          setChannelInput(first.channel.username);
        } else if (firstUsername) {
          setChannelInput(firstUsername);
        }
        setPosts(first.posts);
        setNextBefore(first.nextBefore);
        setLastSyncAt(Date.now());
        setNewCount(0);
      }

      setModalOpen(false);
    });
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "work"
            ? post.tag === "it-job" || post.tag === "job"
            : post.tag === "it-job";
      const matchesQuery = !needle || post.text.toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [filter, posts, query]);

  const stats = useMemo(
    () => ({
      total: posts.length,
      it: posts.filter((post) => post.tag === "it-job").length,
      jobs: posts.filter((post) => post.tag === "job").length,
    }),
    [posts]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white relative overflow-hidden font-sans">
      {/* Background Decorative Orbs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 space-y-8">
        
        {/* ---------- Topbar ---------- */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-xl bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 shadow-2xl">
          <Link href="/" className="flex items-center gap-3 group text-inherit no-underline">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              WS
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">Public channels</p>
              <h1 className="text-lg font-bold tracking-tight text-white">WorkSignal</h1>
            </div>
          </Link>

          <nav className="flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/60">
            
            <Link
              href="/saved"
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all"
            >
              ★ Saved
            </Link>
            <Link
              href="/channel"
              className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition-all"
            >
              ⚙ Channel
            </Link>
          </nav>

          <p className="hidden lg:block text-xs text-slate-400 max-w-xs text-right leading-relaxed">
            Reads the public Telegram preview. No login. IT / work posts first.
          </p>
        </header>

        {/* ---------- Hero ---------- */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center py-4">
          <div className="lg:col-span-5 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              Telegram Intelligence
            </div>
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Pull a channel. <br />
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                Keep the IT work.
              </span>
            </h2>
            <p className="text-slate-300 text-base leading-relaxed">
              Paste a public username. WorkSignal scrapes recent posts from
              Telegram&apos;s public web preview and highlights hiring, developer,
              and tech roles instantly.
            </p>
          </div>

          <div className="lg:col-span-7">
            <form
              onSubmit={onSearch}
              className="backdrop-blur-xl bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5"
            >
              <div className="space-y-2">
                <label htmlFor="channel" className="text-sm font-semibold text-slate-200">
                  Target Channel
                </label>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-slate-950/80 border border-slate-800 rounded-2xl p-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                  <span className="pl-3 text-slate-400 font-semibold text-lg">@</span>
                  <input
                    id="channel"
                    value={channelInput}
                    onChange={(event) => setChannelInput(event.target.value)}
                    placeholder="channelname"
                    autoComplete="off"
                    spellCheck={false}
                    className="bg-transparent border-none outline-none text-white placeholder-slate-600 flex-1 px-1 text-base w-full sm:w-auto"
                  />
                  
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                    <select
                      aria-label="Check during"
                      value={within}
                      onChange={(e) => setWithin(Number(e.target.value) as WithinHours)}
                      className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-xl px-3 py-2.5 outline-none focus:border-indigo-500 transition-all cursor-pointer"
                    >
                      {WITHIN_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {h}h
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={openCheckModal}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm border border-slate-700 transition-all flex items-center gap-1.5 whitespace-nowrap"
                    >
                      ✓ Check
                    </button>

                    <button
                      type="submit"
                      disabled={loading}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all whitespace-nowrap cursor-pointer"
                    >
                      {loading ? "Scanning…" : "Scan posts"}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-slate-400 font-medium">Suggestions:</span>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="text-xs px-3 py-1 rounded-full bg-slate-800/80 hover:bg-indigo-600/20 hover:border-indigo-500/40 text-slate-300 border border-slate-700/80 transition-all cursor-pointer"
                      onClick={() => setChannelInput(name)}
                    >
                      @{name}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>
        </section>

        {error ? (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {error}
          </div>
        ) : null}

        {/* ---------- Live status ---------- */}
        {channel ? (
          <div className="flex flex-wrap items-center justify-between gap-4 px-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-300 bg-slate-900/60 border border-slate-800 px-4 py-2 rounded-xl">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: isPolling ? "#f59e0b" : "#22c55e" }}
              />
              {isPolling
                ? "Checking for new posts…"
                : lastSyncAt
                  ? `Live • updated ${new Date(lastSyncAt).toLocaleTimeString()} • last ${within}h`
                  : `Live • last ${within}h`}
            </div>

            {newCount > 0 ? (
              <button
                type="button"
                onClick={() => setNewCount(0)}
                className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-semibold animate-bounce shadow-lg shadow-red-500/20 cursor-pointer"
              >
                🔴 {newCount} new post{newCount > 1 ? "s" : ""} available
              </button>
            ) : null}
          </div>
        ) : null}

        {/* ---------- Channel card / empty guide ---------- */}
        {channel ? (
          <section className="backdrop-blur-xl bg-slate-900/70 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-5 flex items-center gap-4">
              {channel.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={channel.avatar} alt="" className="w-16 h-16 rounded-2xl object-cover border border-slate-700 shadow-md" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-md">
                  {(channel.title ?? channel.username).slice(0, 1)}
                </div>
              )}
              <div className="space-y-1 overflow-hidden">
                <h3 className="text-xl font-bold text-white truncate">{channel.title ?? channel.username}</h3>
                <p className="text-sm font-medium text-indigo-400">@{channel.username}</p>
                {channel.description ? <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{channel.description}</p> : null}
              </div>
            </div>

            <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6">
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 text-center">
                <dt className="text-xs text-slate-400 font-medium uppercase tracking-wider">Subscribers</dt>
                <dd className="text-lg font-bold text-white mt-1">{channel.subscribers ?? "—"}</dd>
              </div>
              <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-4 text-center">
                <dt className="text-xs text-slate-400 font-medium uppercase tracking-wider">Fetched</dt>
                <dd className="text-lg font-bold text-white mt-1">{stats.total}</dd>
              </div>
              <div className="bg-indigo-950/30 border border-indigo-900/40 rounded-2xl p-4 text-center">
                <dt className="text-xs text-indigo-300 font-medium uppercase tracking-wider">IT jobs</dt>
                <dd className="text-lg font-bold text-indigo-400 mt-1">{stats.it}</dd>
              </div>
              <div className="bg-purple-950/30 border border-purple-900/40 rounded-2xl p-4 text-center">
                <dt className="text-xs text-purple-300 font-medium uppercase tracking-wider">Other work</dt>
                <dd className="text-lg font-bold text-purple-400 mt-1">{stats.jobs}</dd>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6 py-6">
            <article className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 space-y-3 relative overflow-hidden group hover:border-slate-700 transition-all">
              <span className="text-4xl font-extrabold text-indigo-500/20 group-hover:text-indigo-500/40 transition-colors">01</span>
              <h3 className="text-lg font-bold text-white">Public only</h3>
              <p className="text-sm text-slate-400 leading-relaxed">Works with channels that have a t.me/s preview. Private chats stay closed.</p>
            </article>
            <article className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 space-y-3 relative overflow-hidden group hover:border-slate-700 transition-all">
              <span className="text-4xl font-extrabold text-indigo-500/20 group-hover:text-indigo-500/40 transition-colors">02</span>
              <h3 className="text-lg font-bold text-white">IT-first filter</h3>
              <p className="text-sm text-slate-400 leading-relaxed">Developer, React, backend, cybersecurity, and hiring language get tagged.</p>
            </article>
            <article className="backdrop-blur-xl bg-slate-900/40 border border-slate-800/80 rounded-3xl p-6 space-y-3 relative overflow-hidden group hover:border-slate-700 transition-all">
              <span className="text-4xl font-extrabold text-indigo-500/20 group-hover:text-indigo-500/40 transition-colors">03</span>
              <h3 className="text-lg font-bold text-white">Open the original</h3>
              <p className="text-sm text-slate-400 leading-relaxed">Every card links back to the Telegram post so you can apply from the source.</p>
            </article>
          </section>
        )}

        {/* ---------- Toolbar + posts ---------- */}
        {posts.length > 0 ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 backdrop-blur-xl bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                {(
                  [
                    ["it-job", "IT work"],
                    ["work", "All work"],
                    ["all", "Every post"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                      filter === value
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                        : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                    }`}
                    onClick={() => setFilter(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <input
                className="w-full sm:w-80 bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-all"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search inside posts…"
              />
            </div>

            {visible.length === 0 ? (
              <div className="text-center py-16 backdrop-blur-xl bg-slate-900/40 border border-slate-800 rounded-3xl text-slate-400 text-sm">
                No posts match this filter. Try &ldquo;All work&rdquo; or clear search.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {visible.map((post) => (
                  <article
                    key={post.id}
                    className="backdrop-blur-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 rounded-3xl p-6 flex flex-col justify-between gap-4 shadow-xl transition-all group"
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                            post.tag === "it-job"
                              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                              : post.tag === "job"
                              ? "bg-purple-500/10 text-purple-400 border border-purple-500/20"
                              : "bg-slate-800 text-slate-400 border border-slate-700"
                          }`}
                        >
                          {tagLabel(post.tag)}
                        </span>
                        <time className="text-xs text-slate-500 font-medium">
                          {formatWhen(post.date, post.dateLabel)}
                        </time>
                      </div>

                      {post.photos?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.photos[0]}
                          alt=""
                          className="w-full h-48 object-cover rounded-2xl border border-slate-800 group-hover:scale-[1.01] transition-transform"
                        />
                      ) : null}

                      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap line-clamp-6">
                        {post.text || (post.hasVideo ? "Video post" : "Media post")}
                      </p>

                      {post.matchedKeywords?.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {post.matchedKeywords.slice(0, 5).map((word) => (
                            <span
                              key={word}
                              className="px-2.5 py-0.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-400 text-xs font-mono"
                            >
                              {word}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-800/80 text-xs">
                      <span className="text-slate-500 font-medium">
                        {post.views ? `${post.views} views` : "No views"}
                      </span>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors"
                      >
                        Open in Telegram →
                      </a>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {nextBefore ? (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className="px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-semibold text-sm shadow-lg disabled:opacity-50 transition-all cursor-pointer"
                >
                  {loadingMore ? "Loading older posts…" : "Load older posts"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ---------- Check modal ---------- */}
        {modalOpen ? (
          <div
            className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => !isSaving && setModalOpen(false)}
          >
            <div
              className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-white">Select channels — last {within}h</h2>

              {modalError ? (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
                  {modalError}
                </p>
              ) : null}

              {modalLoading ? (
                <p className="text-sm text-slate-500 text-center py-8">Loading channels…</p>
              ) : channels.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">No channels in the database.</p>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {channels.map((c) => {
                    const isOn = selected.has(c.id);
                    return (
                      <li key={c.id}>
                        <label
                          className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${
                            isOn
                              ? "bg-indigo-600/10 border-indigo-500/40 text-white"
                              : "bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-800/40"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isOn}
                              onChange={() => toggle(c.id)}
                              className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-slate-900"
                            />
                            <span className="font-medium text-sm">@{c.username}</span>
                          </div>
                          {isOn ? (
                            <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 font-semibold">
                              checked
                            </span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSaveCheck}
                  disabled={isSaving || modalLoading}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {isSaving ? "Scanning…" : "Check"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}