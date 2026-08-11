import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";
import { MobileMenuProvider } from "../../lib/mobileMenu.js";

export function AppLayout() {
  return (
    <MobileMenuProvider>
      <div className="min-h-screen bg-surface-secondary">
        <Sidebar />
        <Topbar />
        <main className="lg:ml-[250px] pt-6 px-4 sm:px-6 py-6">
          <Outlet />
        </main>
      </div>
    </MobileMenuProvider>
  );
}
