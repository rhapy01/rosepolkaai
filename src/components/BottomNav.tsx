import { Home, Clock, Trophy, User, LayoutDashboard, Map, Info } from "lucide-react";

interface BottomNavProps {
  active: string;
  onNavigate: (tab: string) => void;
}

const TABS = [
  { id: "home", icon: Home, label: "Home" },
  { id: "about", icon: Info, label: "About" },
  { id: "portfolio", icon: LayoutDashboard, label: "Portfolio" },
  { id: "history", icon: Clock, label: "History" },
  { id: "points", icon: Trophy, label: "Points" },
  { id: "roadmap", icon: Map, label: "Roadmap" },
  { id: "profile", icon: User, label: "Profile" },
];

export default function BottomNav({ active, onNavigate }: BottomNavProps) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border/50 px-2 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around py-2">
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
              <span className="text-[9px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
