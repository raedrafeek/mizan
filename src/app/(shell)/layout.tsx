import "@/modules";
import { AppShell } from "@/shell/AppShell";
import { PrivacyProvider } from "@/shell/privacy";
import { ToastProvider } from "@/shell/toast";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivacyProvider>
      <ToastProvider>
        <AppShell>{children}</AppShell>
      </ToastProvider>
    </PrivacyProvider>
  );
}
