import { useState, type FormEvent } from "react";
import { useSession, signIn, signUp, signOut } from "./lib/auth-client";

export default function App() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <div className="center muted">載入中…</div>;
  }
  if (!session) {
    return <Login />;
  }
  return <Home name={session.user.name} email={session.user.email} />;
}

function Login() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res =
        mode === "signup"
          ? await signUp.email({ email, password, name })
          : await signIn.email({ email, password });
      if (res.error) setError(res.error.message ?? "登入失敗");
    } catch (err) {
      setError(err instanceof Error ? err.message : "發生錯誤，請稍後再試");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <h1 className="brand">台股筆記</h1>
        <p className="muted small">
          {mode === "signin" ? "登入以繼續" : "建立帳號"}
        </p>

        {mode === "signup" && (
          <label>
            名稱
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          密碼
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={8}
            required
          />
        </label>

        {error && <p className="error small">{error}</p>}

        <button type="submit" disabled={busy}>
          {busy ? "處理中…" : mode === "signin" ? "登入" : "註冊"}
        </button>

        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
          }}
        >
          {mode === "signin" ? "還沒有帳號？註冊" : "已有帳號？登入"}
        </button>
      </form>
    </div>
  );
}

function Home({ name, email }: { name: string; email: string }) {
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand small">台股筆記</span>
        <span className="grow" />
        <span className="muted small">{name || email}</span>
        <button className="ghost" onClick={() => signOut()}>
          登出
        </button>
      </header>
      <main className="center">
        <div className="card">
          <h1 className="brand">M1 完成 ✅</h1>
          <p className="muted">
            登入與部署骨架已就緒。接下來 M2 會接上資料來源與 K 線圖。
          </p>
        </div>
      </main>
    </div>
  );
}
