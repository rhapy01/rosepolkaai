import { useState } from "react";
import { Menu, X, Activity, Blocks, Clock, Fuel, Cpu, Shield, LayoutDashboard } from "lucide-react";
import WalletButton from "./WalletButton";
import { AnimatePresence, motion } from "framer-motion";

function StatItem({ icon: Icon, label, value, valueColor }: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3 h-3 text-muted-foreground" />
      <span className="text-[10px] text-muted-foreground">{label}:</span>
      <span className={`text-[10px] font-mono font-medium ${valueColor || "text-foreground"}`}>{value}</span>
    </div>
  );
}

interface TopBarProps {
  activeTab?: string;
  onNavigate?: (tab: string) => void;
}

export default function TopBar({ activeTab = "home", onNavigate }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleNavClick = (tab: string) => {
    setMenuOpen(false);
    onNavigate?.(tab);
  };

  return (
    <>
      <header className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-background relative z-50">
        <div className="flex items-center gap-3">
          <button
            className="lg:hidden text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="hidden md:flex items-center gap-4">
            <StatItem icon={Cpu} label="Hub" value="EVM + PVM" valueColor="text-primary" />
            <span className="text-border">•</span>
            <StatItem icon={Blocks} label="Block" value="#21,492,012" />
            <span className="text-border">•</span>
            <StatItem icon={Clock} label="Finality" value="6.2s" />
            <span className="text-border">•</span>
            <StatItem icon={Activity} label="XCM" value="Active" valueColor="text-success" />
            <span className="text-border">•</span>
            <StatItem icon={Fuel} label="Gas" value="0.012 DOT" />
          </div>

          <div className="md:hidden flex items-center gap-2">
            <img src="/rosepolka.png" alt="" width={28} height={28} className="rounded-lg object-cover shrink-0" />
            <span className="text-xs font-semibold text-foreground">Rose PolkaAi</span>
          </div>
        </div>

        <WalletButton />
      </header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-b border-border/50 bg-card overflow-hidden z-40 relative"
          >
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <StatItem icon={Cpu} label="Hub" value="EVM + PVM" valueColor="text-primary" />
                <StatItem icon={Blocks} label="Block" value="#21,492,012" />
                <StatItem icon={Clock} label="Finality" value="6.2s" />
                <StatItem icon={Activity} label="XCM" value="Active" valueColor="text-success" />
                <StatItem icon={Fuel} label="Gas" value="0.012 DOT" />
              </div>
              <div className="border-t border-border/50 pt-3 space-y-2">
                <NavItem label="Home" onClick={() => handleNavClick("home")} active={activeTab === "home"} />
                <NavItem label="Portfolio" onClick={() => handleNavClick("portfolio")} icon={LayoutDashboard} active={activeTab === "portfolio"} />
                <NavItem label="History" onClick={() => handleNavClick("history")} active={activeTab === "history"} />
                <NavItem label="Points & Rank" onClick={() => handleNavClick("points")} active={activeTab === "points"} />
                <NavItem label="Admin" onClick={() => handleNavClick("admin")} icon={Shield} active={activeTab === "admin"} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function NavItem({ label, active, onClick, icon: Icon }: { label: string; active?: boolean; onClick?: () => void; icon?: React.ElementType }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
      }`}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}
