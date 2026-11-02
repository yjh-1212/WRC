export interface AccidentVideo {
  id: string; name: string; channel: string; url: string | null;
  startedAt: string | null; endedAt: string | null;
  state: 'AVAILABLE' | 'NO_TIME' | 'UNAVAILABLE'; source: string | null;
}
export function safeVideoUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2000 || /[\u0000-\u0020\\]/.test(value)) return null;
  if (/^\/(?:uploads|media)\/[\w\-./%]+$/i.test(value)) {
    try {
      let decoded = value;
      for (let round = 0; round < 3 && decoded.includes('%'); round++) decoded = decodeURIComponent(decoded);
      return !/[\u0000-\u0020\\%]/.test(decoded) && !decoded.includes('..') ? value : null;
    } catch { return null; }
  }
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function parseAccidentVideos(value?: string | null): { videos: AccidentVideo[]; state: 'CONNECTED' | 'UNCONNECTED' | 'INVALID' } {
  if (!value) return { videos: [], state: 'UNCONNECTED' };
  let parsed: any; try { parsed = JSON.parse(value); } catch { return { videos: [], state: 'INVALID' }; }
  const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.videos) ? parsed.videos : [];
  const date = (input: unknown) => typeof input === 'string' && Number.isFinite(Date.parse(input)) ? new Date(input).toISOString() : null;
  const videos: AccidentVideo[] = rows.slice(0, 100).flatMap((item: any, index: number) => {
    const row = typeof item === 'string' ? { url: item } : item;
    if (!row || typeof row !== 'object') return [];
    const candidate = row.url ?? row.playUrl ?? row.fileUrl;
    if (!String(row.mimeType ?? row.type ?? '').startsWith('video') && !/\.(mp4|webm|ogg|m3u8)(?:[?#]|$)/i.test(String(candidate)) && !row.channel) return [];
    const url = safeVideoUrl(candidate), startedAt = date(row.startedAt ?? row.startTime), endedAt = date(row.endedAt ?? row.endTime);
    const timed = !!startedAt && !!endedAt && endedAt > startedAt;
    return [{ id: `clip-${index}`, name: String(row.name ?? row.title ?? `录像 ${index + 1}`).slice(0, 120), channel: String(row.channel ?? 'UNKNOWN').slice(0, 40), url, startedAt: timed ? startedAt : null, endedAt: timed ? endedAt : null, state: !url || row.status === 'UNAVAILABLE' ? 'UNAVAILABLE' as const : timed ? 'AVAILABLE' as const : 'NO_TIME' as const, source: typeof row.source === 'string' ? row.source.slice(0, 120) : null }];
  });
  return { videos, state: videos.length ? 'CONNECTED' : 'UNCONNECTED' };
}
