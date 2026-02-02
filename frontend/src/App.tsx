import { useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Header } from "./components/Layout/Header";
import { Sidebar } from "./components/Layout/Sidebar";
import { ErrorBoundary } from "./components/Layout/ErrorBoundary";
import { ToastContainer } from "./components/Toast/ToastContainer";
import { routes } from "./routes";
import { DevAuthBypass } from "./components/DevAuthBypass";
import { LoadingOverlay } from "./components/Loading/LoadingSpinner";
import { useLoading } from "./context/LoadingContext";
import ChatWidget from "./components/chatbot/ChatWidget";

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isAuthPage = location.pathname === "/auth";
  const isHomePage = location.pathname === "/";
  const { isLoading, loadingMessage } = useLoading();

  if (isAuthPage) {
    return (
      <>
        <Routes>
          <Route
            path="/auth"
            element={routes.find((r) => r.path === "/auth")?.element}
          />
        </Routes>
        <DevAuthBypass />
      </>
    );
  }

  if (isHomePage) {
    return (
      <>
        <Routes>
          <Route
            path="/"
            element={routes.find((r) => r.path === "/")?.element}
          />
        </Routes>
        <DevAuthBypass />
      </>
    );
  }

  return (
    <ErrorBoundary>
      <ToastContainer />

      <div className="min-h-screen bg-neutral-50 dark:bg-slate-900">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

        <div className="flex">
          <Sidebar
            activeTab={location.pathname.slice(1) || "dashboard"}
            onTabChange={() => setSidebarOpen(false)}
            isOpen={sidebarOpen}
          />

          {sidebarOpen && (
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 md:hidden transition-all"
              onClick={() => setSidebarOpen(false)}
            />
          )}

          <main className="flex-1 md:ml-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <Routes>
                {routes.map((route) => (
                  <Route
                    key={route.path}
                    path={route.path}
                    element={route.element}
                  />
                ))}
                <Route
                  path="*"
                  element={routes.find((r) => r.path === "/")?.element}
                />
              </Routes>
            </div>
          </main>
        </div>
      </div>

      <DevAuthBypass />
      <LoadingOverlay show={isLoading} message={loadingMessage} />

      {/* ✅ Chatbot mounted ONCE, globally */}
      <ChatWidget />
    </ErrorBoundary>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
