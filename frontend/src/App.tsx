import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AppShell from "./components/AppShell";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import RequireAuth from "./components/RequireAuth";

// Landing e Login ficam eager (primeira tela que a maioria dos visitantes vê).
// O resto do app só carrega depois do login, então lazy-load reduz o bundle inicial.
const Register = lazy(() => import("./pages/Register"));
const Home = lazy(() => import("./pages/Home"));
const Goals = lazy(() => import("./pages/Goals"));
const CheckIn = lazy(() => import("./pages/CheckIn"));
const Profile = lazy(() => import("./pages/Profile"));

function RouteFallback() {
  return (
    <div
      className="min-h-dvh grid place-items-center text-text-2 text-sm"
      role="status"
      aria-live="polite"
    >
      Carregando…
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />

        <Route
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route path="/app" element={<Home />} />
          <Route path="/app/check-in" element={<CheckIn />} />
          <Route path="/app/check-in/:date" element={<CheckIn />} />
          <Route path="/app/metas" element={<Goals />} />
          <Route path="/app/perfil" element={<Profile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
