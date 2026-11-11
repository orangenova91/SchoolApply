import type { PublishedSurvey } from "@/lib/published-survey";

/** 같은 시간표에서 함께 운영되는 문항 묶음(보통 학기). 블록은 묶음마다 따로 정한다. */
export type AssignmentTerm = {
  id: string;
  label: string;
  groupIds: number[];
  blockCount: number;
  /** 한 블록에 동시에 열 수 있는 반 수 (교실 수). null이면 제한 없음 */
  maxSectionsPerBlock: number | null;
};

/** 교사가 같은 학기에 여러 과목을 맡을 때. 블록마다 묶음 안 과목들의 반 수 합이 count를 넘지 않는다. */
export type TeacherGroup = {
  id: string;
  label: string;
  subjectIds: string[];
  count: number;
};

export type AssignmentSettings = {
  maxSize: number;
  minSize: number;
  terms: AssignmentTerm[];
  /** 과목 id별 개설 반 수. 0이면 개설하지 않는다. 전원이 고른 과목은 넣지 않는다. */
  sectionCounts: Record<string, number>;
  /** 과목 id별 담당 교사 수 = 한 블록에 동시에 열 수 있는 그 과목 반 수. 없으면 1 */
  teacherCounts: Record<string, number>;
  teacherGroups: TeacherGroup[];
};

export type AssignmentSection = {
  id: string;
  termId: string;
  subjectId: string;
  label: string;
  /** 0부터. 화면에는 A, B, C…로 보인다. */
  block: number;
  studentNos: string[];
};

/** closed: 개설하지 않은 과목, conflict: 시간이 겹치거나 자리가 없어 넣지 못함 */
export type UnplacedReason = "closed" | "conflict";

export type UnplacedPick = { termId: string; subjectId: string; studentNo: string; reason: UnplacedReason };

export type SurveyAssignment = {
  settings: AssignmentSettings;
  sections: AssignmentSection[];
  unplaced: UnplacedPick[];
  solvedAt: string;
  /** 계산 시간 제한에 걸려 가장 좋은 답이 아닐 수 있을 때 */
  timeLimited?: boolean;
  updatedAt: string;
  confirmedAt?: string;
};

export type AssignmentStudent = { studentNo: string; name: string; picks: Record<number, string[]> };

export type TermSubject = {
  id: string;
  subject: string;
  track: string;
  groupId: number;
  demand: number;
  /** 제출한 학생 전원이 고른 과목. 학급 단위로 수업하므로 배정에서 뺀다. */
  common: boolean;
};

export const ASSIGNMENT_LIMITS = {
  maxSize: 60,
  blocks: 12,
  sectionsPerSubject: 20,
  sectionsPerBlock: 50,
  termLabel: 20,
  teachers: 20,
  teacherGroups: 30,
  groupLabel: 20,
};

export const DEFAULT_MAX_SIZE = 30;
export const DEFAULT_MIN_SIZE = 13;

export function blockLabel(block: number) {
  return String.fromCharCode(65 + block);
}

const SEMESTER_PATTERN = /([1-4])\s*학기/;

/** 문항 제목의 "1학기", "2학기"로 묶는다. 학기가 없는 문항은 한 묶음으로 둔다. */
export function defaultTerms(published: PublishedSurvey): Omit<AssignmentTerm, "blockCount">[] {
  const buckets = new Map<string, number[]>();
  for (const question of published.questions) {
    const match = SEMESTER_PATTERN.exec(question.title);
    const label = match ? `${match[1]}학기` : "선택과목";
    buckets.set(label, [...(buckets.get(label) ?? []), question.groupId]);
  }
  return [...buckets.entries()].map(([label, groupIds], index) => ({
    id: `t${index + 1}`,
    label,
    groupIds,
    maxSectionsPerBlock: null,
  }));
}

export function termSubjects(
  published: PublishedSurvey,
  students: AssignmentStudent[],
  groupIds: number[],
): TermSubject[] {
  const subjects: TermSubject[] = [];
  for (const question of published.questions) {
    if (!groupIds.includes(question.groupId)) continue;
    for (const subject of question.subjects) {
      const demand = students.filter((student) => student.picks[question.groupId]?.includes(subject.id)).length;
      subjects.push({
        ...subject,
        groupId: question.groupId,
        demand,
        common: students.length > 0 && demand === students.length,
      });
    }
  }
  return subjects;
}

