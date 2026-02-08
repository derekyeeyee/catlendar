// app/api/auth/[...nextauth]/route.ts
import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt"; // or "bcryptjs" if you run into native-build issues
import { pool } from "@/app/lib/db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;

        if (!email || !password) return null;

        const { rows } = await pool.query(
          `SELECT id, email, password
           FROM users
           WHERE email = $1
           LIMIT 1`,
          [email]
        );

        const user = rows[0];
        if (!user) return null;

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return null;

        // minimal user object returned to NextAuth
        return {
          id: String(user.id),
          email: user.email,
        };
      },
    }),
  ],

  // Use JWT sessions (your choice)
  session: { strategy: "jwt" },

  // Add callbacks to persist the user id into the JWT and expose it on the session
  callbacks: {
    // runs whenever a JWT is created (first sign-in) or updated
    async jwt({ token, user }) {
      // On initial sign-in, `user` will be defined — save userid into the token
      if (user) {
        token.userId = (user as any).id;
      }
      return token;
    },

    // runs when a session is checked/created (sent to client via useSession/getSession)
    async session({ session, token }) {
      // Attach userId to session.user so client/server can read it easily
      if (session.user) {
        (session.user as any).id = token.userId as string | undefined;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
