import "@/modules";
import { Nav } from "@/shell/Nav";
import { PrivacyProvider } from "@/shell/privacy";
import { ToastProvider } from "@/shell/toast";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivacyProvider>
      <ToastProvider>
        <div className="mx-auto min-h-screen max-w-[1440px]">
          <Nav />
          <main className="px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-8">
            {children}
          </main>
        </div>
      </ToastProvider>
    </PrivacyProvider>
  );
}
