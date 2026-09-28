"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return <button className="logout-button" onClick={() => void signOut({ callbackUrl: "/" })} type="button">Salir</button>;
}
