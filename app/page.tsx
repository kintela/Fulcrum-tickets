import { getServerSession } from "next-auth";
import TicketScanner from "./ticket-scanner";
import LoginScreen from "./login-screen";
import { authOptions, isAuthConfigured } from "@/lib/auth";

export default async function Home() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return <LoginScreen configured={isAuthConfigured()} />;
  }

  return <TicketScanner
    userEmail={session.user.email ?? ""}
    userName={session.user.name ?? session.user.email ?? "Usuario"}
  />;
}
