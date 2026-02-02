// app/register/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {

  const router = useRouter();

  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("")
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // 🚫 stop page refresh

    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, cleanEmail, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Something went wrong");
      return;
    }

    router.push("/login");
  }

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
        
        {/* Title */}
        <h1 className="text-3xl font-bold text-center text-white mb-6">
          Create an Account
        </h1>

        <p className="text-center text-slate-400 mb-8">
          Join Catlender and start organizing your days.
        </p>

        {/* Register Form */}

        {error && (
          <p className="mb-4 text-sm text-red-500 text-center">{error}</p>
        )}


        <form className="space-y-6" onSubmit = {handleSubmit}>
          
          {/* Name */}
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Full Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="Your name"
              required
            />
          </div>

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
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="you@example.com"
              required
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-slate-300 mb-1"
            >
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="••••••••"
              required
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-semibold transition-all shadow-md hover:shadow-sky-500/20"
          >
            Create Account
          </button>
        </form>

        {/* Login Redirect */}
        <p className="mt-6 text-sm text-center text-slate-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-sky-400 hover:text-sky-300 underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
