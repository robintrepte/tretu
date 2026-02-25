import { NextResponse } from "next/server";

const MAX_VIDEOS = 24;
const YOUTUBE_CHANNEL_ID = "UCrn4oucvfow7jUNGSeE7ySg"; // Tretu @ youtube.com/@Tretu
const RSS_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=";

/** YouTube video IDs are 11 chars [A-Za-z0-9_-]. Reject anything else to avoid injection. */
function isValidYouTubeVideoId(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);
}

/** Only allow thumbnail URLs from YouTube’s CDN (including i1.ytimg.com, i2.ytimg.com, etc.). */
function isAllowedThumbnailUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  try {
    const host = new URL(url).hostname;
    return host === "img.youtube.com" || host === "i.ytimg.com" || host.endsWith(".ytimg.com");
  } catch {
    return false;
  }
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export type YouTubeVideoItem = {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  channelTitle: string;
};

/** Parse YouTube RSS feed XML into video entries (no API key required). */
function parseRssFeed(xml: string, channelTitle: string): YouTubeVideoItem[] {
  const videos: YouTubeVideoItem[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let entryMatch;
  while ((entryMatch = entryRegex.exec(xml)) !== null && videos.length < MAX_VIDEOS) {
    const block = entryMatch[1];
    const videoIdMatch = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    const publishedMatch = block.match(/<published>([^<]+)<\/published>/);
    const thumbMatch = block.match(/<media:thumbnail[^>]*url="([^"]+)"/);

    const id = videoIdMatch?.[1]?.trim();
    if (!id || !isValidYouTubeVideoId(id)) continue;

    const title = titleMatch?.[1] != null ? decodeXmlText(titleMatch[1].trim()) : "";
    const publishedAt = publishedMatch?.[1]?.trim() ?? "";
    const rawThumb = thumbMatch?.[1]?.trim() ?? "";
    const thumbnail = isAllowedThumbnailUrl(rawThumb) ? rawThumb : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    videos.push({
      id,
      title,
      thumbnail,
      publishedAt,
      channelTitle,
    });
  }
  return videos;
}

export async function GET() {
  try {
    const res = await fetch(`${RSS_URL}${encodeURIComponent(YOUTUBE_CHANNEL_ID)}`, {
      next: { revalidate: 300 },
      headers: { "Accept": "application/atom+xml, application/xml, text/xml" },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch videos" },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }
    const xml = await res.text();
    const channelTitleMatch = xml.match(/<title>([\s\S]*?)<\/title>/);
    const channelTitle = channelTitleMatch?.[1] != null ? decodeXmlText(channelTitleMatch[1].trim()) : "Tretu";

    const videos = parseRssFeed(xml, channelTitle);
    const cacheHeaders = {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
    };
    return NextResponse.json({ videos }, { headers: cacheHeaders });
  } catch (e) {
    console.error("YouTube RSS error");
    return NextResponse.json(
      { error: "Failed to fetch videos" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
