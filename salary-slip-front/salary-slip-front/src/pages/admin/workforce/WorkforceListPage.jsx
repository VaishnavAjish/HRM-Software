import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, Search, Loader2, Pencil, Trash2, Eye, Filter, ChevronDown, ChevronUp,
  Download, RefreshCw, Copy, Archive, RotateCcw
} from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import Pagination from "../../../components/ui/Pagination";
import { workforceApi } from "../../../features/workforce/services/workforceApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";
const selectClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
];

function Th({ children, className = "" }) {
  return (
    <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>
  );
}

function Td({ children, className = "" }) {
  return <td className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</td>;
}

export function createWorkforceListPage({
  entityName,
  entityNamePlural,
  api,
  columns,
  defaultFilters = {},
  createModal,
  editModal,
  viewModal,
  permissions = {},
  customFilters = [],
  customActions = [],
}) {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";
  const { can } = useAuthorization();

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [filters, setFilters] = useState({
    search: "",
    status: "ALL",
    ...defaultFilters,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [viewingItem, setViewingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const canCreate = permissions.create ? can(permissions.create) : true;
  const canEdit = permissions.update ? can(permissions.update) : true;
  const canDelete = permissions.delete ? can(permissions.delete) : true;
  const canView = permissions.read ? can(permissions.read) : true;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = {
        page,
        per_page: pageSize,
        search: filters.search || undefined,
        status: filters.status !== "ALL" ? filters.status : undefined,
        ...Object.fromEntries(
          Object.entries(filters).filter(([k, v]) => k !== "search" && k !== "status" && v && v !== "ALL")
        ),
      };
      const res = await api.list(params, token, tokenType);
      setData(res.data?.data || res.data || []);
      setTotal(res.data?.total || res.data?.last_page ? res.data.total : (res.data?.data?.length || 0));
    } catch (err) {
      toast.error(err.message || `Could not load ${entityNamePlural}`);
    } finally {
      setLoading(false);
    }
  }, [api, token, tokenType, page, pageSize, filters]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (formData) => {
    setSaving(true);
    try {
      await api.create(formData, token, tokenType);
      toast.success(`${entityName} created`);
      setShowCreateModal(false);
      load();
    } catch (err) {
      toast.error(err.message || `Could not create ${entityName}`);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (formData) => {
    setSaving(true);
    try {
      await api.update(editingItem.id, formData, token, tokenType);
      toast.success(`${entityName} updated`);
      setEditingItem(null);
      load();
    } catch (err) {
      toast.error(err.message || `Could not update ${entityName}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Are you sure you want to delete this ${entityName.toLowerCase()}?`)) return;
    setDeletingId(id);
    try {
      await api.delete(id, token, tokenType);
      toast.success(`${entityName} deleted`);
      load();
    } catch (err) {
      toast.error(err.message || `Could not delete ${entityName}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ search: "", status: "ALL", ...defaultFilters });
    setPage(1);
  };

  const hasActiveFilters = Object.entries(filters).some(([k, v]) => 
    k !== "status" && v && v !== "ALL" && v !== ""
  );

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{entityNamePlural}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Manage {entityNamePlural.toLowerCase()} across the organization
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus size={16} className="mr-2" /> Add {entityName}
          </Button>
        )}
      </header>

      {/* Filters */}
      <Card className={showFilters ? "" : "hidden"} padding="md">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className={labelClass}>Search</span>
            <input
              type="text"
              className={inputClass}
              placeholder={`Search ${entityNamePlural.toLowerCase()}...`}
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Status</span>
            <select className={selectClass} value={filters.status} onChange={(e) => handleFilterChange("status", e.target.value)}>
              {STATUS_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          {customFilters.map(filter => (
            <label key={filter.key} className="block">
              <span className={labelClass}>{filter.label}</span>
              {filter.type === "select" ? (
                <select className={selectClass} value={filters[filter.key] || ""} onChange={(e) => handleFilterChange(filter.key, e.target.value)}>
                  <option value="">All</option>
                  {filter.options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              ) : (
                <input type="text" className={inputClass} value={filters[filter.key] || ""} onChange={(e) => handleFilterChange(filter.key, e.target.value)} placeholder={filter.placeholder} />
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={clearFilters} disabled={!hasActiveFilters}>
            <RotateCcw size={16} className="mr-2" /> Clear Filters
          </Button>
          <Button variant="outline" onClick={() => setShowFilters(false)}>
            <ChevronUp size={16} className="mr-2" /> Hide Filters
          </Button>
        </div>
      </Card>

      {!showFilters && (
        <Button variant="ghost" size="sm" onClick={() => setShowFilters(true)} className="text-sm">
          <Filter size={16} className="mr-2" /> Show Filters {hasActiveFilters && <Badge className="ml-2">{Object.entries(filters).filter(([k,v]) => k !== "status" && v && v !== "ALL").length}</Badge>}
        </Button>
      )}

      {/* Table */}
      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable rows={5} cols={columns.length + 1} /></div>}

        {!loading && data.length === 0 && (
          <div className="p-10 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">No {entityNamePlural.toLowerCase()} found.</p>
            {canCreate && (
              <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
                <Plus size={16} className="mr-2" /> Create {entityName}
              </Button>
            )}
          </div>
        )}

        {!loading && data.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                    {columns.map(col => <Th key={col.key}>{col.label}</Th>)}
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/60 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      {columns.map(col => (
                        <Td key={col.key}>
                          {col.render ? col.render(row) : row[col.key]}
                        </Td>
                      ))}
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canView && viewModal && (
                            <Button variant="ghost" size="sm" onClick={() => setViewingItem(row)} title="View">
                              <Eye size={14} />
                            </Button>
                          )}
                          {canEdit && editModal && (
                            <Button variant="ghost" size="sm" onClick={() => setEditingItem(row)} title="Edit">
                              <Pencil size={14} />
                            </Button>
                          )}
                          {customActions.map(action => (
                            <Button
                              key={action.key}
                              variant="ghost"
                              size="sm"
                              onClick={() => action.onClick(row)}
                              title={action.title}
                              disabled={action.disabled?.(row)}
                            >
                              <action.icon size={14} />
                            </Button>
                          ))}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(row.id)}
                              disabled={deletingId === row.id}
                              title="Delete"
                              className="text-red-600 hover:text-red-700"
                            >
                              {deletingId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                            </Button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > pageSize && (
              <Pagination
                currentPage={page}
                totalPages={Math.ceil(total / pageSize)}
                onPageChange={setPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                totalItems={total}
              />
            )}
          </>
        )}
      </Card>

      {/* Modals */}
      {showCreateModal && createModal && (
        <Modal
          isOpen
          onClose={() => setShowCreateModal(false)}
          title={`Add ${entityName}`}
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
              <Button disabled={saving} onClick={() => createModal.onSubmit(handleCreate)}>
                {saving && <Loader2 size={16} className="animate-spin mr-2" />}
                Create
              </Button>
            </div>
          }
        >
          {createModal.form}
        </Modal>
      )}

      {editingItem && editModal && (
        <Modal
          isOpen
          onClose={() => setEditingItem(null)}
          title={`Edit ${entityName}`}
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditingItem(null)}>Cancel</Button>
              <Button disabled={saving} onClick={() => editModal.onSubmit(editingItem, handleUpdate)}>
                {saving && <Loader2 size={16} className="animate-spin mr-2" />}
                Save
              </Button>
            </div>
          }
        >
          {editModal.form(editingItem)}
        </Modal>
      )}

      {viewingItem && viewModal && (
        <Modal
          isOpen
          onClose={() => setViewingItem(null)}
          title={`View ${entityName}`}
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setViewingItem(null)}>Close</Button>
            </div>
          }
        >
          {viewModal.content(viewingItem)}
        </Modal>
      )}
    </div>
  );
}