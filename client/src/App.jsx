import React, { useState } from 'react';
import BudgetList from './pages/BudgetList';
import VisualReport from './pages/VisualReportEchartsStyle';

function App() {
  const [page, setPage] = useState('list');

  if (page === 'visual') {
    return <VisualReport onBack={() => setPage('list')} />;
  }

  return <BudgetList onGoToVisual={() => setPage('visual')} />;
}

export default App;
