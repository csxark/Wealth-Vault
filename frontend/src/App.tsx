import { useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import { Header } from './components/Layout/Header';
import { Sidebar } from './components/Layout/Sidebar';
import { ErrorBoundary } from './components/Layout/ErrorBoundary';
import { routes } from './routes';

function AppLayout() {
  const { isDark } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const isAuthPage = location.pathname === '/auth';
  const isHomePage = location.pathname === '/';

  if (isAuthPage) {
    return (
      <Routes>
        <Route
          path="/auth"
          element={routes.find(r => r.path === '/auth')?.element}
        />
      </Routes>
    );
  }

  if (isHomePage) {
    return (
      <Routes>
        <Route
          path="/"
          element={routes.find(r => r.path === '/')?.element}
        />
      </Routes>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-neutral-50 dark:bg-slate-900">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

        <div className="flex">
            <Sidebar
              activeTab={location.pathname.slice(1) || 'dashboard'}
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
                {routes.map((route) => {
                  // ✅ Inject Currency Converter ONLY on dashboard
                  if (route.path === '/dashboard') {
                    return (
                      <Route
                        key={route.path}
                        path={route.path}
                        element={route.element}
                      />
                    );
                  }

                  // Default routes unchanged
                  return (
                    <Route
                      key={route.path}
                      path={route.path}
                      element={route.element}
                    />
                  );
                })}
                {/* Redirect unknown routes to home */}
                <Route path="*" element={routes.find(r => r.path === '/')?.element} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
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
