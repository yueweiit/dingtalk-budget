import React, { useEffect, useState } from 'react';
import BudgetList from './pages/BudgetList';
import VisualReport from './pages/VisualReportEchartsStyle';
import Login from './pages/Login';
import { getCurrentUser, logout, logoutFromEims } from './api';

function App() {
  const [page, setPage] = useState('list');
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((result) => setUser(result.data))
      .catch(() => setUser(null))
      .finally(() => setCheckingAuth(false));
  }, []);

  if (checkingAuth) return <div style={{ padding: 40, textAlign: 'center' }}>正在检查登录状态...</div>;
  if (!user) return <Login onLoggedIn={setUser} />;

  const handleLogout = async () => {
    if (user?.authProvider === 'eims') {
      try {
        const result = await logoutFromEims();
        window.location.assign(result.data.logoutUrl);
        return;
      } catch {
        // Fall through to local session cleanup when the EIMS endpoint is unavailable.
      }
    }
    await logout().catch(() => {});
    setUser(null);
    setPage('list');
  };

  if (page === 'visual') {
    return <VisualReport onBack={() => setPage('list')} user={user} onLogout={handleLogout} />;
  }

  return <BudgetList onGoToVisual={() => setPage('visual')} user={user} onLogout={handleLogout} />;
}

export default App;