/** 학생이 이 묶음에서 배정받아야 하는 과목 (공통 과목 제외) */
export function studentTermPicks(student: AssignmentStudent, subjects: TermSubject[]) {
  return subjects
    .filter((subject) => !subject.common && student.picks[subject.groupId]?.includes(subject.id))
    .map((subject) => subject.id);
}

function isOpen(settings: AssignmentSettings, subjectId: string) {
  return (settings.sectionCounts[subjectId] ?? 0) > 0;
}

/** 교사 수 설정이 생기기 전에 저장한 편성도 읽을 수 있도록 없으면 1명으로 본다. */
export function teacherCount(settings: AssignmentSettings, subjectId: string) {
  return settings.teacherCounts?.[subjectId] ?? 1;
}

export function teacherGroups(settings: AssignmentSettings) {
  return settings.teacherGroups ?? [];
}

export type TeacherViolation = { termId: string; block: number; subjectIds: string[]; message: string };

/** 블록마다 과목별 교사 수와 교사 묶음 교사 수를 넘게 반이 열렸는지 */
export function teacherViolations(
  settings: AssignmentSettings,
  sections: AssignmentSection[],
  subjectName: Map<string, string>,
): TeacherViolation[] {
  const violations: TeacherViolation[] = [];
  for (const term of settings.terms) {
    for (let block = 0; block < term.blockCount; block += 1) {
      const counts = new Map<string, number>();
      for (const section of sections) {
        if (section.termId === term.id && section.block === block) {
          counts.set(section.subjectId, (counts.get(section.subjectId) ?? 0) + 1);
        }
      }
      for (const [subjectId, count] of counts) {
        const limit = teacherCount(settings, subjectId);
        if (count > limit) {
          violations.push({
            termId: term.id,
            block,
            subjectIds: [subjectId],
            message: `${term.label} ${blockLabel(block)}블록: ${subjectName.get(subjectId) ?? subjectId} 반 ${count}개 (교사 ${limit}명)`,
          });
        }
      }
      for (const group of teacherGroups(settings)) {
        const total = group.subjectIds.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0);
        if (total > group.count) {
          violations.push({
            termId: term.id,
            block,
            subjectIds: group.subjectIds.filter((id) => counts.has(id)),
            message: `${term.label} ${blockLabel(block)}블록: ${group.label} 반 ${total}개 (교사 ${group.count}명)`,
          });
        }
      }
    }
  }
  return violations;
}

/** 학생 한 명이 이 묶음에서 듣는 개설 과목 수의 최댓값 = 필요한 최소 블록 수 */
export function requiredBlocks(students: AssignmentStudent[], subjects: TermSubject[], settings: AssignmentSettings) {
  let max = 0;
  for (const student of students) {
    const count = studentTermPicks(student, subjects).filter((id) => isOpen(settings, id)).length;
    max = Math.max(max, count);
  }
  return max;
}

export function defaultSectionCount(demand: number, maxSize: number) {
  return demand === 0 ? 0 : Math.ceil(demand / maxSize);
}

