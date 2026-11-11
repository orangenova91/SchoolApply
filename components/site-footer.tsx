import { FooterLinks } from "@/components/footer-links";
import { APP_VERSION } from "@/lib/app-version";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 bg-white px-4 py-4 print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 text-xs text-zinc-500 sm:flex-row">
        <p>
          © {year} 스쿨어플라이(SchoolApply) · {APP_VERSION} · 개발 스쿨허브(SchoolHub)
        </p>
        <FooterLinks />
      </div>
    </footer>
  );
}
