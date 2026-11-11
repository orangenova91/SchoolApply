import { randomUUID } from "node:crypto";
import highsLoader from "highs";
import {
  checkAssignment,
  labelSections,
  studentTermPicks,
  teacherCount,
  teacherGroups,
  termSubjects,
  type AssignmentSection,
  type AssignmentSettings,
  type AssignmentStudent,
  type AssignmentTerm,
} from "@/lib/assignment";
import type { PublishedSurvey } from "@/lib/published-survey";

const PLACEMENT_SECONDS = 15;
const BALANCE_SECONDS = 25;

let highsPromise: ReturnType<typeof highsLoader> | undefined;

function loadHighs() {
  highsPromise ??= highsLoader().catch((error) => {
    highsPromise = undefined;
    throw error;
  });
  return highsPromise;
}

type Term = [number, string];

/** CPLEX LP 형식의 식. 줄이 너무 길지 않게 몇 항씩 끊는다. */
function linear(terms: Term[]) {
  const parts = terms.map(([coefficient, name], index) => {
    const sign = coefficient < 0 ? "-" : index === 0 ? "" : "+";
    const value = Math.abs(coefficient);
    return `${sign} ${value === 1 ? "" : `${Number(value.toFixed(6))} `}${name}`.trim();
  });
  const lines: string[] = [];
  for (let index = 0; index < parts.length; index += 12) lines.push(parts.slice(index, index + 12).join(" "));
  return lines.join("\n  ");
}

type TermResult = { sections: Omit<AssignmentSection, "label">[]; timeLimited: boolean };

/**
 * 조합 하나의 [과목 × 블록] 인원표를 학생별 시간표로 나눈다. 행·열 합이 인원 이하면
 * 항상 나눌 수 있으므로(쾨니그 정리), 합이 남은 인원과 같은 행·열을 반드시 덮는 짝을 한 명씩 고른다.
 */
function splitCombo(matrix: number[][], size: number): (number | null)[][] {
  const remaining = matrix.map((row) => [...row]);
  const blockCount = matrix[0]?.length ?? 0;
  const patterns: (number | null)[][] = [];
  for (let left = size; left > 0; left -= 1) {
    const rowSums = remaining.map((row) => row.reduce((sum, value) => sum + value, 0));
    const colSums = Array.from({ length: blockCount }, (_, b) => remaining.reduce((sum, row) => sum + row[b], 0));
    const pattern: (number | null)[] = remaining.map(() => null);
    const used = new Set<number>();
    const search = (row: number): boolean => {
      if (row === remaining.length) return colSums.every((sum, b) => sum < left || used.has(b));
      for (let b = 0; b < blockCount; b += 1) {
        if (remaining[row][b] === 0 || used.has(b)) continue;
        pattern[row] = b;
        used.add(b);
        if (search(row + 1)) return true;
        used.delete(b);
      }
      pattern[row] = null;
      return rowSums[row] < left && search(row + 1);
    };
    if (!search(0)) throw new Error("과목 조합을 학생별로 나누지 못했습니다.");
    pattern.forEach((b, row) => {
      if (b !== null) remaining[row][b] -= 1;
    });
    patterns.push([...pattern]);
  }
  return patterns;
}

