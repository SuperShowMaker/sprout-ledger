// 青禾记账 - 主应用
import { useEffect, useState } from 'react';
import { App as AntApp } from 'antd';
import { EditOutlined, CalendarOutlined, PieChartOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { I18nProvider, useI18n } from './i18n/I18nContext';
import { DataProvider } from './DataContext';
import { initDatabase, getAllExpensesForExport } from './db';
import { shouldShowReminder, daysSince } from './checkBackupReminder';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import MonthlyStats from './components/MonthlyStats';
import Profile from './components/Profile';
import './App.css';

function AppContent() {
  const { t } = useI18n();
  const { modal } = AntApp.useApp();
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState('');
  const [activeTab, setActiveTab] = useState(() => {
    try { return sessionStorage.getItem('sprout_tab') || 'record'; } catch { return 'record'; }
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

  const tabs = [
    { key: 'record', icon: <EditOutlined /> },
    { key: 'list', icon: <CalendarOutlined /> },
    { key: 'stats', icon: <PieChartOutlined /> },
    { key: 'profile', icon: <UserOutlined /> },
  ];

  return (
    <DataProvider>
      <div className="app-container">
        <div className="app-content">
          {activeTab === 'record' && <ExpenseForm onDone={() => switchTab('list')} />}
          {activeTab === 'list' && <ExpenseList />}
          {activeTab === 'stats' && <MonthlyStats />}
          {activeTab === 'profile' && <Profile />}
        </div>

        <nav className="app-nav">
          {tabs.map((tab) => (
            <div
              key={tab.key}
              className={`app-nav-item ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => switchTab(tab.key)}
            >
              <span className="app-nav-icon">{tab.icon}</span>
              <span className="app-nav-label">
                {tab.key === 'record' ? t('tab.record') :
                 tab.key === 'list' ? t('tab.list') :
                 tab.key === 'stats' ? t('tab.stats') : t('tab.profile')}
              </span>
            </div>
          ))}
        </nav>
      </div>
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
