import { readFile } from "node:fs/promises";
import path from "node:path";

const CURRICULUM_FILE = path.join(process.cwd(), "Data", "Curriculum", "2022curriculum.csv");

const GROUP_ORDER = [
  "국어",
  "수학",
  "영어",
  "사회 (역사/도덕 포함)",
  "과학",
  "체육",
  "예술",
  "기술·가정/정보",
  "제2외국어/한문",
  "교양",
];

const TRACK_ORDER = ["공통 과목", "일반 선택", "진로 선택", "융합 선택"];

export type CurriculumTrackSection = {
  name: string;
  subjects: string[];
};

export type CurriculumGroupSection = {
  name: string;
  tracks: CurriculumTrackSection[];
};

export type CurriculumTypeSection = {
  name: string;
  groups: CurriculumGroupSection[];
  subjectCount: number;
};

export type CurriculumCatalog = {
  types: CurriculumTypeSection[];
  subjectCount: number;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function byKnownOrder(order: readonly string[]) {
  return (left: string, right: string) => {
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right, "ko");
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  };
}

export async function loadCurriculumCatalog(): Promise<CurriculumCatalog> {
  const raw = await readFile(CURRICULUM_FILE, "utf8");
  const lines = raw.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const [, ...rows] = lines;

  const tree = new Map<string, Map<string, Map<string, string[]>>>();
  for (const row of rows) {
    const [curriculumType, subjectGroup, track, name] = parseCsvLine(row);
    if (!curriculumType || !subjectGroup || !track || !name) continue;
    const groups = tree.get(curriculumType) ?? new Map<string, Map<string, string[]>>();
    const tracks = groups.get(subjectGroup) ?? new Map<string, string[]>();
    const subjects = tracks.get(track) ?? [];
    if (!subjects.includes(name)) subjects.push(name);
    tracks.set(track, subjects);
    groups.set(subjectGroup, tracks);
    tree.set(curriculumType, groups);
  }

  const compareGroups = byKnownOrder(GROUP_ORDER);
  const compareTracks = byKnownOrder(TRACK_ORDER);
  let subjectCount = 0;

  const types = [...tree.keys()]
    .sort((left, right) => left.localeCompare(right, "ko"))
    .map((typeName) => {
      const groups = tree.get(typeName)!;
      let typeCount = 0;
      const groupSections = [...groups.keys()].sort(compareGroups).map((groupName) => {
        const tracks = groups.get(groupName)!;
        const trackSections = [...tracks.keys()].sort(compareTracks).map((trackName) => {
          const subjects = [...(tracks.get(trackName) ?? [])].sort((left, right) =>
            left.localeCompare(right, "ko"),
          );
          typeCount += subjects.length;
          return { name: trackName, subjects };
        });
        return { name: groupName, tracks: trackSections };
      });
      subjectCount += typeCount;
      return { name: typeName, groups: groupSections, subjectCount: typeCount };
    });

  return { types, subjectCount };
}
