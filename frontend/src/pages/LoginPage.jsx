import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";
import { DotindotLogo, DotindotMark } from "@/components/DotindotLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const doLogin = async (em, pw) => {
    setBusy(true);
    setError("");
    try {
      const user = await login(em, pw);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}!`);
      navigate("/dashboard");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Brand panel */}
      <div className="hidden lg:flex w-[45%] flex-col justify-between p-12 bg-gradient-to-br from-[#F26B21] to-[#FBA834] relative overflow-hidden">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -left-16 bottom-10 h-64 w-64 rounded-full bg-white/10" />
        <div className="flex items-center gap-3 relative">
          <DotindotMark size={40} light />
          <span className="text-2xl font-extrabold text-white tracking-tight">dotindot.</span>
        </div>
        <div className="relative">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-tight tracking-tight">
            One platform.<br />Every operation.
          </h1>
          <p className="mt-4 text-white/85 text-base md:text-lg max-w-md">
            Internal Operations & Growth Platform for Dotindot Creative — clients, projects, finance and growth, unified.
          </p>
        </div>
        <div className="text-white/60 text-xs relative">v2 · Ops, Growth & Granular Access</div>
      </div>

      {/* Form panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <DotindotLogo size={34} textClass="text-2xl" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Sign in to your workspace</h2>
          <p className="text-sm text-gray-500 mt-1 mb-8">Use your dotindot team credentials.</p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              doLogin(email, password);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="login-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dotindot.in"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2" data-testid="login-error">
                {error}
              </p>
            )}
            <Button
              type="submit"
              data-testid="login-submit-button"
              disabled={busy}
              className="w-full bg-[#F26B21] hover:bg-[#E05A10] text-white font-semibold"
            >
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
