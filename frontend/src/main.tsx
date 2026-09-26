import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import { onSessionExpired } from "./lib/authEvents";
import { qk } from "./lib/queries";
import { queryClient } from "./lib/queryClient";
import "./index.css";

// Sessão expirada (401 confirmado em qualquer request autenticada, ou em
// /auth/me): limpa todo o cache privado antes de marcar `me` como deslogado.
onSessionExpired(() => {
  queryClient.clear();
  queryClient.setQueryData(qk.me, null);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
