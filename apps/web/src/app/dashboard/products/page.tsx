"use client";
import PageTitle from "@/components/PageTitle";
import { LuPackage, LuPlus, LuLoader, LuSearch, LuFilter, LuEllipsis, LuImage, LuExternalLink, LuSettings2 } from "react-icons/lu";
import { useState, useEffect } from "react";
import { storeApi, productApi } from "@/lib/api";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import StoreBackLink from "@/components/StoreBackLink";
import CategoriesDialog from "./CategoriesDialog";

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [stores, setStores] = useState<any[]>([]);
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [showCategories, setShowCategories] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeStoreId) {
      fetchProducts(activeStoreId);
    }
  }, [activeStoreId]);

  const fetchData = async () => {
    try {
      const storesRes = await storeApi.list();
      const storeList = storesRes.data?.results || storesRes.data;
      setStores(storeList);
      
      const storeParam = searchParams.get("store");
      if (storeParam && storeList.find((s: any) => s.id === storeParam)) {
        setActiveStoreId(storeParam);
      } else if (storeList.length > 0) {
        setActiveStoreId(storeList[0].id);
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Failed to load stores", error);
      toast.error("Failed to load stores");
      setIsLoading(false);
    }
  };

  const fetchProducts = async (storeId: string) => {
    setIsLoading(true);
    try {
      const prodsRes = await productApi.list(storeId);
      setProducts(prodsRes.data?.results || prodsRes.data || []);
    } catch (error) {
      console.error("Failed to load products", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProducts = products.filter((p) => 
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageTitle title="Products — Koraa" />
      
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <StoreBackLink />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>Products</h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>Manage your inventory and product catalogue.</p>
          </div>
          
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            {stores.length > 1 && (
              <div style={{ position: "relative" }}>
                <select 
                  className="input" 
                  value={activeStoreId || ""} 
                  onChange={(e) => setActiveStoreId(e.target.value)}
                  style={{ padding: "10px 36px 10px 14px", minWidth: 200, appearance: "none", fontWeight: 500, background: "var(--surface)" }}
                >
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            )}
            
            <button 
              className="btn btn-secondary"
              onClick={() => setShowCategories(true)}
              disabled={!activeStoreId}
            >
              <LuPackage size={16} /> Categories
            </button>
            <button 
              className="btn btn-primary"
              onClick={() => activeStoreId && router.push(`/dashboard/products/new?store=${activeStoreId}`)}
              disabled={!activeStoreId}
            >
              <LuPlus size={16} /> Add Product
            </button>
          </div>
        </div>

        {stores.length === 0 && !isLoading ? (
          <div style={{ textAlign: "center", padding: "80px 20px", background: "var(--surface-900)", borderRadius: "var(--radius-2xl)", border: "1px dashed var(--border)", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ width: 64, height: 64, borderRadius: "var(--radius-xl)", background: "var(--surface-850)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <LuPackage size={28} color="var(--text-muted)" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No stores found</h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>You need to create a store before you can add products to your inventory.</p>
            <button className="btn btn-primary" onClick={() => router.push("/dashboard/stores")}>
              Go to Stores
            </button>
          </div>
        ) : isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "50vh", gap: 16 }}>
            <LuLoader size={32} className="spin" color="var(--brand-500)" />
            <p style={{ color: "var(--text-secondary)", fontSize: 14, fontWeight: 500 }}>Loading inventory...</p>
          </div>
        ) : products.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", background: "var(--surface-900)", border: "1px solid var(--border)", borderRadius: "var(--radius-xl)", boxShadow: "var(--shadow-sm)" }}>
            <div style={{ width: 64, height: 64, borderRadius: "var(--radius-xl)", background: "rgba(168, 85, 247, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
              <LuPackage size={32} color="var(--brand-500)" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No products yet</h3>
            <p style={{ color: "var(--text-secondary)", maxWidth: 400, margin: "0 auto 24px" }}>
              Add your first product to start selling across Cameroon.
            </p>
            <button className="btn btn-primary" onClick={() => router.push(`/dashboard/products/new?store=${activeStoreId}`)}>
              <LuPlus size={16} /> Add Product
            </button>
          </div>
        ) : (
          <div className="table-container">
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 12, background: "var(--surface-900)" }}>
              <div style={{ position: "relative", flex: "1 1 200px", maxWidth: "100%" }}>
                <LuSearch size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Search products by name..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: "100%", paddingLeft: 38, background: "var(--surface)", border: "none" }}
                />
              </div>
              <button className="btn btn-secondary" style={{ background: "var(--surface-900)", padding: "8px 16px" }}>
                <LuSettings2 size={16} /> Filters
              </button>
            </div>
            
            <table className="table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 24 }}>Product Details</th>
                  <th>Status</th>
                  <th>Inventory</th>
                  <th>Price</th>
                  <th style={{ width: 56 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => (
                  <tr key={p.id}>
                    <td style={{ paddingLeft: 24 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", background: "var(--surface-850)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {p.images?.[0]?.image ? (
                            <img src={p.images[0].image} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <LuImage size={18} color="var(--text-disabled)" />
                          )}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, cursor: "pointer", color: "var(--text-primary)" }} onClick={() => router.push(`/dashboard/products/${p.id}?store=${activeStoreId}`)}>
                            {p.name}
                          </p>
                          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{p.variants?.length || 1} variant(s)</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${p.status === "active" ? "badge-success" : "badge-neutral"}`} style={{ textTransform: "capitalize" }}>
                        {p.status}
                      </span>
                    </td>
                    <td>
                      {p.in_stock ? (
                        <span style={{ color: "var(--success)", fontWeight: 500, fontSize: 14 }}>In stock</span>
                      ) : (
                        <span style={{ color: "var(--danger)", fontWeight: 500, fontSize: 14 }}>Out of stock</span>
                      )}
                    </td>
                    <td style={{ fontSize: 14, fontWeight: 500 }}>
                      {parseFloat(p.base_price).toLocaleString()} XAF
                    </td>
                    <td style={{ paddingRight: 24, textAlign: "right" }}>
                      <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 6, borderRadius: "var(--radius-sm)" }} className="hover-bg">
                        <LuEllipsis size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showCategories && activeStoreId && (
        <CategoriesDialog storeId={activeStoreId} onClose={() => setShowCategories(false)} />
      )}
    </>
  );
}
