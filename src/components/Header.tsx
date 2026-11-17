import { Check, ChevronLeft, Menu, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export type ThemeMode = 'LIGHT' | 'DARK' | 'SYSTEM';

interface HeaderProps {
  canGoBack: boolean;
  onBack: () => void;
  onOpenDrawer: () => void;
  themeMode: ThemeMode;
  resolvedDark: boolean;
  onChangeThemeMode: (mode: ThemeMode) => void;
}

export function Header({
  canGoBack,
  onBack,
  onOpenDrawer,
  themeMode,
  resolvedDark,
  onChangeThemeMode,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/80 p-2 backdrop-blur divshadow sm:p-4">
      <div className="flex items-center gap-2 rounded-lg py-1 sm:px-2 md:ml-0 min-w-0">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open navigation menu"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-10 w-10 xl:hidden cursor-pointer shrink-0"
        >
          <Menu className="h-6 w-6" />
        </button>

        {canGoBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer whitespace-nowrap"
          >
            <ChevronLeft className="h-5 w-5" />
            <span>Back</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Exact Theme Settings Dropdown (Light / Dark / System) */}
        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Theme settings"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="rounded-md p-2 hover:bg-muted text-foreground transition-colors cursor-pointer"
          >
            {resolvedDark ? (
              <Moon className="h-5 w-5" />
            ) : (
              <Sun className="h-5 w-5" />
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="nt-dropdown-in absolute right-0 top-full mt-2 z-50 w-56 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onChangeThemeMode('LIGHT');
                  setMenuOpen(false);
                }}
                className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Sun className="mr-1 h-4 w-4" />
                <span>Light</span>
                {themeMode === 'LIGHT' && (
                  <Check className="ml-auto h-4 w-4 text-[#5a4bda] dark:text-[#29ff94]" />
                )}
              </button>

              <div className="-mx-1 my-1 h-px bg-muted" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onChangeThemeMode('DARK');
                  setMenuOpen(false);
                }}
                className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Moon className="mr-1 h-4 w-4" />
                <span>Dark</span>
                {themeMode === 'DARK' && (
                  <Check className="ml-auto h-4 w-4 text-[#5a4bda] dark:text-[#29ff94]" />
                )}
              </button>

              <div className="-mx-1 my-1 h-px bg-muted" />

              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onChangeThemeMode('SYSTEM');
                  setMenuOpen(false);
                }}
                className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Monitor className="mr-1 h-4 w-4" />
                <span>System</span>
                {themeMode === 'SYSTEM' && (
                  <Check className="ml-auto h-4 w-4 text-[#5a4bda] dark:text-[#29ff94]" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
