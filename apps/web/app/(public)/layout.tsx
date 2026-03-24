import { SiteFooter } from "@/components/layout/site-footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col px-4 py-10">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="w-full max-w-md">{children}</div>
      </div>
      <div className="mx-auto w-full max-w-md shrink-0">
        <SiteFooter variant="compact" />
      </div>
    </div>
  );
}