export function defaultSettings(published: PublishedSurvey, students: AssignmentStudent[]): AssignmentSettings {
  const sectionCounts: Record<string, number> = {};
  const draft: AssignmentSettings = {
    maxSize: DEFAULT_MAX_SIZE,
    minSize: DEFAULT_MIN_SIZE,
    terms: [],
    sectionCounts,
    teacherCounts: {},
    teacherGroups: [],
  };
  for (const term of defaultTerms(published)) {
    const subjects = termSubjects(published, students, term.groupIds);
    for (const subject of subjects) {
      if (subject.common) continue;
      sectionCounts[subject.id] = defaultSectionCount(subject.demand, DEFAULT_MAX_SIZE);
      draft.teacherCounts[subject.id] = 1;
    }
    draft.terms.push({ ...term, blockCount: Math.max(1, requiredBlocks(students, subjects, draft)) });
  }
  return draft;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function isInt(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

/** 설정을 검사하고, 반 수로 다 넣을 수 없는 과목처럼 계산 전에 알 수 있는 문제를 알려 준다. */
export function parseSettings(
  body: unknown,
  published: PublishedSurvey,
  students: AssignmentStudent[],
): Result<AssignmentSettings> {
  const record = (body ?? {}) as Record<string, unknown>;
  const { maxSize, minSize, terms, sectionCounts, teacherCounts, teacherGroups: rawGroups } = record;
  if (!isInt(maxSize, 1, ASSIGNMENT_LIMITS.maxSize)) {
    return { ok: false, error: `반 최대 인원은 1~${ASSIGNMENT_LIMITS.maxSize}명으로 정해 주세요.` };
  }
  if (!isInt(minSize, 0, maxSize)) return { ok: false, error: "반 최소 인원은 0명 이상, 최대 인원 이하로 정해 주세요." };
  if (!Array.isArray(terms) || terms.length === 0) return { ok: false, error: "학기 묶음이 없습니다." };

  const allGroups = new Set(published.questions.map((question) => question.groupId));
  const seenGroups = new Set<number>();
  const parsedTerms: AssignmentTerm[] = [];
  for (const [index, item] of terms.entries()) {
    const term = (item ?? {}) as Record<string, unknown>;
    const label = typeof term.label === "string" ? term.label.trim() : "";
    if (!label || label.length > ASSIGNMENT_LIMITS.termLabel) {
      return { ok: false, error: `학기 묶음 이름을 ${ASSIGNMENT_LIMITS.termLabel}자 이내로 적어 주세요.` };
    }
    if (!Array.isArray(term.groupIds) || term.groupIds.length === 0) {
      return { ok: false, error: `${label}에 들어갈 문항을 골라 주세요.` };
    }
    for (const groupId of term.groupIds) {
      if (typeof groupId !== "number" || !allGroups.has(groupId) || seenGroups.has(groupId)) {
        return { ok: false, error: "문항은 학기 묶음 하나에만 넣어 주세요." };
      }
      seenGroups.add(groupId);
    }
    if (!isInt(term.blockCount, 1, ASSIGNMENT_LIMITS.blocks)) {
      return { ok: false, error: `${label}의 블록 수는 1~${ASSIGNMENT_LIMITS.blocks}개로 정해 주세요.` };
    }
    if (term.maxSectionsPerBlock !== null && !isInt(term.maxSectionsPerBlock, 1, ASSIGNMENT_LIMITS.sectionsPerBlock)) {
      return { ok: false, error: `${label}의 블록당 최대 반 수를 확인해 주세요.` };
    }
    parsedTerms.push({
      id: `t${index + 1}`,
      label,
      groupIds: term.groupIds as number[],
      blockCount: term.blockCount,
      maxSectionsPerBlock: term.maxSectionsPerBlock as number | null,
    });
  }
  if (seenGroups.size !== allGroups.size) return { ok: false, error: "모든 문항을 학기 묶음에 넣어 주세요." };

  const counts = (sectionCounts ?? {}) as Record<string, unknown>;
  const teachers = (teacherCounts ?? {}) as Record<string, unknown>;
  const settings: AssignmentSettings = {
    maxSize,
    minSize,
    terms: parsedTerms,
    sectionCounts: {},
    teacherCounts: {},
    teacherGroups: [],
  };
  const termOfSubject = new Map<string, AssignmentTerm>();
  for (const term of parsedTerms) {
    const subjects = termSubjects(published, students, term.groupIds);
    let termSections = 0;
    for (const subject of subjects.filter((item) => !item.common)) {
      termOfSubject.set(subject.id, term);
      const raw = counts[subject.id] ?? defaultSectionCount(subject.demand, maxSize);
      if (!isInt(raw, 0, ASSIGNMENT_LIMITS.sectionsPerSubject)) {
        return { ok: false, error: `${subject.subject}의 반 수를 0~${ASSIGNMENT_LIMITS.sectionsPerSubject}로 정해 주세요.` };
      }
      const count = subject.demand === 0 ? 0 : raw;
      settings.sectionCounts[subject.id] = count;
      const teacherRaw = teachers[subject.id] ?? 1;
      if (!isInt(teacherRaw, 1, ASSIGNMENT_LIMITS.teachers)) {
        return { ok: false, error: `${subject.subject}의 교사 수를 1~${ASSIGNMENT_LIMITS.teachers}명으로 정해 주세요.` };
      }
      settings.teacherCounts[subject.id] = teacherRaw;
      termSections += count;
      if (count === 0) continue;
      if (count > teacherRaw * term.blockCount) {
        return {
          ok: false,
          error: `${term.label} ${subject.subject}: 교사 ${teacherRaw}명이 블록 ${term.blockCount}개에서 맡을 수 있는 반은 ${teacherRaw * term.blockCount}개입니다. 반을 줄이거나 교사·블록을 늘려 주세요.`,
        };
      }
      if (subject.demand > count * maxSize) {
        return {
          ok: false,
          error: `${term.label} ${subject.subject}: 신청 ${subject.demand}명을 ${count}개 반(반당 최대 ${maxSize}명)에 다 넣을 수 없습니다. 반을 늘려 주세요.`,
        };
      }
      if (subject.demand < count * minSize) {
        return {
          ok: false,
          error: `${term.label} ${subject.subject}: 신청 ${subject.demand}명으로 ${count}개 반의 최소 인원 ${minSize}명을 채울 수 없습니다. 반을 줄여 주세요.`,
        };
      }
    }
    const needed = requiredBlocks(students, subjects, settings);
    if (term.blockCount < needed) {
      return {
        ok: false,
        error: `${term.label}: 한 학생이 최대 ${needed}과목을 들으므로 블록이 ${needed}개 이상 필요합니다.`,
      };
    }
    if (term.maxSectionsPerBlock !== null && termSections > term.blockCount * term.maxSectionsPerBlock) {
      return {
        ok: false,
        error: `${term.label}: 반 ${termSections}개를 블록 ${term.blockCount}개(블록당 최대 ${term.maxSectionsPerBlock}반)에 다 넣을 수 없습니다.`,
      };
    }
  }

  if (rawGroups !== undefined && !Array.isArray(rawGroups)) return { ok: false, error: "교사 묶음 형식이 올바르지 않습니다." };
  const groups = (rawGroups ?? []) as unknown[];
  if (groups.length > ASSIGNMENT_LIMITS.teacherGroups) {
    return { ok: false, error: `교사 묶음은 ${ASSIGNMENT_LIMITS.teacherGroups}개까지 만들 수 있습니다.` };
  }
  for (const [index, item] of groups.entries()) {
    const group = (item ?? {}) as Record<string, unknown>;
    const label = typeof group.label === "string" ? group.label.trim() : "";
    if (!label || label.length > ASSIGNMENT_LIMITS.groupLabel) {
      return { ok: false, error: `교사 묶음 이름을 ${ASSIGNMENT_LIMITS.groupLabel}자 이내로 적어 주세요.` };
    }
    const subjectIds = Array.isArray(group.subjectIds)
      ? [...new Set(group.subjectIds.filter((id): id is string => typeof id === "string" && termOfSubject.has(id)))]
      : [];
    if (subjectIds.length < 2) return { ok: false, error: `${label}: 교사 묶음에는 과목을 2개 이상 넣어 주세요.` };
    const term = termOfSubject.get(subjectIds[0])!;
    if (subjectIds.some((id) => termOfSubject.get(id) !== term)) {
      return { ok: false, error: `${label}: 같은 학기 과목끼리만 묶을 수 있습니다.` };
    }
    if (!isInt(group.count, 1, ASSIGNMENT_LIMITS.teachers)) {
      return { ok: false, error: `${label}: 교사 수를 1~${ASSIGNMENT_LIMITS.teachers}명으로 정해 주세요.` };
    }
    const total = subjectIds.reduce((sum, id) => sum + settings.sectionCounts[id], 0);
    if (total > group.count * term.blockCount) {
      return {
        ok: false,
        error: `${label}: 반 ${total}개를 교사 ${group.count}명이 블록 ${term.blockCount}개에서 다 맡을 수 없습니다.`,
      };
    }
    settings.teacherGroups.push({ id: `g${index + 1}`, label, subjectIds, count: group.count });
  }
  return { ok: true, value: settings };
}

/**
 * 배정 결과가 지금 응답·교사 수와 맞는지 검사한다. problems는 저장하면 안 되는 문제,
 * unplaced는 아직 반이 없는 신청 과목이다. 정원 초과는 교사가 일부러 할 수 있어 문제로 보지 않는다.
 */
export function checkAssignment(
  published: PublishedSurvey,
  students: AssignmentStudent[],
  settings: AssignmentSettings,
  sections: AssignmentSection[],
) {
  const problems: string[] = [];
  const unplaced: UnplacedPick[] = [];
  const studentByNo = new Map(students.map((student) => [student.studentNo, student]));
  const subjectName = new Map(
    published.questions.flatMap((question) => question.subjects.map((subject) => [subject.id, subject.subject])),
  );

  for (const term of settings.terms) {
    const subjects = termSubjects(published, students, term.groupIds);
    const termSections = sections.filter((section) => section.termId === term.id);
    const placed = new Map<string, Map<string, number>>();
    const blocksUsed = new Map<string, Set<number>>();

    for (const section of termSections) {
      const subject = subjects.find((item) => item.id === section.subjectId);
      if (!subject || subject.common || section.block < 0 || section.block >= term.blockCount) {
        problems.push(`${term.label} ${section.label}: 지금 설정과 맞지 않는 반입니다.`);
        continue;
      }
      for (const studentNo of section.studentNos) {
        const student = studentByNo.get(studentNo);
        if (!student) {
          problems.push(`${section.label}: ${studentNo} 학생의 제출한 응답이 없습니다.`);
          continue;
        }
        if (!student.picks[subject.groupId]?.includes(subject.id)) {
          problems.push(`${section.label}: ${studentNo} ${student.name} 학생은 이 과목을 고르지 않았습니다.`);
          continue;
        }
        const bySubject = placed.get(studentNo) ?? new Map<string, number>();
        if (bySubject.has(subject.id)) {
          problems.push(`${studentNo} ${student.name}: ${subject.subject} 반이 두 개입니다.`);
          continue;
        }
        const blocks = blocksUsed.get(studentNo) ?? new Set<number>();
        if (blocks.has(section.block)) {
          problems.push(`${studentNo} ${student.name}: ${term.label} ${blockLabel(section.block)}블록에 반이 두 개 겹칩니다.`);
          continue;
        }
        bySubject.set(subject.id, section.block);
        blocks.add(section.block);
        placed.set(studentNo, bySubject);
        blocksUsed.set(studentNo, blocks);
      }
    }

    for (const student of students) {
      for (const subjectId of studentTermPicks(student, subjects)) {
        if (placed.get(student.studentNo)?.has(subjectId)) continue;
        unplaced.push({
          termId: term.id,
          subjectId,
          studentNo: student.studentNo,
          reason: isOpen(settings, subjectId) ? "conflict" : "closed",
        });
      }
    }
  }
  for (const violation of teacherViolations(settings, sections, subjectName)) {
    problems.push(`교사 수 초과 · ${violation.message}`);
  }
  return { problems: [...new Set(problems)], unplaced, subjectName };
}

/** 같은 과목 반이 여러 개면 "화학 1", "화학 2"처럼 블록 순서대로 번호를 붙인다. */
export function labelSections(sections: Omit<AssignmentSection, "label">[], subjectName: Map<string, string>) {
  const bySubject = new Map<string, Omit<AssignmentSection, "label">[]>();
  for (const section of sections) {
    bySubject.set(section.subjectId, [...(bySubject.get(section.subjectId) ?? []), section]);
  }
  const labeled: AssignmentSection[] = [];
  for (const [subjectId, group] of bySubject) {
    const name = subjectName.get(subjectId) ?? subjectId;
    group
      .sort((left, right) => left.block - right.block)
      .forEach((section, index) => labeled.push({ ...section, label: group.length === 1 ? name : `${name} ${index + 1}` }));
  }
  return labeled;
}
