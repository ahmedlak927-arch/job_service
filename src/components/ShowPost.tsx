"use client";

import { useEffect, useState } from "react";
import type { TelegramPost, WorkTag } from "@/lib/types";

type FilterMode = "it-job" | "work" | "all";

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
  if (tag === "it-job") return "IT Position";
  if (tag === "job") return "General Work";
  return "General Post";
}

interface ShowPostProps {
  /** Channel username to load saved posts for. Leave empty to load all. */
  channel?: string;
}

export function ShowPost({ channel = "" }: ShowPostProps) {
  const [posts, setPosts] = useState<TelegramPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");

  const [visibleCount, setVisibleCount] = useState(9);
  const [selected, setSelected] = useState<TelegramPost | null>(null);
  const [fullImage, setFullImage] = useState<string | null>(null);

  // Clear Database states
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ source: "db" });
        if (channel) params.set("channel", channel);
        const res = await fetch(`/api/posts?${params.toString()}`);
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || "Could not load saved posts.");
        }
        const data = (await res.json()) as { posts: TelegramPost[] };
        if (!cancelled) setPosts(data.posts ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [channel]);

  // Handle database wipe execution
  const handleClearDatabase = async () => {
    setClearing(true);
    try {
      const params = new URLSearchParams({ source: "db" });
      if (channel) params.set("channel", channel);

      const res = await fetch(`/api/posts?${params.toString()}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Failed to clear the database.");
      }

      setPosts([]);
      setIsClearModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear posts.");
    } finally {
      setClearing(false);
    }
  };

  // Escape closes whichever overlay is on top
  useEffect(() => {
    if (!selected && !fullImage && !isClearModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (fullImage) setFullImage(null);
        else if (selected) setSelected(null);
        else if (isClearModalOpen) setIsClearModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [selected, fullImage, isClearModalOpen]);

  const filtered = posts.filter((post) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "work"
        ? post.tag === "it-job" || post.tag === "job"
        : post.tag === "it-job";
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || post.text.toLowerCase().includes(needle);
    return matchesFilter && matchesQuery;
  });

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500 selection:text-white p-4 sm:p-6 lg:p-8 font-sans">
      <section className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Search/Filter Toolbar */}
        <header className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 bg-slate-900/60 border border-slate-800/80 p-6 rounded-3xl backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="space-y-1 relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold tracking-wide uppercase">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
              Database Archives
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              {channel ? `@${channel}` : "All Saved Posts"}
              <span className="text-sm font-medium px-3 py-1 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700/60 shadow-inner">
                {filtered.length} total
              </span>
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 relative z-10 flex-wrap">
            {/* Filter Pills */}
            <div className="flex items-center bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 shadow-inner">
              {(
                [
                  ["all", "All"],
                  ["work", "Work"],
                  ["it-job", "IT Only"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`flex-1 sm:flex-none px-4 py-2 text-xs font-semibold rounded-xl transition-all duration-200 ${
                    filter === value
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-[1.02]"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
                  }`}
                  onClick={() => {
                    setFilter(value);
                    setVisibleCount(9);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-500">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                className="w-full sm:w-60 pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-800 rounded-2xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-inner"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setVisibleCount(9);
                }}
                placeholder="Search keywords..."
              />
            </div>

            {/* Clear Database Action Button */}
            {posts.length > 0 && (
              <button
                type="button"
                onClick={() => setIsClearModalOpen(true)}
                className="px-4 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-rose-950/20"
                title="Remove all posts from database"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear Database
              </button>
            )}
          </div>
        </header>

        {/* States: Loading, Error, Empty */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 bg-slate-900/30 border border-slate-800/50 rounded-3xl backdrop-blur-sm">
            <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
            <p className="text-slate-400 font-medium animate-pulse text-sm">Syncing saved posts from database...</p>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-center font-medium text-sm">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-24 bg-slate-900/30 border border-slate-800/50 rounded-3xl shadow-xl">
            <div className="w-16 h-16 bg-slate-800/50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-500 border border-slate-700/50">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-white mb-1">No saved posts found</h3>
            <p className="text-slate-400 text-sm max-w-sm mx-auto mb-6">
              No results match your active criteria. Try searching a channel or clearing your filter parameters.
            </p>
            {(query || filter !== "all" || channel) && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-all"
              >
                Reset Filters
              </button>
            )}
          </div>
        )}

        {/* Posts Grid */}
        {visible.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visible.map((post) => {
              const isItJob = post.tag === "it-job";
              return (
                <article
                  key={`${post.channel}-${post.id}`}
                  className={`group relative bg-slate-900/50 hover:bg-slate-900/90 border ${
                    isItJob ? "border-emerald-500/30 hover:border-emerald-500/60" : "border-slate-800 hover:border-slate-700"
                  } rounded-3xl overflow-hidden transition-all duration-300 flex flex-col cursor-pointer shadow-xl hover:shadow-indigo-500/5`}
                  onClick={() => setSelected(post)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelected(post);
                    }
                  }}
                >
                  {/* Card Header Info */}
                  <div className="p-5 pb-3 flex items-center justify-between gap-2 border-b border-slate-800/60">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        isItJob
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                      }`}
                    >
                      {tagLabel(post.tag)}
                    </span>
                    <time className="text-xs text-slate-400 font-medium">
                      {formatWhen(post.date, post.dateLabel)}
                    </time>
                  </div>

                  {/* Photo preview if available */}
                  {post.photos?.[0] && (
                    <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={post.photos[0]}
                        alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  )}

                  {/* Post Body Snippet */}
                  <div className="p-5 flex-1 flex flex-col">
                    <p className="text-slate-300 text-sm leading-relaxed line-clamp-3 mb-4 flex-1">
                      {post.text || (post.hasVideo ? "🎥 Video media content post" : "🖼️ Media showcase post")}
                    </p>

                    {/* Keywords matching pills */}
                    {post.matchedKeywords?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-4">
                        {post.matchedKeywords.slice(0, 4).map((word) => (
                          <span
                            key={word}
                            className="px-2.5 py-0.5 rounded-lg bg-slate-800/80 border border-slate-700/50 text-[11px] font-medium text-slate-300"
                          >
                            #{word}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Card Footer Actions */}
                    <div className="pt-4 mt-auto border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
                      <span className="font-medium text-slate-300 truncate max-w-[55%]">
                        {post.channel ? `@${post.channel}` : "Saved post"}
                        {post.views ? ` • ${post.views} views` : ""}
                      </span>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold transition-colors group-hover:underline"
                      >
                        Telegram
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination Controls */}
        <div className="flex justify-center items-center gap-4 pt-6">
          {hasMore && (
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + 9)}
              className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
            >
              Load More Posts ({filtered.length - visibleCount} remaining)
            </button>
          )}

          {!hasMore && filtered.length > 9 && (
            <button
              type="button"
              onClick={() => setVisibleCount(9)}
              className="px-6 py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-sm transition-all"
            >
              Show Less
            </button>
          )}
        </div>
      </section>

      {/* ---------- Confirm Clear Database Modal ---------- */}
      {isClearModalOpen && (
        <div
          onClick={() => !clearing && setIsClearModalOpen(false)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 text-slate-100 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative flex flex-col space-y-6"
          >
            <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center text-rose-400">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">Clear entire database?</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                This action will permanently remove all saved posts{channel ? ` for @${channel}` : ""} from the database. This operation cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={clearing}
                onClick={() => setIsClearModalOpen(false)}
                className="flex-1 py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={handleClearDatabase}
                className="flex-1 py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-sm transition-all shadow-lg shadow-rose-600/30 flex items-center justify-center gap-2"
              >
                {clearing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Clearing...
                  </>
                ) : (
                  "Yes, Delete All"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Detailed Post Modal ---------- */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 sm:p-6 overflow-y-auto animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 text-slate-100 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative flex flex-col"
          >
            {/* Close button */}
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close modal"
              className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-slate-950/70 border border-slate-700/60 text-white flex items-center justify-center hover:bg-slate-800 transition-all backdrop-blur-md"
            >
              ✕
            </button>

            {/* Modal Image Header with Full-window toggle */}
            {selected.photos?.[0] && (
              <div className="relative group w-full bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.photos[0]}
                  alt=""
                  className="w-full max-h-[380px] object-cover"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullImage(selected.photos[0]);
                  }}
                  className="absolute bottom-4 right-4 bg-slate-950/80 hover:bg-slate-900 text-white border border-slate-700/80 rounded-full px-4 py-2 text-xs font-semibold backdrop-blur-md inline-flex items-center gap-2 transition-all shadow-lg"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  Expand Full Image
                </button>
              </div>
            )}

            {/* Modal Content Box */}
            <div className="p-6 sm:p-8 space-y-6">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <span
                  className={`px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    selected.tag === "it-job"
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                  }`}
                >
                  {tagLabel(selected.tag)}
                </span>
                <time className="text-xs font-medium text-slate-400">
                  {formatWhen(selected.date, selected.dateLabel)}
                </time>
              </div>

              <div className="text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words bg-slate-950/40 p-5 rounded-2xl border border-slate-800/80">
                {selected.text || "(No text content provided)"}
              </div>

              {selected.matchedKeywords?.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                    Matched Keywords & Tech Tags
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.matchedKeywords.map((word) => (
                      <span
                        key={word}
                        className="px-3 py-1 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs font-medium text-indigo-300"
                      >
                        #{word}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal Footer Info */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-4 text-xs sm:text-sm text-slate-400 font-medium">
                <span className="truncate">
                  {selected.channel ? `@${selected.channel}` : "Saved post"}
                  {selected.views ? ` • ${selected.views} views` : ""}
                </span>
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-semibold"
                >
                  Open in Telegram
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Full-Window Image Viewer Lightbox ---------- */}
      {fullImage && (
        <div
          onClick={() => setFullImage(null)}
          className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-4 backdrop-blur-xl animate-fadeIn"
          role="dialog"
          aria-modal="true"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fullImage}
            alt="Full-size preview"
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-2xl shadow-2xl"
          />

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullImage(null);
            }}
            aria-label="Close full image view"
            className="absolute top-6 right-6 bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700/60 w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold transition-all shadow-2xl backdrop-blur-md"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}