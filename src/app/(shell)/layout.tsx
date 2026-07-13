import "@/modules";
import { Nav } from "@/shell/Nav";
import { PrivacyProvider } from "@/shell/privacy";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivacyProvider>
      <div className="mx-auto min-h-screen max-w-[1440px]">
        <Nav />
        <main className="px-4 py-6 sm:px-8">{children}</main>
      </div>
    </PrivacyProvider>
  );
}
