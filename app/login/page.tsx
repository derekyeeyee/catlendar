import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center px-4">

      {/* Back to Home Button */}
      <Link
        href="/"
        className="absolute top-6 left-6 text-brown-700 hover:text-brown-900 font-medium flex items-center gap-1"
      >
        ← Back to Home
      </Link>

      <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-center text-white mb-6">
          Welcome Back!
        </h1>

        <p className="text-center text-slate-400 mb-8">
          Log in to your Catlender account
        </p>

        <form className="space-y-6">
          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-all shadow-md hover:shadow-sky-500/20"
          >
            Log In
          </button>
        </form>

        {/* Optional: Sign Up Link */}
        <p className="mt-6 text-sm text-center text-slate-400">
          Don’t have an account?{" "}
          <a
            href="/register"
            className="text-sky-400 hover:text-sky-300 underline"
          >
            Sign up
          </a>
        </p>
      </div>
    </main>
  );
}
