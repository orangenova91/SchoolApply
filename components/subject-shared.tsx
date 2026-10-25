import type { SubjectRow } from "@/lib/subject-rows";

export { normalizeSubjectName, type SubjectRow } from "@/lib/subject-rows";

export type SubjectDraft = Pick<SubjectRow, "subject" | "group" | "track">;

export const TRACK_BADGE: Record<string, string> = {
  "일반 선택": "bg-green-50 text-green-700 ring-green-200",
  "진로 선택": "bg-orange-50 text-orange-700 ring-orange-200",
  "융합 선택": "bg-violet-50 text-violet-700 ring-violet-200",
  "학교 자율": "bg-sky-50 text-sky-700 ring-sky-200",
};

export const TRACK_TEXT: Record<string, string> = {
  "일반 선택": "text-green-700",
  "진로 선택": "text-orange-700",
  "융합 선택": "text-violet-700",
  "학교 자율": "text-sky-700",
};

export const TRACK_ORDER = Object.keys(TRACK_BADGE);

export const CUSTOM_GROUP_FALLBACK = "기타";
export const CUSTOM_TRACK_DEFAULT = "학교 자율";

export const FALLBACK_BADGE = "bg-white text-zinc-800 ring-zinc-200";

export function trackRank(track: string) {
  const index = TRACK_ORDER.indexOf(track);
  return index === -1 ? TRACK_ORDER.length : index;
}

export function TrackBadge({ track }: { track: string }) {
  const tone = TRACK_BADGE[track];
  if (!tone) return track;
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>
      {track}
    </span>
  );
}
