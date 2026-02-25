"use client";

import { useEffect, useState } from "react";

/** YouTube video IDs are 11 chars. Sanitize before using in embed URL. */
function safeYouTubeEmbedId(id: string): string {
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
}
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import type { YouTubeVideoItem } from "@/app/api/youtube-videos/route";

export function YouTubeVideoGrid() {
  const [videos, setVideos] = useState<YouTubeVideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openVideoId, setOpenVideoId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/youtube-videos")
      .then((res) => res.json())
      .then((data) => {
        if (data.videos) setVideos(data.videos);
        if (data.error) {
          setError(
            data.error === "Service unavailable"
              ? "Videos können gerade nicht geladen werden. Bitte später erneut versuchen."
              : data.error
          );
        }
      })
      .catch(() => setError("Videos konnten nicht geladen werden."))
      .finally(() => setLoading(false));
  }, []);

  const openVideo = videos.find((v) => v.id === openVideoId);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-video w-full animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    );
  }

  if (error || videos.length === 0) {
    return (
      <p className="text-muted-foreground">
        {error ?? "Keine Videos gefunden."}
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {videos.map((video) => (
          <button
            key={video.id}
            type="button"
            onClick={() => setOpenVideoId(video.id)}
            className="group relative aspect-video w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-muted text-left shadow-sm transition hover:border-[var(--tretu-accent)] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)] focus:ring-offset-2"
          >
            <Image
              src={video.thumbnail}
              alt=""
              fill
              className="object-cover transition group-hover:scale-105"
              sizes="(max-width: 640px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 transition group-hover:opacity-100" />
            <div className="absolute top-0 left-0 right-0 p-3 opacity-0 transition group-hover:opacity-100">
              <p className="line-clamp-2 text-sm font-medium text-white drop-shadow-md text-left">
                {video.title}
              </p>
            </div>
            <div className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/90 text-white shadow-lg opacity-0 transition group-hover:opacity-100 group-hover:scale-110">
              <svg className="ml-1 h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      <Dialog open={!!openVideoId} onOpenChange={(open) => !open && setOpenVideoId(null)}>
        <DialogContent
          className="!fixed !inset-0 !top-0 !left-0 !right-0 !bottom-0 !translate-x-0 !translate-y-0 !max-w-none sm:!max-w-none !w-screen !h-screen p-0 border-0 rounded-none bg-black/95 shadow-none flex flex-col"
          showCloseButton={true}
        >
          {openVideo && (
            <>
            <div className="flex-1 min-h-0 flex flex-col">
              <DialogTitle className="sr-only">{openVideo.title}</DialogTitle>
              {/* Main video: fills available space */}
              <div className="flex-1 min-h-0 flex flex-col justify-center w-full px-2 pt-2 sm:px-4 sm:pt-4 overflow-hidden">
                <div className="flex justify-center items-center w-full h-[calc(100vh-12rem)] max-h-full">
                  <div className="relative h-full w-auto max-w-full aspect-video">
                    <iframe
                    key={openVideo.id}
                    src={
                      safeYouTubeEmbedId(openVideo.id)
                        ? `https://www.youtube.com/embed/${openVideo.id}?autoplay=1`
                        : "about:blank"
                    }
                    title={openVideo.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 h-full w-full rounded-lg"
                    />
                  </div>
                </div>
                <p className="mt-2 sm:mt-3 px-2 sm:px-4 text-sm text-white/90 line-clamp-2 shrink-0 text-center">
                  {openVideo.title}
                </p>
              </div>
              {/* Bottom carousel */}
              <div className="shrink-0 border-t border-white/10 bg-black/40 flex justify-center">
                <div className="flex gap-2 overflow-x-auto p-3 sm:p-4 justify-center">
                  {videos.map((video) => (
                    <button
                      key={video.id}
                      type="button"
                      onClick={() => setOpenVideoId(video.id)}
                      className={`relative shrink-0 w-32 sm:w-40 aspect-video rounded-lg overflow-hidden border-2 transition focus:outline-none focus:ring-2 focus:ring-[var(--tretu-accent)] focus:ring-offset-2 focus:ring-offset-black ${
                        video.id === openVideo.id
                          ? "border-[var(--tretu-accent)] ring-2 ring-[var(--tretu-accent)]/50"
                          : "border-white/20 hover:border-white/50"
                      }`}
                    >
                      <Image
                        src={video.thumbnail}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="160px"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity" />
                      <div className="absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-red-600/90 text-white">
                        <svg className="ml-0.5 h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
