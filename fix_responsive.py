import re

with open("apps/dashboard/src/components/DashboardLayout.tsx", "r") as f:
    content = f.read()

# Add useState to imports if missing
if "useState" not in content:
    content = content.replace('import { ReactNode } from "react";', 'import { ReactNode, useState } from "react";')

# Add state for mobile menu
if "isMobileMenuOpen" not in content:
    content = re.sub(
        r'const { user, logout } = useAuthStore\(\);',
        'const { user, logout } = useAuthStore();\n  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);',
        content
    )

# Add hamburger button to header
if "LuMenu" not in content:
    content = content.replace('import { LuLayoutDashboard', 'import { LuMenu, LuLayoutDashboard')

    hamburger = '''          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
            <button
              className="mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(true)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", display: "none" }}
            >
              <LuMenu size={24} />
            </button>
            {title && ('''
    
    content = content.replace('''          <div style={{ flex: 1 }}>
            {title && (''', hamburger)

# Add class to sidebar
if "className=\"sidebar\"" in content:
    content = content.replace('className="sidebar"', 'className={`sidebar ${isMobileMenuOpen ? "open" : ""}`}')

# Add close button or overlay to sidebar for mobile
if "mobile-overlay" not in content:
    overlay = '''      {isMobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 35 }}
        />
      )}
      <nav className={`sidebar ${isMobileMenuOpen ? "open" : ""}`}>'''
    content = content.replace('      <nav className={`sidebar ${isMobileMenuOpen ? "open" : ""}`}>', overlay)


with open("apps/dashboard/src/components/DashboardLayout.tsx", "w") as f:
    f.write(content)
print("Updated DashboardLayout.tsx")
