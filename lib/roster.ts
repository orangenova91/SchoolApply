export const STUDENT_NAME_MAX = 20;
export const ROSTER_MAX = 1000;

export type RosterStudent = { studentNo: string; name: string };

export type RosterLine = {
  line: number;
  studentNo: string;
  name: string;
  /** 보이지 않는 공백·기호를 지워서 읽은 줄 */
  cleaned?: boolean;
  error?: string;
};

/** 5자리 = 학년 1 + 반 2 + 번호 2 (20315), 4자리 = 학년 1 + 반 1 + 번호 2 (2315) */
export type StudentNoFormat = "5" | "4";

export const DEFAULT_STUDENT_NO_FORMAT: StudentNoFormat = "5";

export const STUDENT_NO_FORMATS: { value: StudentNoFormat; label: string; example: string; rule: string }[] = [
  { value: "5", label: "5자리", example: "20315", rule: "학년 1 + 반 2 + 번호 2" },
  { value: "4", label: "4자리", example: "2315", rule: "학년 1 + 반 1 + 번호 2" },
];

const STUDENT_NO_PATTERNS: Record<StudentNoFormat, RegExp> = {
  "5": /^([1-3])(\d{2})(\d{2})$/,
  "4": /^([1-3])(\d)(\d{2})$/,
};

export function isStudentNoFormat(value: unknown): value is StudentNoFormat {
  return value === "5" || value === "4";
}

/** format을 주지 않으면 자릿수로 형식을 정한다 (저장된 학번은 이미 형식 검사를 거쳤다). */
export function parseStudentNo(studentNo: string, format?: StudentNoFormat) {
  const resolved = format ?? (studentNo.length === 4 ? "4" : "5");
  const match = STUDENT_NO_PATTERNS[resolved].exec(studentNo);
  if (!match) return null;
  const classNo = Number(match[2]);
  const number = Number(match[3]);
  if (classNo < 1 || number < 1) return null;
  return { grade: Number(match[1]), classNo, number };
}

export function studentLabel(studentNo: string, name: string) {
  const parsed = parseStudentNo(studentNo);
  return parsed ? `${parsed.grade}학년 ${parsed.classNo}반 ${parsed.number}번 ${name}` : `${studentNo} ${name}`;
}

/** 형식과 관계없이 "학년 + 반 2자리"(예: 203)로 반을 묶는다. */
export function classKey(studentNo: string) {
  return studentNo.length === 4 ? `${studentNo[0]}0${studentNo[1]}` : studentNo.slice(0, 3);
}

function formatRule(format: StudentNoFormat) {
  const info = STUDENT_NO_FORMATS.find((item) => item.value === format)!;
  return `${info.label}(${info.rule})`;
}

export function classLabel(key: string) {
  return `${Number(key[0])}학년 ${Number(key.slice(1))}반`;
}

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

/** 엑셀·나이스에서 학번을 텍스트로 만들려고 넣는 공백, 탭, ', ="…", 전각 숫자를 정리한다. */
export function cleanCell(value: string) {
  let text = value.replace(ZERO_WIDTH, "").replace(/\s+/g, " ").trim();
  const formula = /^="(.*)"$/.exec(text);
  if (formula) text = formula[1].trim();
  if (text.startsWith("'")) text = text.slice(1).trim();
  return text.replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
}

function asStudentNo(cell: string, format: StudentNoFormat) {
  const compact = cell.replace(/\s+/g, "").replace(/\.0+$/, "");
  return compact.length === Number(format) && /^\d+$/.test(compact) ? compact : null;
}

