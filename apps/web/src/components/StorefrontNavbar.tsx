"use client";

import { useState } from "react";
import { LuShoppingCart, LuUser, LuSearch, LuGlobe, LuX, LuPackage } from "react-icons/lu";
import Link from "next/link";
import KoraaLogo from "@/components/KoraaLogo";

export default function Navbar() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  return (
    <>
      <header className="navbar">
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link href="/">
            <KoraaLogo className="sf-koraa-logo" />
          </Link>
        </div>

        {/* Search Bar */}
        <div className="nav-search">
          <div style={{ position: "relative" }}>
            <input 
              type="text" 
              placeholder="Search products, categories..." 
              className="input" 
              style={{ paddingLeft: 44, borderRadius: 0, background: "var(--background)", border: "1px solid transparent" }}
            />
            <LuSearch size={18} color="var(--text-muted)" style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)" }} />
          </div>
        </div>

        {/* Right Actions */}
        <div className="nav-actions">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <LuGlobe size={18} color="var(--text-secondary)" />
            <select style={{ background: "transparent", border: "none", fontSize: 14, fontWeight: 500, color: "var(--text-primary)", cursor: "pointer", outline: "none" }}>
              <option value="en">EN</option>
              <option value="fr">FR</option>
            </select>
          </div>
          
          <button onClick={() => setIsCartOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", position: "relative" }}>
            <LuShoppingCart size={22} />
            <span style={{ position: "absolute", top: -8, right: -8, background: "var(--brand-500)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>2</span>
          </button>
          
          <div style={{ position: "relative" }}>
            <button onClick={() => setIsAccountOpen(!isAccountOpen)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)" }}>
              <LuUser size={22} />
            </button>
            
            {/* Account Dropdown */}
            {isAccountOpen && (
              <div style={{ position: "absolute", top: 40, right: 0, width: 260, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 10px 40px rgba(0,0,0,0.1)", zIndex: 100 }}>
                <div style={{ padding: 24, textAlign: "center" }}>
                  <h4 className="font-display" style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Welcome to Koraa</h4>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 20 }}>Sign in for faster checkout and to track your orders.</p>
                  <button className="btn btn-primary" style={{ width: "100%", padding: "12px", fontSize: 14, marginBottom: 12 }}>Log In</button>
                  <button className="btn btn-secondary" style={{ width: "100%", padding: "12px", fontSize: 14, background: "transparent", border: "1px solid var(--border)", color: "var(--text-primary)" }} onClick={() => setIsAccountOpen(false)}>Continue as Guest</button>
                </div>
                <div style={{ borderTop: "1px solid var(--border)", padding: "12px 24px" }}>
                  <Link href="/checkout" style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, textDecoration: "none", margin: "10px 0", fontWeight: 500 }}>Track Orders</Link>
                  <Link href="/checkout" style={{ display: "block", color: "var(--text-secondary)", fontSize: 13, textDecoration: "none", margin: "10px 0", fontWeight: 500 }}>Saved Items</Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Cart Drawer Overlay */}
      {isCartOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999, display: "flex", justifyContent: "flex-end" }}>
          {/* Drawer */}
          <div style={{ width: "100%", maxWidth: 420, background: "var(--surface)", height: "100%", display: "flex", flexDirection: "column", animation: "slideIn 0.3s forwards" }}>
            <style>{`
              @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>
            
            <div style={{ padding: 24, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 className="font-display" style={{ fontSize: 24, fontWeight: 700 }}>Your Cart (2)</h3>
              <button onClick={() => setIsCartOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                <LuX size={24} />
              </button>
            </div>
            
            {/* Cart Items */}
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 32 }}>
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 80, height: 80, background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <LuPackage size={24} color="var(--text-muted)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <h4 style={{ fontSize: 15, fontWeight: 600 }}>Premium Watch</h4>
                    <span style={{ fontWeight: 600 }}>150,000 XAF</span>
                  </div>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>Color: Black</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 0 }}>
                      <button style={{ padding: "4px 12px", background: "none", border: "none", cursor: "pointer" }}>-</button>
                      <span style={{ fontSize: 13, fontWeight: 600, width: 24, textAlign: "center" }}>1</span>
                      <button style={{ padding: "4px 12px", background: "none", border: "none", cursor: "pointer" }}>+</button>
                    </div>
                    <button style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>Remove</button>
                  </div>
                </div>
              </div>
              
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ width: 80, height: 80, background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <LuPackage size={24} color="var(--text-muted)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <h4 style={{ fontSize: 15, fontWeight: 600 }}>Leather Wallet</h4>
                    <span style={{ fontWeight: 600 }}>90,000 XAF</span>
                  </div>
                  <p style={{ color: "var(--text-secondary)", fontSize: 13, marginTop: 4 }}>Color: Brown</p>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 0 }}>
                      <button style={{ padding: "4px 12px", background: "none", border: "none", cursor: "pointer" }}>-</button>
                      <span style={{ fontSize: 13, fontWeight: 600, width: 24, textAlign: "center" }}>2</span>
                      <button style={{ padding: "4px 12px", background: "none", border: "none", cursor: "pointer" }}>+</button>
                    </div>
                    <button style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", textDecoration: "underline" }}>Remove</button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Cart Footer */}
            <div style={{ padding: 24, borderTop: "1px solid var(--border)", background: "var(--background)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 18, fontWeight: 700 }}>
                <span>Subtotal</span>
                <span>240,000 XAF</span>
              </div>
              <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 24 }}>Shipping, taxes, and discounts calculated at checkout.</p>
              <Link href="/checkout" onClick={() => setIsCartOpen(false)} style={{ display: "block", textDecoration: "none" }}>
                <button className="btn btn-primary" style={{ width: "100%", padding: 16, fontSize: 16, fontWeight: 700 }}>Checkout</button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
