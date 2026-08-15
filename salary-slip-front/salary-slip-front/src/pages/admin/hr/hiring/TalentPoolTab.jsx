import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, Pencil, Users, Search, Loader2, X,
} from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import { hrApi } from "../../../../utils/api";
import { useAuth } from "../../../../context/AuthContext";
import { useAuthorization } from "../../../../hooks/useAuthorization";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Talent Pool tab — the sourcing side of the Req<>Bac wave. Recruiters organise
 * candidates into named pools (readable by anyone with HR access) and manage
 * membership per pool. Pool lifecycle and membership mutations run through the
 * hr.candidate.pool permission; viewing is open to the whole HR hiring area.
 */
export default function TalentPoolTab() {
  const { user } = useAuth();
  const { can } = useAuthorization();

  const canManage = can("hr.candidate.pool");

  const [pools, setPools] = useState([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [memberSearch, setMemberSearch] = useState("");

  const [poolDraft, setPoolDraft] = useState({ name: "", description: "", color: "#0ea5e9" });
  const [poolModal, setPoolModal] = useState(false);
  const [editingPool, setEditingPool] = useState(null);
  const [poolBusy, setPoolBusy] = useState(false);

  const [candidateSearch, setCandidateSearch] = useState("");
  const [candidateResults, setCandidateResults] = useState([]);
  const [candidateSearching, setCandidateSearching] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const searchTimer = useRef(null);

  const selected = useMemo(
    () => pools.find((p) => String(p.id) === String(selectedId)) || null,
    [pools, selectedId]
  );

  const tokenArgs = useCallback(() => [user?.accessToken, user?.tokenType], [user]);

  const loadPools = useCallback(async () => {
    setPoolLoading(true);
    try {
      const res = await hrApi.getTalentPools(...tokenArgs());
      if (res.status) {
        const rows = res.data || [];
        setPools(rows);
        setSelectedId((prev) => (rows.some((p) => String(p.id) === String(prev)) ? prev : rows[0]?.id || null));
      }
    } catch (err) {
      toast.error(err.message || "Failed to load talent pools");
    } finally {
      setPoolLoading(false);
    }
  }, [tokenArgs]);

  const loadMembers = useCallback(async (poolId) => {
    if (!poolId) {
      setMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      const res = await hrApi.getPoolCandidates(poolId, ...tokenArgs());
      if (res.status) setMembers(res.data || []);
    } catch (err) {
      toast.error(err.message || "Failed to load pool candidates");
    } finally {
      setMembersLoading(false);
    }
  }, [tokenArgs]);

  useEffect(() => { loadPools(); }, [loadPools]);
  useEffect(() => {
    loadMembers(selectedId);
  }, [selectedId, loadMembers]);

  const searchCandidates = (term) => {
    if (!term.trim()) {
      setCandidateResults([]);
      return;
    }
    setCandidateSearching(true);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await hrApi.getCandidates(...tokenArgs(), { search: term, per_page: 8 });
        const rows = res?.data?.data || res?.data || [];
        setCandidateResults(rows);
      } catch {
        setCandidateResults([]);
      } finally {
        setCandidateSearching(false);
      }
    }, 350);
  };

  const addCandidate = async (candidate) => {
    if (!selected || !candidate) return;
    setAddBusy(true);
    try {
      const res = await hrApi.addCandidateToPool(candidate.id, selected.id, ...tokenArgs());
      if (res.status) {
        toast.success(`${candidate.name} added to ${selected.name}`);
        loadMembers(selected.id);
        setCandidateSearch("");
        setCandidateResults([]);
      }
    } catch (err) {
      toast.error(err.message || "Failed to add candidate");
    } finally {
      setAddBusy(false);
    }
  };

  const removeCandidate = async (candidate) => {
    if (!selected) return;
    try {
      const res = await hrApi.removeCandidateFromPool(candidate.id, selected.id, ...tokenArgs());
      if (res.status) {
        toast.success(`${candidate.name} removed`);
        loadMembers(selected.id);
      }
    } catch (err) {
      toast.error(err.message || "Failed to remove candidate");
    }
  };

  const openCreate = () => { setEditingPool(null); setPoolDraft({ name: "", description: "", color: "#0ea5e9" }); setPoolModal(true); };
  const openEdit = (pool) => {
    if (!canManage) return;
    setEditingPool(pool);
    setPoolDraft({ name: pool.name, description: pool.description || "", color: pool.color || "#0ea5e9" });
    setPoolModal(true);
  };

  const savePool = async () => {
    if (!poolDraft.name.trim()) { toast.error("Pool name is required"); return; }
    setPoolBusy(true);
    try {
      const res = editingPool
        ? await hrApi.updateTalentPool(editingPool.id, poolDraft, ...tokenArgs())
        : await hrApi.storeTalentPool(poolDraft, ...tokenArgs());
      if (res.status) {
        toast.success(editingPool ? "Pool updated" : "Pool created");
        setPoolModal(false);
        loadPools();
      }
    } catch (err) {
      toast.error(err.message || "Failed to save pool");
    } finally {
      setPoolBusy(false);
    }
  };

  const deletePool = async (pool) => {
    if (!canManage) return;
    if (!window.confirm(`Delete "${pool.name}"? Its members are removed but candidates are not deleted.`)) return;
    try {
      const res = await hrApi.deleteTalentPool(pool.id, ...tokenArgs());
      if (res.status) {
        toast.success("Pool deleted");
        loadPools();
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete pool");
    }
  };

  const filteredMembers = members.filter(
    (m) =>
      !memberSearch.trim() ||
      (m.name || "").toLowerCase().includes(memberSearch.toLowerCase()) ||
      (m.email || "").toLowerCase().includes(memberSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Talent Pools</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Organise candidates into reusable pipelines across requisitions.</p>
        </div>
        {canManage && (
          <Button icon={<Plus size={15} />} onClick={openCreate}>New Pool</Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── Pool list ── */}
        <div className="lg:col-span-4 space-y-2">
          {poolLoading ? (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-400">Loading pools…</div>
          ) : pools.length === 0 ? (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6 text-center text-sm text-gray-400">
              No talent pools yet{canManage ? " — create the first one." : "."}
            </div>
          ) : (
            pools.map((pool) => {
              const active = String(pool.id) === String(selectedId);
              return (
                <button
                  key={pool.id}
                  onClick={() => {
                    setMembers([]);
                    setMembersLoading(true);
                    setMemberSearch("");
                    setSelectedId(pool.id);
                  }}
                  className={`w-full text-left rounded-lg border px-3.5 py-3 transition-colors ${
                    active
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: pool.color || "#0ea5e9" }} />
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{pool.name}</span>
                    </span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {pool.candidates_count != null && (
                        <Badge variant="gray"><Users size={11} /> {pool.candidates_count}</Badge>
                      )}
                      {canManage && (
                        <span className="flex items-center gap-1 text-gray-400" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => openEdit(pool)} title="Edit" className="hover:text-brand-600"><Pencil size={13} /></button>
                          <button onClick={() => deletePool(pool)} title="Delete" className="hover:text-red-500"><Trash2 size={13} /></button>
                        </span>
                      )}
                    </span>
                  </div>
                  {pool.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{pool.description}</p>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* ── Pool detail ── */}
        <div className="lg:col-span-8 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          {!selected ? (
            <p className="text-sm text-gray-400 text-center py-10">Select a talent pool to manage its members.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: selected.color || "#0ea5e9" }} />
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">{selected.name}</h3>
                    <Badge variant="gray">{members.length} member{members.length === 1 ? "" : "s"}</Badge>
                  </div>
                  {selected.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selected.description}</p>
                  )}
                </div>
              </div>

              {canManage && (
                <div className="relative">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        className={`${inputClass} pl-9`}
                        placeholder="Search candidates to add…"
                        value={candidateSearch}
                        onChange={(e) => { setCandidateSearch(e.target.value); searchCandidates(e.target.value); }}
                      />
                    </div>
                    {candidateSearching && <Loader2 size={18} className="animate-spin text-gray-400 self-center" />}
                  </div>
                  {candidateResults.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-64 overflow-auto">
                      {candidateResults.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => addCandidate(c)}
                          disabled={addBusy}
                          className="w-full text-left px-3 py-2 text-sm text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between gap-2"
                        >
                          <span className="min-w-0">
                            <span className="font-medium truncate block">{c.name}</span>
                            {c.email && <span className="text-xs text-gray-400 truncate block">{c.email}</span>}
                          </span>
                          <Plus size={14} className="text-brand-500 flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Members</h4>
                  <input
                    className="max-w-[220px] rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:border-brand-500"
                    placeholder="Filter members…"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>

                {membersLoading ? (
                  <p className="text-sm text-gray-400 text-center py-6">Loading members…</p>
                ) : filteredMembers.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-10">
                    {members.length === 0 ? "No candidates in this pool yet." : "No members match the filter."}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {filteredMembers.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {c.email || "—"}
                            {c.current_designation ? ` · ${c.current_designation}` : ""}
                            {c.requisition?.title ? ` · ${c.requisition.title}` : ""}
                          </p>
                        </div>
                        {canManage && (
                          <button onClick={() => removeCandidate(c)} title="Remove from pool" className="text-gray-300 hover:text-red-500 flex-shrink-0">
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / edit pool modal ── */}
      {poolModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-800 p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
              {editingPool ? "Edit Talent Pool" : "New Talent Pool"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Name *</label>
                <input className={inputClass} value={poolDraft.name} onChange={(e) => setPoolDraft((d) => ({ ...d, name: e.target.value }))} placeholder="e.g. Java Backend — 2026" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Description</label>
                <textarea rows={3} className={inputClass} value={poolDraft.description} onChange={(e) => setPoolDraft((d) => ({ ...d, description: e.target.value }))} placeholder="What is this pool for?" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Colour</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={poolDraft.color} onChange={(e) => setPoolDraft((d) => ({ ...d, color: e.target.value }))} className="h-8 w-10 rounded border border-gray-300 dark:border-gray-600 cursor-pointer" />
                  <span className="text-xs text-gray-400">{poolDraft.color}</span>
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPoolModal(false)}>Cancel</Button>
              <Button onClick={savePool} disabled={poolBusy || !poolDraft.name.trim()}>
                {poolBusy ? "Saving…" : editingPool ? "Save changes" : "Create pool"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}