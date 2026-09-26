import { NavLink, Outlet } from "react-router-dom";
import { Calendar, CircleUserRound, Home, Target } from "lucide-react";

import { useMe } from "@/lib/queries";

const NAV = [
  { to: "/app", label: "Hoje", icon: Home, end: true, tabLabel: "Página principal" },
  { to: "/app/check-in", label: "Check-in", icon: Calendar, end: false, tabLabel: "Check-in" },
  { to: "/app/metas", label: "Metas", icon: Target, end: false, tabLabel: "Minhas Metas" },
  { to: "/app/perfil", label: "Perfil", icon: CircleUserRound, end: false, tabLabel: "Perfil" },
];

export default function AppShell() {
  const me = useMe();
  const name = me.data?.name ?? "";
  const handle = name || "?";
  const initials =
    name
      .split(/\s+/)
      .map((p) => p[0] ?? "")
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <div className="min-h-dvh overflow-x-hidden">
      {/* Top bar — both mobile and desktop, but tabs only show on desktop */}
      <header
        className="sticky top-0 z-30 backdrop-blur-md bg-bg/70 border-b border-border"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center gap-4 lg:gap-7 px-4 lg:px-7 py-3 lg:py-3.5 max-w-[1280px] mx-auto">
          <NavLink to="/app" className="brand text-[20px] lg:text-[22px]">
            <span className="brand-flame">▲</span>
            <span>
              <span className="text-text">DAY</span>{" "}
              <span className="text-primary">UP</span>
            </span>
          </NavLink>

          {/* Desktop tabs */}
          <nav className="hidden lg:flex gap-1 bg-surface border border-border rounded-full p-1 ml-2">
            {NAV.map(({ to, tabLabel, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    "px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors",
                    isActive ? "bg-primary text-ink font-semibold" : "text-text-2 hover:text-text",
                  ].join(" ")
                }
              >
                {tabLabel}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <div className="flex items-center gap-2.5 pl-1 pr-3 py-1 bg-surface border border-border rounded-full">
              <div
                className="w-7 h-7 rounded-full grid place-items-center text-[11px] font-bold text-ink"
                style={{ background: "linear-gradient(135deg, #f5b528, #c68410)" }}
              >
                {initials}
              </div>
              <span className="hidden sm:block text-[13px] font-medium max-w-[120px] truncate">
                {handle}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="pb-24 lg:pb-12">
        <Outlet />
      </main>

      {/* Bottom nav — mobile only */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="grid grid-cols-4">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    "flex flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] text-[11px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-text-2",
                  ].join(" ")
                }
              >
                <Icon size={20} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
