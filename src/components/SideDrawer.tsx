import {
  BookOpen,
  GraduationCap,
  History,
  Layers3,
  Radio,
  Sparkles,
  X,
} from 'lucide-react';

export type NavSection = 'home' | 'enrolled' | 'study' | 'history';

interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeSection: NavSection;
  enrolledCount: number;
  liveCount: number;
  onSelectSection: (section: NavSection) => void;
  onOpenLiveStreams: () => void;
}

export function SideDrawer({
  isOpen,
  onClose,
  activeSection,
  enrolledCount,
  liveCount,
  onSelectSection,
  onOpenLiveStreams,
}: SideDrawerProps) {
  const navItems: Array<{
    id: string;
    label: string;
    icon: typeof BookOpen;
    active: boolean;
    badge?: number;
    badgeColor?: string;
    onClick: () => void;
  }> = [
    {
      id: 'study',
      label: 'Study',
      icon: BookOpen,
      active: activeSection === 'study',
      onClick: () => {
        onSelectSection('study');
        onClose();
      },
    },
    {
      id: 'home',
      label: 'Batches',
      icon: Sparkles,
      active: activeSection === 'home',
      onClick: () => {
        onSelectSection('home');
        onClose();
      },
    },
    {
      id: 'enrolled',
      label: 'My Batches',
      icon: Layers3,
      active: activeSection === 'enrolled',
      badge: enrolledCount > 0 ? enrolledCount : undefined,
      onClick: () => {
        onSelectSection('enrolled');
        onClose();
      },
    },
    {
      id: 'live',
      label: 'Live & Upcoming',
      icon: Radio,
      active: false,
      badge: liveCount > 0 ? liveCount : undefined,
      badgeColor: 'bg-red-600 text-white',
      onClick: () => {
        onClose();
        onOpenLiveStreams();
      },
    },
    {
      id: 'history',
      label: 'History',
      icon: History,
      active: activeSection === 'history',
      onClick: () => {
        onSelectSection('history');
        onClose();
      },
    },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] xl:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={`z-50 w-64 bg-background border-r border-border shadow-md transform transition-transform duration-200 ease-in-out fixed top-0 left-0 h-full xl:fixed xl:top-0 xl:left-0 xl:translate-x-0 xl:h-screen xl:z-40 flex flex-col justify-between ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="min-h-0 flex-1 flex flex-col">
          {/* Brand Header matching reference sidebar */}
          <div className="p-4 border-b border-border sticky top-0 bg-background z-10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full dark:bg-foreground overflow-hidden shrink-0 border border-border">
                <img
                  src="/logo.png"
                  alt="GB STUDY logo"
                  width={40}
                  height={40}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <span
                data-gb-brand="true"
                className="font-semibold text-foreground truncate"
              >
                GB STUDY
              </span>
              <GraduationCap className="w-5 h-5 text-[#5a4bda] dark:text-[#29ff94] shrink-0" />
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="xl:hidden h-8 w-8 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation links matching exact spacing & active pill */}
          <nav className="p-2 space-y-2 overflow-y-auto flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg cursor-pointer text-sm font-medium transition-colors duration-200 ${
                    item.active
                      ? 'bg-foreground/90 text-background shadow-xs'
                      : 'text-foreground hover:bg-foreground/10'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon
                      className={`w-5 h-5 shrink-0 ${
                        item.active
                          ? 'text-background'
                          : 'text-[#5a4bda] dark:text-[#29ff94]'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </span>

                  {typeof item.badge === 'number' && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono-num shrink-0 ${
                        item.badgeColor
                          ? item.badgeColor
                          : item.active
                            ? 'bg-background/20 text-background'
                            : 'bg-[#5a4bda]/10 text-[#5a4bda] dark:bg-[#29ff94]/15 dark:text-[#29ff94]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t border-border text-center">
          <p className="text-[11px] text-muted-foreground">
            Powered by{' '}
            <span
              data-gb-brand="true"
              className="font-semibold text-[#5a4bda] dark:text-[#29ff94]"
            >
              GB STUDY
            </span>
          </p>
        </div>
      </aside>
    </>
  );
}
