import { APP_VERSION } from "@/lib/app-version";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 bg-white px-4 py-4 print:hidden">
      <p className="mx-auto w-full max-w-6xl text-center text-xs text-zinc-500 sm:text-left">
        © {year} 스쿨어플라이(SchoolApply) · {APP_VERSION} · 개발 스쿨허브(SchoolHub)
      </p>
    </footer>
  );
}
