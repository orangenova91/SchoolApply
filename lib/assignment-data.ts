import type { AssignmentStudent } from "@/lib/assignment";
import { loadSurveyResults } from "@/lib/results";
import { getSurvey, getSurveyAssignment, getSurveyFlow } from "@/lib/surveys";

/** 반 편성에 쓰는 자료. 집계에 들어가는(제출한) 응답만 배정한다. */
export async function loadAssignmentContext(ownerId: string, surveyId: string) {
  const survey = await getSurvey(ownerId, surveyId);
  if (!survey) return null;
  const { published } = await getSurveyFlow(ownerId, surveyId);
  if (!published) return { survey, published: null } as const;
  const [results, assignment] = await Promise.all([
    loadSurveyResults(surveyId, published),
    getSurveyAssignment(ownerId, surveyId),
  ]);
  const students: AssignmentStudent[] = results.students
    .filter((student) => student.state === "submitted")
    .map(({ studentNo, name, picks }) => ({ studentNo, name, picks }));
  return { survey, published, results, students, assignment };
}
