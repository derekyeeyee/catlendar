// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-3xl w-full text-center space-y-8">
        {/* Logo / Title */}
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 rounded-full bg-slate-900/60 border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300">
            <span className="text-lg">🐾</span>
            <span className="uppercase tracking-wide">Welcome to Catlender!!</span>
          </p>

          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
            Stay on top of your schedule.
            <span className="text-sky-400"> Make your cats happy.</span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
            A calendar app with a little twist. 
            Set your schedule and stay motivated with your cat(s).
          </p>
        </div>
        

        {/* Call to actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Link
            href="/register"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-sky-500 hover:shadow-sky-500/30 transition"
          >
            Register an account
          </Link>

          <button
            type="button"
            className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg border border-slate-700 px-6 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-900/60 transition"
          >
            Login to existing account
          </button>
        </div>

        <div className="flex justify-center mt-10">
        <div className="cat-walk" />
        </div>
        
      </div>
    </main>
  );
}
