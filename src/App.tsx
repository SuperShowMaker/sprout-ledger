// 青禾记账 - 主应用
import { useEffect, useState, type ReactNode } from 'react';
import { App as AntApp } from 'antd';
import { CalendarOutlined, PieChartOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import { DataProvider } from './DataContext';
import { initDatabase, getAllExpensesForExport } from './db';
import { shouldShowReminder, daysSince } from './checkBackupReminder';
import RecordFlow from './components/RecordFlow';
import ExpenseList from './components/ExpenseList';
import MonthlyStats from './components/MonthlyStats';
import BudgetPage from './components/BudgetPage';
import Profile from './components/Profile';
import './App.css';

function AppContent() {
  const { t } = useI18n();
  const { modal } = AntApp.useApp();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState('');
  const [recordOpen, setRecordOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = sessionStorage.getItem('sprout_tab');
      return (saved === 'list' || saved === 'stats' || saved === 'budget' || saved === 'profile') ? saved : 'list';
    } catch { return 'list'; }
  });
  const switchTab = (tab: string) => {
    setActiveTab(tab);
    try { sessionStorage.setItem('sprout_tab', tab); } catch {}
  };

  useEffect(() => {
    initDatabase()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error('数据库初始化失败:', err);
        setDbError(String(err));
      });
  }, []);

  // 备份提醒
  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      try {
        const lastExport = localStorage.getItem('sprout_last_export');
        const lastReminded = localStorage.getItem('sprout_reminded_at');
        const today = dayjs().format('YYYY-MM-DD');

        let firstRecordDate: string | null = null;
        let reminderDays = 0;

        if (lastExport) {
          reminderDays = daysSince(lastExport, today);
        } else {
          const all = await getAllExpensesForExport();
          if (all.length > 0) {
            const firstTs = all.reduce((min, e) =>
              (e.created_at && e.created_at < min) ? e.created_at : min,
              all[0].created_at || ''
            );
            if (firstTs) {
              firstRecordDate = firstTs;
              reminderDays = daysSince(firstTs, today);
            }
          }
        }

        if (!shouldShowReminder({ lastExportDate: lastExport, firstRecordDate, lastRemindedDate: lastReminded, today })) return;

        modal.confirm({
          title: t('backup.title'),
          content: t('backup.content', { days: String(reminderDays) }),
          okText: t('backup.exportNow'),
          cancelText: t('backup.remindLater'),
          centered: true,
          onOk: () => {
            sessionStorage.setItem('sprout_auto_export', '1');
            switchTab('profile');
          },
          onCancel: () => {
            localStorage.setItem('sprout_reminded_at', today);
          },
        });
      } catch {}
    })();
  }, [dbReady]);

  if (dbError) {
    return (
      <div className="loading-screen" style={{ color: '#ff4d4f' }}>
        <h2>🌱 {t('app.title')}</h2>
        <p>{t('app.initError')}</p>
        <p style={{ fontSize: 12, maxWidth: 400, wordBreak: 'break-all' }}>{dbError}</p>
      </div>
    );
  }

  if (!dbReady) {
    return (
      <div className="loading-screen">
        <h2>🌱 {t('app.title')}</h2>
        <p>{t('app.loading')}</p>
      </div>
    );
  }

  const tabs: { key: string; icon: ReactNode }[] = [
    { key: 'list', icon: <CalendarOutlined /> },
    { key: 'stats', icon: <PieChartOutlined /> },
    { key: 'budget', icon: <WalletOutlined /> },
    { key: 'profile', icon: <UserOutlined /> },
  ];
  const tabLabels: Record<string, string> = {
    list: t('tab.list'),
    stats: t('tab.stats'),
    budget: t('tab.budget'),
    profile: t('tab.profile'),
  };
  const renderTab = (tab: { key: string; icon: ReactNode }) => (
    <div
      key={tab.key}
      className={`app-nav-item ${activeTab === tab.key ? 'active' : ''}`}
      onClick={() => switchTab(tab.key)}
    >
      <span className="app-nav-icon">{tab.icon}</span>
      <span className="app-nav-label">{tabLabels[tab.key]}</span>
    </div>
  );

  return (
    <DataProvider>
      <div className="app-container">
        <div className="app-content">
          {activeTab === 'list' && <ExpenseList />}
          {activeTab === 'stats' && <MonthlyStats />}
          {activeTab === 'budget' && <BudgetPage />}
          {activeTab === 'profile' && <Profile />}
        </div>

        <nav className="app-nav">
          {tabs.slice(0, 2).map(renderTab)}
          <div className="app-nav-fab" onClick={() => setRecordOpen(true)}>
            <span className="app-nav-fab-btn">＋</span>
            <span className="app-nav-fab-label">{t('nav.add')}</span>
          </div>
          {tabs.slice(2).map(renderTab)}
        </nav>
      </div>

      <RecordFlow
        open={recordOpen}
        onClose={() => setRecordOpen(false)}
        onSaved={() => { setRecordOpen(false); switchTab('list'); }}
      />
    </DataProvider>
  );
}

function App() {
  return (
    <I18nProvider>
      <AntApp>
        <AppContent />
      </AntApp>
    </I18nProvider>
  );
}

export default App;
