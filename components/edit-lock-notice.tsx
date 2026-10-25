import Link from "next/link";

export function EditLockNotice({ surveyId }: { surveyId: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <p>배포를 시작한 조사라 수정할 수 없습니다. 고치려면 설문 배포 단계에서 준비 상태로 되돌려 주세요.</p>
      <Link
        href={`/surveys/${surveyId}/distribute`}
        className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-800 hover:bg-amber-100"
      >
        설문 배포로 이동
      </Link>
    </div>
  );
}
