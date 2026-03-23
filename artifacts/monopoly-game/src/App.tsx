import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    const base = import.meta.env.BASE_URL || "/";
    const gamePath = base.replace(/\/$/, "") + "/game/index.html";
    window.location.replace(gamePath);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#09090f", color: "#f5c518", fontFamily: "sans-serif" }}>
      <p style={{ fontSize: "1.2rem" }}>Loading Monopoly Online…</p>
    </div>
  );
}