async function solveTerm(
  term: AssignmentTerm,
  published: PublishedSurvey,
  students: AssignmentStudent[],
  settings: AssignmentSettings,
): Promise<TermResult> {
  const subjects = termSubjects(published, students, term.groupIds).filter(
    (subject) => !subject.common && (settings.sectionCounts[subject.id] ?? 0) > 0,
  );
  if (subjects.length === 0) return { sections: [], timeLimited: false };
  const subjectIndex = new Map(subjects.map((subject, index) => [subject.id, index]));
  const sectionCount = subjects.map((subject) => settings.sectionCounts[subject.id]);
  const blocks = [...Array(term.blockCount).keys()];

  // 같은 과목 조합을 고른 학생은 서로 바꿔도 같으므로 조합별 인원만 변수로 둔다.
  const comboMap = new Map<string, { picks: number[]; studentNos: string[] }>();
  for (const student of students) {
    const picks = studentTermPicks(student, subjects).map((id) => subjectIndex.get(id)!).sort((a, b) => a - b);
    if (picks.length === 0) continue;
    const key = picks.join(",");
    const combo = comboMap.get(key) ?? { picks, studentNos: [] };
    combo.studentNos.push(student.studentNo);
    comboMap.set(key, combo);
  }
  const combos = [...comboMap.values()];

  const y = (c: number, s: number, b: number) => `y${c}_${s}_${b}`;
  const u = (c: number, s: number) => `u${c}_${s}`;
  const n = (s: number, b: number) => `n${s}_${b}`;
  const d = (s: number, b: number) => `d${s}_${b}`;

  const unplacedTerms: Term[] = [];
  const balanceTerms: Term[] = [];
  const constraints: string[] = [];
  const bounds: string[] = [];
  const generals: string[] = [];
  const loads = subjects.map(() => blocks.map(() => [] as Term[]));

  combos.forEach(({ picks, studentNos }, c) => {
    const size = studentNos.length;
    for (const s of picks) {
      constraints.push(`${linear([...blocks.map((b): Term => [1, y(c, s, b)]), [1, u(c, s)]])} = ${size}`);
      unplacedTerms.push([1, u(c, s)]);
      generals.push(u(c, s));
      bounds.push(`0 <= ${u(c, s)} <= ${size}`);
      for (const b of blocks) {
        generals.push(y(c, s, b));
        bounds.push(`0 <= ${y(c, s, b)} <= ${size}`);
        loads[s][b].push([1, y(c, s, b)]);
      }
    }
    // 한 블록에서 이 조합 학생이 듣는 수업 수가 조합 인원을 넘지 않으면 학생별로 겹치지 않게 나눌 수 있다.
    for (const b of blocks) {
      if (picks.length > 1) constraints.push(`${linear(picks.map((s): Term => [1, y(c, s, b)]))} <= ${size}`);
    }
  });

  subjects.forEach((subject, s) => {
    // 반 인원이 평균의 내림~올림 안이면 손해 0. 0이 되면 계산기가 바로 최적임을 알 수 있다.
    const low = Math.floor(subject.demand / sectionCount[s]);
    const high = Math.ceil(subject.demand / sectionCount[s]);
    constraints.push(`${linear(blocks.map((b): Term => [1, n(s, b)]))} = ${sectionCount[s]}`);
    for (const b of blocks) {
      const load = loads[s][b];
      constraints.push(`${linear([...load, [-settings.maxSize, n(s, b)]])} <= 0`);
      if (settings.minSize > 0) constraints.push(`${linear([...load, [-settings.minSize, n(s, b)]])} >= 0`);
      constraints.push(`${linear([...load, [-high, n(s, b)], [-1, d(s, b)]])} <= 0`);
      constraints.push(`${linear([...load, [-low, n(s, b)], [1, d(s, b)]])} >= 0`);
      balanceTerms.push([1, d(s, b)]);
    }
  });

  if (term.maxSectionsPerBlock !== null) {
    for (const b of blocks) {
      constraints.push(`${linear(subjects.map((_, s): Term => [1, n(s, b)]))} <= ${term.maxSectionsPerBlock}`);
    }
  }

  for (const group of teacherGroups(settings)) {
    const members = group.subjectIds.filter((id) => subjectIndex.has(id)).map((id) => subjectIndex.get(id)!);
    if (members.length < 2) continue;
    for (const b of blocks) {
      constraints.push(`${linear(members.map((s): Term => [1, n(s, b)]))} <= ${group.count}`);
    }
  }

  // 블록은 이름만 다를 뿐 서로 바꿔도 같은 답이라, 반이 가장 많은 과목을 A블록에 고정해 탐색을 줄인다.
  const anchor = sectionCount.indexOf(Math.max(...sectionCount));
  constraints.push(`${n(anchor, 0)} >= 1`);

  subjects.forEach((subject, s) => {
    // 교사 한 명은 한 블록에 한 반만 맡으므로 블록마다 그 과목 반은 교사 수까지만 연다.
    const perBlock = Math.min(sectionCount[s], teacherCount(settings, subject.id));
    for (const b of blocks) {
      bounds.push(`0 <= ${n(s, b)} <= ${perBlock}`);
      generals.push(n(s, b));
    }
  });
  const highs = await loadHighs();
  const run = (objective: Term[], extra: string[], seconds: number) => {
    const lp = [
      "Minimize",
      ` obj: ${linear(objective)}`,
      "Subject To",
      ...[...constraints, ...extra].map((line, index) => ` c${index}: ${line}`),
      "Bounds",
      ...bounds.map((line) => ` ${line}`),
      "General",
      ...Array.from({ length: Math.ceil(generals.length / 20) }, (_, index) =>
        ` ${generals.slice(index * 20, index * 20 + 20).join(" ")}`,
      ),
      "End",
    ].join("\n");
    const solution = highs.solve(lp, { time_limit: seconds, mip_rel_gap: 0.01, output_flag: false });
    const found =
      (solution.Status === "Optimal" || solution.Status === "Time limit reached") &&
      Object.values(solution.Columns).some((column) => "Primal" in column);
    if (!found) return null;
    const value = (name: string) => (solution.Columns[name] as { Primal?: number } | undefined)?.Primal ?? 0;
    return { value, optimal: solution.Status === "Optimal" };
  };

  // 먼저 반에 못 들어가는 학생 수를 가장 적게 만들고, 그 수를 지킨 채로 반 인원을 고르게 맞춘다.
  const first = run(unplacedTerms, [], PLACEMENT_SECONDS);
  if (!first) throw new Error(`${term.label}: 배정 계산에 실패했습니다. 반 수나 블록 수를 늘려 보세요.`);
  const unplacedCount = Math.round(unplacedTerms.reduce((sum, [, name]) => sum + first.value(name), 0));
  const second = run(
    balanceTerms,
    [`${linear(unplacedTerms.map(([, name]): Term => [1, name]))} <= ${unplacedCount}`],
    BALANCE_SECONDS,
  );
  const value = (second ?? first).value;
  const timeLimited = !first.optimal || !second?.optimal;

  const members = subjects.map(() => blocks.map(() => [] as string[]));
  combos.forEach(({ picks, studentNos }, c) => {
    const matrix = picks.map((s) => blocks.map((b) => Math.round(value(y(c, s, b)))));
    const patterns = splitCombo(matrix, studentNos.length);
    [...studentNos].sort().forEach((studentNo, k) => {
      patterns[k].forEach((b, row) => {
        if (b !== null) members[picks[row]][b].push(studentNo);
      });
    });
  });

  const sections: Omit<AssignmentSection, "label">[] = [];
  subjects.forEach((subject, s) => {
    for (const b of blocks) {
      const count = Math.round(value(n(s, b)));
      if (count === 0) continue;
      const sorted = members[s][b].sort();
      // 학번 순으로 잘라 나누면 같은 학급 학생이 같은 반에 모인다.
      for (let k = 0; k < count; k += 1) {
        const start = Math.round((sorted.length * k) / count);
        const end = Math.round((sorted.length * (k + 1)) / count);
        sections.push({
          id: randomUUID(),
          termId: term.id,
          subjectId: subject.id,
          block: b,
          studentNos: sorted.slice(start, end),
        });
      }
    }
  });
  return { sections, timeLimited };
}

export async function solveAssignment(
  published: PublishedSurvey,
  students: AssignmentStudent[],
  settings: AssignmentSettings,
) {
  const results: TermResult[] = [];
  for (const term of settings.terms) results.push(await solveTerm(term, published, students, settings));
  const subjectName = new Map(
    published.questions.flatMap((question) => question.subjects.map((subject) => [subject.id, subject.subject])),
  );
  const sections = labelSections(
    results.flatMap((result) => result.sections),
    subjectName,
  );
  const { problems, unplaced } = checkAssignment(published, students, settings, sections);
  if (problems.length > 0) throw new Error(`배정 결과를 확인하지 못했습니다: ${problems[0]}`);
  return { sections, unplaced, timeLimited: results.some((result) => result.timeLimited) };
}
