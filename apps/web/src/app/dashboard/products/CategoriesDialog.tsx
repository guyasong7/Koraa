import { useState, useEffect } from "react";
import { categoryApi, Category } from "@/lib/api";
import { LuX, LuPlus, LuTrash, LuPencil, LuCheck } from "react-icons/lu";
import toast from "react-hot-toast";

export default function CategoriesDialog({
  storeId,
  onClose,
}: {
  storeId: string;
  onClose: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, [storeId]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const res = await categoryApi.list(storeId);
      // DRF paginated response returns results or direct array
      setCategories((res.data as any).results || res.data || []);
    } catch (e) {
      toast.error("Failed to load categories.");
    } finally {
      setLoading(false);
    }
  };

  const startAdd = () => {
    setIsAdding(true);
    setEditingId(null);
    setForm({ name: "", description: "" });
  };

  const startEdit = (c: Category) => {
    setIsAdding(false);
    setEditingId(c.id);
    setForm({ name: c.name, description: c.description || "" });
  };

  const cancelEdit = () => {
    setIsAdding(false);
    setEditingId(null);
  };

  const saveCategory = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      if (isAdding) {
        await categoryApi.create(storeId, { name: form.name, description: form.description });
        toast.success("Category created");
      } else if (editingId) {
        await categoryApi.update(storeId, editingId, { name: form.name, description: form.description });
        toast.success("Category updated");
      }
      cancelEdit();
      fetchCategories();
    } catch (e) {
      toast.error("Failed to save category");
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    try {
      await categoryApi.delete(storeId, id);
      toast.success("Category deleted");
      fetchCategories();
    } catch (e) {
      toast.error("Failed to delete category");
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 500, background: "var(--surface)", borderRadius: "var(--radius-xl)", overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "85vh", boxShadow: "0 20px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface-900)" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Manage Categories</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex" }}>
            <LuX size={20} />
          </button>
        </div>

        <div style={{ padding: 24, overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>Loading...</div>
          ) : (
            <>
              {categories.length === 0 && !isAdding && (
                <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-secondary)" }}>
                  <p style={{ marginBottom: 16 }}>No categories yet.</p>
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {categories.map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "var(--surface-900)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                    {editingId === c.id ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingRight: 16 }}>
                        <input className="input" autoFocus placeholder="Category name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{c.name}</p>
                        {c.description && <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0" }}>{c.description}</p>}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8 }}>
                      {editingId === c.id ? (
                        <>
                          <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: 6 }}><LuX size={16} /></button>
                          <button onClick={saveCategory} disabled={saving} className="btn btn-primary" style={{ padding: 6 }}><LuCheck size={16} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(c)} className="btn btn-secondary" style={{ padding: 6, color: "var(--text-secondary)" }}><LuPencil size={15} /></button>
                          <button onClick={() => deleteCategory(c.id)} className="btn btn-secondary" style={{ padding: 6, color: "var(--danger)" }}><LuTrash size={15} /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {isAdding && (
                <div style={{ marginTop: 12, padding: "12px 16px", background: "var(--surface-900)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ flex: 1, paddingRight: 16 }}>
                    <input className="input" autoFocus placeholder="Category name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ width: "100%" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={cancelEdit} className="btn btn-secondary" style={{ padding: 6 }}><LuX size={16} /></button>
                    <button onClick={saveCategory} disabled={saving} className="btn btn-primary" style={{ padding: 6 }}><LuCheck size={16} /></button>
                  </div>
                </div>
              )}

              {!isAdding && !editingId && (
                <button onClick={startAdd} className="btn btn-secondary" style={{ width: "100%", marginTop: 16, display: "flex", justifyContent: "center", gap: 8 }}>
                  <LuPlus size={16} /> Add Category
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
