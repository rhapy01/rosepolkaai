import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface WhitelistedContract {
  id: string;
  name: string;
  contract_address: string;
  chain: string;
  category: string;
  protocol: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = ["dex", "lending", "staking", "bridge", "nft", "launchpad"];

export default function AdminPanel() {
  const [contracts, setContracts] = useState<WhitelistedContract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contract_address: "",
    chain: "polkadot-hub",
    category: "dex",
    protocol: "",
    description: "",
  });

  const fetchContracts = useCallback(async () => {
    const { data } = await supabase
      .from("whitelisted_contracts")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setContracts(data as unknown as WhitelistedContract[]);
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.contract_address) {
      toast.error("Name and contract address required");
      return;
    }

    const { error } = await supabase.from("whitelisted_contracts").insert({
      name: form.name,
      contract_address: form.contract_address.toLowerCase(),
      chain: form.chain,
      category: form.category,
      protocol: form.protocol || null,
      description: form.description || null,
    });

    if (error) {
      toast.error("Failed to add contract. Are you an admin?");
      console.error(error);
      return;
    }

    toast.success("Contract whitelisted!");
    setForm({ name: "", contract_address: "", chain: "polkadot-hub", category: "dex", protocol: "", description: "" });
    setShowForm(false);
    fetchContracts();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("whitelisted_contracts").delete().eq("id", id);
    if (error) {
      toast.error("Failed to delete. Are you an admin?");
      return;
    }
    toast.success("Contract removed");
    fetchContracts();
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    const { error } = await supabase
      .from("whitelisted_contracts")
      .update({ is_active: !currentActive })
      .eq("id", id);
    if (error) {
      toast.error("Failed to update. Are you an admin?");
      return;
    }
    fetchContracts();
  };

  return (
    <div className="flex-1 p-4 max-w-[800px] mx-auto w-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" />
          Whitelisted Contracts
        </h2>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-3 h-3 mr-1" />
          Add
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-white/10 bg-[#0f0f15] p-4 space-y-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Protocol Name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="bg-[#171722] border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none placeholder:text-white/45"
            />
            <input
              placeholder="0x... Contract Address"
              value={form.contract_address}
              onChange={(e) => setForm((f) => ({ ...f, contract_address: e.target.value }))}
              className="bg-[#171722] border border-white/10 text-white text-xs font-mono rounded-lg px-3 py-2 outline-none placeholder:text-white/45"
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="bg-[#171722] border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
            <input
              placeholder="Chain (e.g. polkadot-hub)"
              value={form.chain}
              onChange={(e) => setForm((f) => ({ ...f, chain: e.target.value }))}
              className="bg-[#171722] border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none placeholder:text-white/45"
            />
          </div>
          <input
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full bg-[#171722] border border-white/10 text-white text-xs rounded-lg px-3 py-2 outline-none placeholder:text-white/45"
          />
          <Button type="submit" size="sm" className="w-full">Whitelist Contract</Button>
        </form>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-white/50" />
        </div>
      ) : contracts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0f0f15] p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <p className="text-sm text-white/60">No whitelisted contracts yet</p>
        </div>
      ) : (
        contracts.map((c) => (
          <div key={c.id} className="rounded-xl border border-white/10 bg-[#0f0f15] p-3 flex items-center gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            <div className={`w-2 h-2 rounded-full shrink-0 ${c.is_active ? "bg-success" : "bg-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white">{c.name}</p>
              <p className="text-[10px] font-mono text-white/55 truncate">{c.contract_address}</p>
              <div className="flex gap-2 mt-0.5">
                <span className="text-[9px] uppercase bg-white/10 px-1.5 py-0.5 rounded text-white/60">{c.category}</span>
                <span className="text-[9px] text-white/55">{c.chain}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => toggleActive(c.id, c.is_active)}
                className={`text-[10px] px-2 py-1 rounded transition-colors ${
                  c.is_active ? "bg-success/10 text-success" : "bg-white/10 text-white/60"
                }`}
              >
                {c.is_active ? "Active" : "Paused"}
              </button>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-white/45 hover:text-destructive transition-colors p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
