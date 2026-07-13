import "@/modules";
import { Nav } from "@/shell/Nav";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-[1440px]">
      <Nav />
      <main className="px-4 py-6 sm:px-8">{children}</main>
    </div>
  );
}
