import { LuLock, LuCreditCard, LuSmartphone, LuChevronRight, LuPackage } from "react-icons/lu";

export default function CheckoutPage() {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr", gap: 48 }} className="checkout-layout">
      <style>{`
        .checkout-layout {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 48px;
          align-items: start;
        }
        .form-section {
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 32px;
          margin-bottom: 24px;
        }
        .order-summary {
          position: sticky;
          top: 100px;
          background: var(--surface);
          border: 1px solid var(--border);
          padding: 32px;
        }
        .form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .full-width {
          grid-column: 1 / -1;
        }
        @media (max-width: 900px) {
          .checkout-layout {
            grid-template-columns: 1fr;
          }
          .form-grid {
            grid-template-columns: 1fr;
          }
          .order-summary {
            position: relative;
            top: 0;
            order: -1; /* Show summary first on mobile */
          }
          .form-section {
            padding: 24px 16px;
          }
        }
      `}</style>

      {/* Left Column: Forms */}
      <div>
        <div style={{ marginBottom: 32 }}>
          <h1 className="font-display" style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Checkout</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text-secondary)", fontSize: 13 }}>
            <span>Cart</span> <LuChevronRight size={14} /> 
            <span style={{ color: "var(--brand-500)", fontWeight: 600 }}>Information & Shipping</span> <LuChevronRight size={14} /> 
            <span>Payment</span>
          </div>
        </div>

        {/* Contact Information */}
        <div className="form-section">
          <h2 className="font-display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--text-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>1</span>
            Contact Information
          </h2>
          <div className="form-grid">
            <div className="full-width">
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Email Address</label>
              <input type="email" placeholder="you@example.com" className="input" />
            </div>
            <div className="full-width">
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Phone Number (Optional)</label>
              <input type="tel" placeholder="+237 600 000 000" className="input" />
            </div>
          </div>
        </div>

        {/* Shipping Address */}
        <div className="form-section">
          <h2 className="font-display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--text-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>2</span>
            Shipping Address
          </h2>
          <div className="form-grid">
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>First Name</label>
              <input type="text" placeholder="John" className="input" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Last Name</label>
              <input type="text" placeholder="Doe" className="input" />
            </div>
            <div className="full-width">
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Address</label>
              <input type="text" placeholder="Street Address, Appt/Suite" className="input" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>City</label>
              <input type="text" placeholder="City" className="input" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Postal Code</label>
              <input type="text" placeholder="ZIP / Postal Code" className="input" />
            </div>
          </div>
        </div>

        {/* Payment Method */}
        <div className="form-section">
          <h2 className="font-display" style={{ fontSize: 20, fontWeight: 600, marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "var(--text-primary)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>3</span>
            Payment Method
          </h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, border: "2px solid var(--brand-500)", background: "rgba(168,85,247,0.03)", cursor: "pointer" }}>
              <input type="radio" name="payment" defaultChecked style={{ accentColor: "var(--brand-500)", width: 18, height: 18 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, display: "block", fontSize: 15 }}>Mobile Money</span>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Pay instantly via MTN/Orange Money</span>
              </div>
              <LuSmartphone size={24} color="var(--brand-500)" />
            </label>
            
            <label style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, border: "1px solid var(--border)", cursor: "pointer" }}>
              <input type="radio" name="payment" style={{ accentColor: "var(--brand-500)", width: 18, height: 18 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, display: "block", fontSize: 15 }}>Credit/Debit Card</span>
                <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Visa, Mastercard</span>
              </div>
              <LuCreditCard size={24} color="var(--text-secondary)" />
            </label>
          </div>
        </div>
        
        <button className="btn btn-primary" style={{ width: "100%", padding: 20, fontSize: 18, fontWeight: 700, marginTop: 16 }}>
          Complete Order <LuLock size={18} />
        </button>
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text-muted)", marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <LuLock size={14} /> Payments are secure and encrypted
        </p>
      </div>

      {/* Right Column: Order Summary */}
      <div className="order-summary">
        <h3 className="font-display" style={{ fontSize: 20, fontWeight: 700, marginBottom: 24, borderBottom: "1px solid var(--border)", paddingBottom: 16 }}>Order Summary</h3>
        
        {/* Mock Items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ width: 64, height: 64, background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <LuPackage size={24} color="var(--text-muted)" />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600 }}>Premium Watch</h4>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Qty: 1</p>
            </div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>150,000 XAF</div>
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <div style={{ width: 64, height: 64, background: "var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <LuPackage size={24} color="var(--text-muted)" />
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600 }}>Leather Wallet</h4>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Qty: 2</p>
            </div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>90,000 XAF</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, borderTop: "1px dashed var(--border)", paddingTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--text-secondary)" }}>
            <span>Subtotal</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>240,000 XAF</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--text-secondary)" }}>
            <span>Shipping</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>15,000 XAF</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--text-secondary)" }}>
            <span>Taxes</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>24,000 XAF</span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 700, borderTop: "1px solid var(--border)", paddingTop: 24, marginTop: 24 }}>
          <span>Total</span>
          <span style={{ color: "var(--brand-500)" }}>279,000 XAF</span>
        </div>
      </div>
    </div>
  );
}
