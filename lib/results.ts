import type { PublishedSurvey } from "@/lib/published-survey";
import { listRespondentNames } from "@/lib/respondents";
import { listResponses } from "@/lib/responses";
import { buildResults } from "@/lib/result-summary";

export async function loadSurveyResults(surveyId: string, published: PublishedSurvey) {
  const [respondents, responses] = await Promise.all([listRespondentNames(surveyId), listResponses(surveyId)]);
  return buildResults(published, respondents, responses);
}
