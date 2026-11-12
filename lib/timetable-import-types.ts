import type { StudentNoFormat } from "@/lib/roster";

/** timetable_form 첫 시트의 칸 위치 (1부터). 가져오기와 양식 내려받기가 함께 쓴다. */
export const TIMETABLE_FORM = {
  questionRow: 1,
  subjectRow: 2,
  firstStudentRow: 4,
  studentNoColumn: 2,
  nameColumn: 3,
  firstSubjectColumn: 5,
} as const;

export type TimetableImportQuestionPreview = {
  groupId: number;
  title: string;
  suggestedPickCount: number;
  subjects: { subject: string; track: string; demand: number }[];
  /** 학생이 선택한 과목 수별 인원. 키는 선택 수다. */
  selectionCounts: Record<string, number>;
};

export type TimetableImportPreview = {
  fileName: string;
  studentCount: number;
  studentNoFormat: StudentNoFormat;
  gradeCounts: Record<string, number>;
  questions: TimetableImportQuestionPreview[];
  issues: string[];
};

export type TimetableImportQuestionConfig = {
  groupId: number;
  title: string;
  pickCount: number;
};
