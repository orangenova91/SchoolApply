import { normalizeSubjectName, type SubjectRow } from "@/lib/subject-rows";

export type ArrangementGroup = {
  id: number;
  name: string;
  pickCount: number;
  subjectIds: string[];
};

export type ArrangementCustomSubject = {
  id: string;
  subject: string;
  group: string;
  track: string;
};

export type ArrangementInput = {
  groups: ArrangementGroup[];
  customSubjects: ArrangementCustomSubject[];
  nextGroupId: number;
};

export type SurveyArrangement = ArrangementInput & {
  updatedAt: string;
  completedAt?: string;
};

export type CompletionIssue = { groupId: number | null; message: string };

export const ARRANGEMENT_TRACKS = ["일반 선택", "진로 선택", "융합 선택", "학교 자율"];

const LIMITS = {
  groups: 50,
  groupName: 40,
  pickCount: 50,
  customSubjects: 200,
  subjectName: 40,
  groupLabel: 40,
};

const CUSTOM_ID_PATTERN = /^custom-[A-Za-z0-9-]{1,64}$/;

type ParseResult = { ok: true; value: ArrangementInput } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown, max: number) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

export function parseArrangementInput(body: unknown, catalog: SubjectRow[]): ParseResult {
  if (!isRecord(body)) return { ok: false, error: "편성 데이터 형식이 올바르지 않습니다." };
  const { groups, customSubjects, nextGroupId } = body;
  if (!Array.isArray(groups) || !Array.isArray(customSubjects)) {
    return { ok: false, error: "편성 데이터 형식이 올바르지 않습니다." };
  }
  if (groups.length > LIMITS.groups) return { ok: false, error: `그룹은 ${LIMITS.groups}개까지 만들 수 있습니다.` };
  if (customSubjects.length > LIMITS.customSubjects) {
    return { ok: false, error: `직접 추가 과목은 ${LIMITS.customSubjects}개까지 만들 수 있습니다.` };
  }

  const catalogIds = new Set(catalog.map((row) => row.id));
  const takenNames = new Set(catalog.map((row) => normalizeSubjectName(row.subject)));
  const parsedCustom: ArrangementCustomSubject[] = [];
  for (const item of customSubjects) {
    if (!isRecord(item)) return { ok: false, error: "직접 추가 과목 형식이 올바르지 않습니다." };
    const id = typeof item.id === "string" && CUSTOM_ID_PATTERN.test(item.id) ? item.id : null;
    const subject = boundedText(item.subject, LIMITS.subjectName);
    const group = boundedText(item.group, LIMITS.groupLabel);
    const track = typeof item.track === "string" && ARRANGEMENT_TRACKS.includes(item.track) ? item.track : null;
    if (!id || !subject || !group || !track) {
      return { ok: false, error: "직접 추가 과목의 과목명, 교과(군), 과목구분을 확인해 주세요." };
    }
    if (parsedCustom.some((custom) => custom.id === id)) {
      return { ok: false, error: "직접 추가 과목 번호가 겹칩니다." };
    }
    const normalized = normalizeSubjectName(subject);
    if (takenNames.has(normalized)) return { ok: false, error: `이미 있는 과목입니다: ${subject}` };
    takenNames.add(normalized);
    parsedCustom.push({ id, subject, group, track });
  }

  const customIds = new Set(parsedCustom.map((custom) => custom.id));
  const assigned = new Set<string>();
  const parsedGroups: ArrangementGroup[] = [];
  for (const item of groups) {
    if (!isRecord(item)) return { ok: false, error: "그룹 형식이 올바르지 않습니다." };
    const id = typeof item.id === "number" && Number.isInteger(item.id) && item.id >= 1 ? item.id : null;
    const name = boundedText(item.name, LIMITS.groupName);
    const pickCount =
      typeof item.pickCount === "number" &&
      Number.isInteger(item.pickCount) &&
      item.pickCount >= 1 &&
      item.pickCount <= LIMITS.pickCount
        ? item.pickCount
        : null;
    if (!id || !name || !pickCount || !Array.isArray(item.subjectIds)) {
      return { ok: false, error: "그룹명과 선택수를 확인해 주세요." };
    }
    if (parsedGroups.some((group) => group.id === id)) return { ok: false, error: "그룹 번호가 겹칩니다." };
    const subjectIds: string[] = [];
    for (const subjectId of item.subjectIds) {
      if (typeof subjectId !== "string" || (!catalogIds.has(subjectId) && !customIds.has(subjectId))) {
        return { ok: false, error: "목록에 없는 과목이 그룹에 들어 있습니다." };
      }
      if (assigned.has(subjectId)) return { ok: false, error: "한 과목이 두 그룹에 들어 있습니다." };
      assigned.add(subjectId);
      subjectIds.push(subjectId);
    }
    parsedGroups.push({ id, name, pickCount, subjectIds });
  }

  const maxGroupId = Math.max(0, ...parsedGroups.map((group) => group.id));
  const next =
    typeof nextGroupId === "number" && Number.isInteger(nextGroupId) && nextGroupId > maxGroupId
      ? nextGroupId
      : maxGroupId + 1;

  return { ok: true, value: { groups: parsedGroups, customSubjects: parsedCustom, nextGroupId: next } };
}

export function completionIssues(arrangement: Pick<ArrangementInput, "groups">): CompletionIssue[] {
  if (arrangement.groups.length === 0) {
    return [{ groupId: null, message: "그룹을 하나 이상 만들어 주세요." }];
  }
  const issues: CompletionIssue[] = [];
  for (const group of arrangement.groups) {
    if (group.subjectIds.length === 0) {
      issues.push({ groupId: group.id, message: `${group.name}: 과목이 없습니다.` });
    } else if (group.pickCount > group.subjectIds.length) {
      issues.push({
        groupId: group.id,
        message: `${group.name}: 과목이 부족합니다 (${group.pickCount}과목 택, 현재 ${group.subjectIds.length}과목).`,
      });
    }
  }
  return issues;
}

export function withoutMissingSubjects(arrangement: SurveyArrangement, catalog: SubjectRow[]) {
  const known = new Set([
    ...catalog.map((row) => row.id),
    ...arrangement.customSubjects.map((custom) => custom.id),
  ]);
  let removed = 0;
  const groups = arrangement.groups.map((group) => {
    const subjectIds = group.subjectIds.filter((id) => known.has(id));
    removed += group.subjectIds.length - subjectIds.length;
    return { ...group, subjectIds };
  });
  return { arrangement: { ...arrangement, groups }, removed };
}
