export type SurveyStatus = "preparing" | "open" | "closed" | "assigned";

export const SURVEY_ROUNDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type SurveyRound = (typeof SURVEY_ROUNDS)[number];
export const MAX_SURVEY_NOTE = 200;

export function isSurveyRound(value: number): value is SurveyRound {
  return (SURVEY_ROUNDS as readonly number[]).includes(value);
}

export type Survey = {
  id: string;
  ownerId: string;
  school: string;
  academicYear: number;
  grade: number;
  semester: 1 | 2;
  round: SurveyRound;
  note: string;
  status: SurveyStatus;
  /** 외부 timetable_form 엑셀에서 조사·응답을 한 번에 만든 경우 */
  origin?: "timetable_import";
  createdAt: string;
  /** 예약 마감 시각. 이 시각이 지나면 신청 중인 조사는 마감된다. */
  closesAt?: string;
  /** 마감한 시각 (마감 상태일 때만) */
  closedAt?: string;
  closedBy?: "teacher" | "schedule";
};

export type SurveyTiming = Pick<Survey, "closesAt" | "closedAt" | "closedBy">;

export function surveyTiming(survey: Survey): SurveyTiming {
  return { closesAt: survey.closesAt, closedAt: survey.closedAt, closedBy: survey.closedBy };
}

/** 서버와 브라우저의 시간대가 달라도 한국 시간으로 보이게 한다. */
export function formatSeoulTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timingNote(status: SurveyStatus, timing: SurveyTiming) {
  if (status === "closed" && timing.closedAt) {
    return `${formatSeoulTime(timing.closedAt)} 마감${timing.closedBy === "schedule" ? " (예약 마감)" : ""}`;
  }
  if (status === "open" && timing.closesAt) return `${formatSeoulTime(timing.closesAt)} 자동 마감 예정`;
  if (status === "preparing" && timing.closesAt) return `${formatSeoulTime(timing.closesAt)} 마감 예약됨`;
  return null;
}

export const EDIT_LOCKED_MESSAGE =
  "배포를 시작한 조사는 편성과 설문지를 수정할 수 없습니다. 설문 배포 단계에서 준비 상태로 되돌린 뒤 수정해 주세요.";

export const STATUS_LABEL: Record<SurveyStatus, string> = {
  preparing: "준비",
  open: "신청 중",
  closed: "마감",
  assigned: "배정 완료",
};
