import { Link, useLocation } from "wouter";
import { Calculator, Settings, ClipboardList, Sun, Moon } from "lucide-react";
import { useState, useEffect } from "react";
import PerplexityAttribution from "./PerplexityAttribution";

function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <button
      onClick={() => setDark(!dark)}
      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
      aria-label="Переключить тему"
      data-testid="theme-toggle"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

// SVG Logo — custom for furniture studio
function Logo() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      aria-label="Мебельная студия"
      className="flex-shrink-0"
    >
      {/* Cabinet/shelf shape */}
      <rect x="4" y="8" width="28" height="22" rx="2" stroke="currentColor" strokeWidth="2" />
      <line x1="4" y1="20" x2="32" y2="20" stroke="currentColor" strokeWidth="1.5" />
      <line x1="18" y1="8" x2="18" y2="30" stroke="currentColor" strokeWidth="1.5" />
      {/* Legs */}
      <line x1="10" y1="30" x2="10" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="26" y1="30" x2="26" y2="34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Handle dots */}
      <circle cx="12" cy="24.5" r="1.2" fill="currentColor" />
      <circle cx="24" cy="14.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

const navItems = [
  { href: "/", label: "Калькулятор", icon: Calculator },
  { href: "/leads", label: "Заявки", icon: ClipboardList },
  { href: "/admin", label: "Настройки", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-primary">
            <Logo />
            <div className="leading-tight">
              <div
                className="font-bold text-sm text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                МебельКалькулятор
              </div>
              <div className="text-xs text-muted-foreground">Быстрый расчёт стоимости</div>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => {
              const active = location === href;
              return (
                <Link key={href} href={href}>
                  <a
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                      ${active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                      }`}
                    data-testid={`nav-${href.replace("/", "") || "home"}`}
                  >
                    <Icon size={15} />
                    <span className="hidden sm:inline">{label}</span>
                  </a>
                </Link>
              );
            })}
            <ThemeToggle />
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        <PerplexityAttribution />
      </footer>
    </div>
  );
}
