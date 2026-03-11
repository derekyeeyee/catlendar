import CalendarClient from "@/app/components/calendar/CalendarClient";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import SignOutButton from "@/app/components/auth/SignOutButton";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

export default async function CalendarPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Signed in</p>
          <p className="text-sm font-medium text-slate-100">
            {session.user.email ?? session.user.name ?? `User ${session.user.id ?? ""}`}
          </p>
        </div>
        <SignOutButton />
      </div>
      <div className="mt-6">
        <CalendarClient />
      </div>
    </main>
  );
}
