import type { CurriculumCatalog } from "@/lib/curriculum";

export type SubjectRow = {
  id: string;
  group: string;
  track: string;
  subject: string;
  custom?: boolean;
};

export function catalogRows(catalog: CurriculumCatalog): SubjectRow[] {
  return catalog.types.flatMap((typeSection) =>
    typeSection.groups.flatMap((group) =>
      group.tracks.flatMap((track) =>
        track.subjects.map((subject) => ({
          id: `${typeSection.name}-${group.name}-${track.name}-${subject}`,
          group: group.name,
          track: track.name,
          subject,
        })),
      ),
    ),
  );
}

export function normalizeSubjectName(text: string) {
  return text
    .replace(/\s+/g, "")
    .replace(/Ⅰ/g, "1")
    .replace(/Ⅱ/g, "2")
    .replace(/Ⅲ/g, "3")
    .toLowerCase();
}
