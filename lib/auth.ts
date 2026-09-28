import type { NextAuthOptions } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";

function tenantId() {
  return process.env.AZURE_AD_TENANT_ID ?? "";
}

export function isAuthConfigured() {
  return Boolean(
    process.env.AZURE_AD_CLIENT_ID
    && process.env.AZURE_AD_CLIENT_SECRET
    && process.env.AZURE_AD_TENANT_ID
    && process.env.NEXTAUTH_SECRET,
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? "",
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? "",
      tenantId: tenantId(),
      profile(profile) {
        return {
          id: profile.sub,
          name: typeof profile.name === "string" ? profile.name : null,
          email: typeof profile.email === "string"
            ? profile.email
            : typeof profile.preferred_username === "string"
              ? profile.preferred_username
              : null,
          image: null,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    async signIn({ profile }) {
      const claims = profile as { tid?: unknown } | undefined;
      return typeof claims?.tid === "string" && claims.tid === tenantId();
    },
    async jwt({ token, profile }) {
      if (profile) {
        const claims = profile as { tid?: unknown; oid?: unknown };
        token.tenantId = typeof claims.tid === "string" ? claims.tid : undefined;
        token.objectId = typeof claims.oid === "string" ? claims.oid : undefined;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.tenantId = token.tenantId;
      session.user.objectId = token.objectId;
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
};