/** 엑셀 복사(탭)와 CSV(쉼표)를 따옴표 규칙대로 읽는다. 따옴표 안의 탭·줄바꿈은 칸 내용이다. */
function parseDelimited(text: string): string[][] {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.trim() === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

function visible(value: string) {
  return value.replace(/\t/g, "⇥").replace(/\r?\n/g, "↵").replace(/[\u00A0\u3000]/g, "·").replace(ZERO_WIDTH, "·");
}

function validateStudent(studentNo: string, name: string, format: StudentNoFormat) {
  if (!studentNo) return "학번이 없습니다.";
  if (!parseStudentNo(studentNo, format)) return `학번은 ${formatRule(format)}여야 합니다.`;
  if (!name) return "이름이 없습니다.";
  if (name.length > STUDENT_NAME_MAX) return `이름은 ${STUDENT_NAME_MAX}자 이하여야 합니다.`;
  return undefined;
}

function dataRows(text: string) {
  const rows = parseDelimited(text.replace(/^\uFEFF/, ""))
    .map((rawCells, index) => ({ rawCells, cells: rawCells.map(cleanCell), line: index + 1 }))
    .filter(({ cells }) => cells.some((cell) => cell !== ""));
  if (rows[0]?.cells.some((cell) => cell.includes("학번"))) rows.shift();
  return rows;
}

/** 붙여넣은 학번의 자릿수를 보고 형식을 추천한다. 판단할 수 없으면 null. */
export function suggestStudentNoFormat(text: string): StudentNoFormat | null {
  const counts: Record<StudentNoFormat, number> = { "5": 0, "4": 0 };
  for (const { cells } of dataRows(text)) {
    for (const format of ["5", "4"] as const) {
      const cell = cells.find((value) => asStudentNo(value, format) !== null);
      if (cell && parseStudentNo(asStudentNo(cell, format)!, format)) {
        counts[format] += 1;
        break;
      }
    }
  }
  if (counts["5"] === counts["4"]) return null;
  return counts["5"] > counts["4"] ? "5" : "4";
}

/**
 * 붙여넣은 내용이나 CSV를 학번·이름 줄로 나눈다.
 * 칸이 밀려도 형식 자릿수의 숫자 칸을 학번으로, 그 뒤 첫 글자 칸을 이름으로 읽는다. 첫 줄의 "학번" 제목 줄은 건너뛴다.
 */
export function parseRosterText(text: string, format: StudentNoFormat): RosterLine[] {
  const seen = new Set<string>();
  const result: RosterLine[] = [];

  dataRows(text).forEach(({ rawCells, cells, line }) => {
    const noIndex = cells.findIndex((cell) => asStudentNo(cell, format) !== null);
    let studentNo: string;
    let name: string;
    let rawStudentNo: string;
    if (noIndex >= 0) {
      studentNo = asStudentNo(cells[noIndex], format) ?? "";
      rawStudentNo = rawCells[noIndex];
      name = cells.slice(noIndex + 1).find((cell) => cell !== "" && !/^\d+$/.test(cell)) ?? "";
    } else {
      const filled = cells.map((cell, cellIndex) => ({ cell, cellIndex })).filter(({ cell }) => cell !== "");
      studentNo = filled[0]?.cell ?? "";
      rawStudentNo = filled[0] ? rawCells[filled[0].cellIndex] : "";
      name = filled[1]?.cell ?? "";
    }

    let error = validateStudent(studentNo, name, format);
    if (error && error.startsWith("학번은")) error = `${error} 받은 값: "${visible(rawStudentNo)}"`;
    if (!error && seen.has(studentNo)) error = "앞 줄과 학번이 겹칩니다.";
    if (!error) seen.add(studentNo);
    const cleaned = rawStudentNo !== studentNo;
    result.push({ line, studentNo, name, ...(cleaned ? { cleaned } : {}), ...(error ? { error } : {}) });
  });
  return result;
}

/** 서버에서 받은 명단을 다시 검사한다. 화면과 같은 정리를 한 번 더 적용한다. */
export function parseRosterInput(
  body: unknown,
  format: StudentNoFormat,
): { ok: true; value: RosterStudent[] } | { ok: false; error: string } {
  if (!Array.isArray(body)) return { ok: false, error: "명단 형식이 올바르지 않습니다." };
  if (body.length === 0) return { ok: false, error: "명단이 비어 있습니다." };
  if (body.length > ROSTER_MAX) return { ok: false, error: `명단은 ${ROSTER_MAX}명까지 올릴 수 있습니다.` };
  const seen = new Set<string>();
  const students: RosterStudent[] = [];
  for (const item of body) {
    const record = (item ?? {}) as Record<string, unknown>;
    const rawNo = typeof record.studentNo === "string" ? cleanCell(record.studentNo) : "";
    const studentNo = asStudentNo(rawNo, format) ?? rawNo;
    const name = typeof record.name === "string" ? cleanCell(record.name) : "";
    const error = validateStudent(studentNo, name, format);
    if (error) return { ok: false, error: `${studentNo || "(학번 없음)"}: ${error}` };
    if (seen.has(studentNo)) return { ok: false, error: `${studentNo}: 학번이 겹칩니다.` };
    seen.add(studentNo);
    students.push({ studentNo, name });
  }
  return { ok: true, value: students };
}
