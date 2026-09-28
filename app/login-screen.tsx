"use client";

import { signIn } from "next-auth/react";

export default function LoginScreen({ configured }: { configured: boolean }) {
  return <main className="app-shell">
    <div className="ambient ambient-one"/><div className="ambient ambient-two"/>
    <section className="phone-frame login-frame">
      <header className="topbar"><div className="brand" aria-label="Fulcrum Notas de Gastos"><span className="brand-symbol"><span>F</span></span><span className="brand-copy"><strong>fulcrum</strong><small>notas de gastos</small></span></div><span className="secure-badge"><span className="secure-dot"/> Acceso corporativo</span></header>
      <div className="login-screen">
        <div className="microsoft-mark" aria-hidden="true"><span/><span/><span/><span/></div>
        <span className="eyebrow">Acceso restringido</span>
        <h1>Inicia sesión con tu cuenta de empresa</h1>
        <p>Utiliza tu cuenta corporativa de Microsoft 365 para acceder al escáner de tickets.</p>
        <button className="primary-button microsoft-button" disabled={!configured} onClick={() => void signIn("azure-ad", { callbackUrl: "/" })} type="button">Continuar con Microsoft</button>
        {!configured && <p className="auth-configuration-error" role="alert">La autenticación de Microsoft Entra ID todavía no está configurada.</p>}
      </div>
      <footer><span className="lock-icon">⌾</span> Acceso limitado al tenant corporativo</footer>
    </section>
  </main>;
}
