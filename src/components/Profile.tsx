// 青禾记账 - 我的（设置/导入/导出/语言）
import { useState, useEffect, useReducer } from 'react';
// useReducer 状态机替代了旧的多 useState + useRef 方案，消除竞态
import { List, Switch, Modal, Select, DatePicker, Button, Space, App, message } from 'antd';
import { DownloadOutlined, UploadOutlined, SettingOutlined, GlobalOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import dayjs, { Dayjs } from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
dayjs.extend(weekOfYear);
import { useI18n } from '../i18n/I18nContext';
import { getAllExpensesForExport, batchAddExpenses, getCategories, clearAllExpenses, Expense } from '../db';
import { buildExportRow, parseImportCsv } from '../csv';
import { useData } from '../DataContext';
import CategoryManager from './CategoryManager';
import { isDebugMode, setDebugMode as _setDebugMode } from '../debug';

type ExportMode = 'all' | 'year' | 'month' | 'week' | 'range';

export default function Profile() {
  const { t, lang, darkMode, keySound, keyVibrate, toggleLang, toggleDark, toggleKeySound, toggleKeyVibrate } = useI18n();
  const { modal } = App.useApp();
  const { refresh } = useData();
  const [catManagerOpen, setCatManagerOpen] = useState(false);

  // 导出
  const [exportVisible, setExportVisible] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('all');
  const [exportYear, setExportYear] = useState<Dayjs>(dayjs());
  const [exportMonth, setExportMonth] = useState<Dayjs>(dayjs());
  const [exportWeek, setExportWeek] = useState<Dayjs>(dayjs());
  const [exportStart, setExportStart] = useState<Dayjs>(dayjs().startOf('month'));
  const [exportEnd, setExportEnd] = useState<Dayjs>(dayjs());
  const [exporting, setExporting] = useState(false);

  // 导入状态机
  type ImportPhase = 'idle' | 'importing' | 'done';
  interface ImportData { total: number; success: number; skipped: number; errors: Record<string, number>; }
  interface ImportState { phase: ImportPhase; progress: { done: number; total: number }; result: ImportData | null; error: string | null; }
  type ImportAction =
    | { type: 'START' } | { type: 'PROGRESS'; done: number; total: number }
    | { type: 'DONE'; result: ImportData } | { type: 'ERROR'; error: string } | { type: 'DISMISS' };

  function importReducer(state: ImportState, action: ImportAction): ImportState {
    switch (action.type) {
      case 'START': return { phase: 'importing', progress: { done: 0, total: 0 }, result: null, error: null };
      case 'PROGRESS': return { ...state, progress: { done: action.done, total: action.total } };
      case 'DONE': return { phase: 'done', progress: state.progress, result: action.result, error: null };
      case 'ERROR': return { phase: 'done', progress: state.progress, result: null, error: action.error };
      case 'DISMISS': return { phase: 'idle', progress: { done: 0, total: 0 }, result: null, error: null };
      default: return state;
    }
  }

  const [importState, importDispatch] = useReducer(importReducer, {
    phase: 'idle', progress: { done: 0, total: 0 }, result: null, error: null,
  });
  const [aboutVisible, setAboutVisible] = useState(false);
  const [_debugOn, _setDebugOn] = useState(() => isDebugMode());

  const handleExport = async () => {
    setExporting(true);
    try {
      const allData = await getAllExpensesForExport();
      let data: Expense[]; let suffix: string;
      switch (exportMode) {
        case 'year': { const y = exportYear.format('YYYY'); data = allData.filter(d => d.date >= `${y}-01-01` && d.date <= `${y}-12-31`); suffix = `_${y}`; break; }
        case 'month': { const m = exportMonth.format('YYYY-MM'); data = allData.filter(d => d.date >= exportMonth.startOf('month').format('YYYY-MM-DD') && d.date <= exportMonth.endOf('month').format('YYYY-MM-DD')); suffix = `_${m}`; break; }
        case 'week': { const s = exportWeek.startOf('week').format('YYYY-MM-DD'), e = exportWeek.endOf('week').format('YYYY-MM-DD'); data = allData.filter(d => d.date >= s && d.date <= e); suffix = `_W${exportWeek.week()}`; break; }
        case 'range': { const s = exportStart.format('YYYY-MM-DD'), e = exportEnd.format('YYYY-MM-DD'); data = allData.filter(d => d.date >= s && d.date <= e); suffix = `_${exportStart.format('MMDD')}-${exportEnd.format('MMDD')}`; break; }
        default: data = allData; suffix = lang === 'zh' ? '_全部' : '_All';
      }
      if (data.length === 0) { message.warning(t('list.noData')); return; }
      const BOM = '﻿';
      const header = t('export.csvHeader') + '\n';
      const rows = data.map(d => buildExportRow(d, lang)).join('\n');
      const csv = BOM + header + rows;
      const now = new Date();
      const defaultName = `${t('export.filePrefix')}${suffix}_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;
      const filePath = await save({ defaultPath: defaultName, filters: [{ name: t('export.filterName'), extensions: ['csv'] }] });
      if (filePath) {
        await writeTextFile(filePath, csv);
        message.success(t('list.exportSuccess', { count: data.length }));
        localStorage.setItem('sprout_last_export', dayjs().format('YYYY-MM-DD'));
        setExportVisible(false);
      }
    } catch (err) { message.error(`${t('export.failed')}: ${String(err)}`); }
    finally { setExporting(false); }
  };

  const handleImport = async () => {
    if (importState.phase !== 'idle') return;
    try {
      const filePath = await open({ filters: [{ name: t('export.filterName'), extensions: ['csv'] }], multiple: false });
      if (!filePath) return;
      importDispatch({ type: 'START' });
      const content = await readTextFile(String(filePath));
      if (!content.trim()) throw new Error(t('import.emptyFile'));
      if (content.length > 10 * 1024 * 1024) throw new Error(lang === 'zh' ? '文件过大（上限10MB）' : 'File too large (max 10MB)');
      const lines = content.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error(t('import.emptyFile'));
      const allCats = await getCategories('expense');
      const incomeCats = await getCategories('income');
      // 校验集合：DB 支出分类 + DB 收入分类（含自定义，收入记录导入也能通过分类校验）
      const cat1Set = new Set(allCats.map(c => c.name).concat(incomeCats.map(c => c.name)));
      const cat2Map: Record<string, Set<string>> = {};
      allCats.forEach(c => { cat2Map[c.name] = new Set(c.children); });
      const { headerInvalid, parsed, errors } = parseImportCsv(content, { cat1Set, cat2Map });
      if (headerInvalid) throw new Error(lang === 'zh' ? '仅支持青禾6/7列CSV格式' : 'Only 6/7-column Sprout CSV format supported');
      const errKey = lang === 'zh' ? '格式不符' : 'Invalid rows';
      const errorCats: Record<string, number> = {};
      if (errors.length > 0) errorCats[errKey] = errors.length;
      const existingTs = new Set<string>();
      try { const all = await getAllExpensesForExport(); all.forEach(e => { if (e.created_at) existingTs.add(e.created_at); }); } catch {}
      const seen = new Set<string>();
      const finalData = parsed.filter(r => r.created_at && !existingTs.has(r.created_at) && !seen.has(r.created_at) && seen.add(r.created_at));
      const dupSkipped = parsed.length - finalData.length;
      let successCount = 0;
      if (finalData.length > 0) {
        successCount = await batchAddExpenses(finalData, (done, total) => {
          importDispatch({ type: 'PROGRESS', done, total });
        });
      }
      importDispatch({ type: 'DONE', result: { total: lines.length - 1, success: successCount, skipped: dupSkipped, errors: errorCats } });
      if (successCount > 0) refresh();
    } catch (err) {
      importDispatch({ type: 'ERROR', error: String(err) });
    }
  };

  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', fontSize: 14 };

  // 自动打开导出（来自备份提醒的跳转）
  useEffect(() => {
    if (sessionStorage.getItem('sprout_auto_export') === '1') {
      sessionStorage.removeItem('sprout_auto_export');
      setExportVisible(true);
    }
  }, []);

  const menuItems = [
    { key: 'lang', icon: <GlobalOutlined />, label: (<div className="profile-row"><span>{lang === 'zh' ? '语言 / Language' : 'Language'}</span><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ color: '#999', fontSize: 13 }}>{lang === 'zh' ? '中文' : 'English'}</span><Switch checked={lang === 'en'} onChange={toggleLang} size="small" /></div></div>), },
    { key: 'darkMode', icon: <span style={{ fontSize: 18 }}>{darkMode ? '🌙' : '☀️'}</span>, label: (<div className="profile-row"><span>{lang === 'zh' ? '深色模式' : 'Dark Mode'}</span><Switch checked={darkMode} onChange={() => toggleDark()} size="small" /></div>), },
    { key: 'keySound', icon: <span style={{ fontSize: 18 }}>{keySound ? '🔊' : '🔇'}</span>, label: (<div className="profile-row"><span>{lang === 'zh' ? '键盘音效' : 'Key Sound'}</span><Switch checked={keySound} onChange={() => toggleKeySound()} size="small" /></div>), },
    { key: 'keyVibrate', icon: <span style={{ fontSize: 18 }}>{keyVibrate ? '📳' : '📴'}</span>, label: (<div className="profile-row"><span>{lang === 'zh' ? '键盘震动' : 'Key Vibration'}</span><Switch checked={keyVibrate} onChange={() => toggleKeyVibrate()} size="small" /></div>), },
    { key: 'export', icon: <DownloadOutlined />, label: (<div className="profile-row" onClick={() => setExportVisible(true)}><span>{lang === 'zh' ? '导出数据' : 'Export Data'}</span><span style={{ color: '#bbb' }}>›</span></div>), },
    { key: 'import', icon: <UploadOutlined />, label: (<div className="profile-row" onClick={handleImport}><span>{lang === 'zh' ? '导入数据' : 'Import Data'}</span><span style={{ color: '#bbb' }}>›</span></div>), },
    { key: 'categories', icon: <SettingOutlined />, label: (<div className="profile-row" onClick={() => setCatManagerOpen(true)}><span>{t('form.manageCategory')}</span><span style={{ color: '#bbb' }}>›</span></div>), },
    ...(_debugOn ? [{ key: 'clearData', icon: <span style={{ fontSize: 18 }}>🗑️</span>, label: (<div className="profile-row" onClick={() => { modal.confirm({ title: lang === 'zh' ? '清空全部数据' : 'Clear All Data', content: lang === 'zh' ? '此操作不可撤销，确定清空所有账单记录？' : 'This cannot be undone. Clear all expenses?', okText: lang === 'zh' ? '清空' : 'Clear', okType: 'danger', cancelText: t('list.cancel'), onOk: async () => { await clearAllExpenses(); message.success(lang === 'zh' ? '已清空' : 'Cleared'); }, }); }}><span style={{ color: '#ff4d4f' }}>{lang === 'zh' ? '清空全部数据' : 'Clear All Data'}</span></div>), }] : []),
    { key: 'about', icon: <InfoCircleOutlined />, label: (<div className="profile-row" onClick={() => setAboutVisible(true)}><span>{lang === 'zh' ? '关于青禾记账' : 'About'}</span><span style={{ color: '#999', fontSize: 13 }}>v1.2.0</span></div>), },
  ];

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-avatar"><span className="profile-avatar-icon">🌱</span></div>
        <div className="profile-name">{t('app.title')}</div>
        <div className="profile-subtitle">{lang === 'zh' ? '简洁记账 · 自有节律' : 'Simple tracking, your rhythm'}</div>
      </div>
      <List dataSource={menuItems} renderItem={(item) => (
        <List.Item style={{ cursor: 'pointer', padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, flexShrink: 0, color: '#52c41a', fontSize: 18 }}>{item.icon}</span>
            <div style={{ flex: 1 }}>{item.label}</div>
          </div>
        </List.Item>
      )} />
      <Modal title={lang === 'zh' ? '导出数据' : 'Export Data'} open={exportVisible} onCancel={() => setExportVisible(false)} footer={null} maskClosable={false} centered width="min(400px, calc(100vw - 24px))">
        <div style={{ marginBottom: 16 }}>
          <Select value={exportMode} onChange={(v) => setExportMode(v)} style={{ width: '100%', marginBottom: 12 }}>
            <Select.Option value="all">{t('list.exportAll')}</Select.Option>
            <Select.Option value="year">{t('stats.year')}</Select.Option>
            <Select.Option value="month">{t('stats.month')}</Select.Option>
            <Select.Option value="week">{lang === 'zh' ? '周' : 'Week'}</Select.Option>
            <Select.Option value="range">{lang === 'zh' ? '自定义区间' : 'Custom Range'}</Select.Option>
          </Select>
          {exportMode === 'year' && <DatePicker picker="year" value={exportYear} onChange={(d) => setExportYear(d || dayjs())} allowClear={false} style={{ width: '100%', marginBottom: 12 }} />}
          {exportMode === 'month' && <DatePicker picker="month" value={exportMonth} onChange={(d) => setExportMonth(d || dayjs())} allowClear={false} style={{ width: '100%', marginBottom: 12 }} />}
          {exportMode === 'week' && <DatePicker picker="week" value={exportWeek} onChange={(d) => setExportWeek(d || dayjs())} allowClear={false} style={{ width: '100%', marginBottom: 12 }} />}
          {exportMode === 'range' && (<Space style={{ width: '100%' }}><DatePicker value={exportStart} onChange={(d) => setExportStart(d || dayjs())} allowClear={false} /><span>~</span><DatePicker value={exportEnd} onChange={(d) => setExportEnd(d || dayjs())} allowClear={false} /></Space>)}
        </div>
        <Button type="primary" icon={<DownloadOutlined />} onClick={handleExport} loading={exporting} block style={{ borderRadius: 20, height: 40 }}>{t('list.exportCSV')}</Button>
      </Modal>
      <Modal title={t('import.title')} open={importState.phase !== 'idle'} footer={importState.phase === 'done' ? (<Button type="primary" block onClick={() => importDispatch({ type: 'DISMISS' })} style={{ borderRadius: 20, height: 40 }}>{lang === 'zh' ? '知道了' : 'Got it'}</Button>) : null} closable={true} maskClosable={true} onCancel={() => importDispatch({ type: 'DISMISS' })} centered width="min(360px, calc(100vw - 48px))">
        {importState.phase === 'done' ? (
          importState.error ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{'⚠️'}</div>
              <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600, wordBreak: 'break-all' }}>{importState.error}</h3>
            </div>
          ) : importState.result ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>{importState.result.success > 0 ? '✅' : '⚠️'}</div>
              <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>{lang === 'zh' ? '导入结果' : 'Import Results'}</h3>
              <div className="import-result-card" style={{ padding: '12px 16px', textAlign: 'left', marginBottom: 4 }}>
                <div className="import-result-row" style={rowStyle}><span>{'📄'} {lang === 'zh' ? '总行数' : 'Total'}</span><b>{importState.result.total}</b></div>
                <div className="import-result-row" style={rowStyle}><span>{'✅'} {lang === 'zh' ? '成功导入' : 'Imported'}</span><b style={{ color: '#52c41a' }}>{importState.result.success}</b></div>
                <div className="import-result-row" style={rowStyle}><span>{'🔄'} {lang === 'zh' ? '跳过重复' : 'Duplicates'}</span><b style={{ color: '#1890ff' }}>{importState.result.skipped}</b></div>
                {Object.entries(importState.result.errors).map(([cat, count]) => (
                  <div key={cat} className="import-result-row" style={rowStyle}><span>{'⚠️'} {cat}</span><b style={{ color: '#ff4d4f' }}>{count}</b></div>
                ))}
              </div>
            </div>
          ) : null
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{'📥'}</div>
            <div className="import-progress-track" style={{ height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', borderRadius: 3, background: 'linear-gradient(90deg, #52c41a, #73d13d)', transition: 'width 0.5s ease',
                width: importState.progress.total > 0 ? `${Math.round((importState.progress.done / importState.progress.total) * 100)}%` : '10%',
              }} />
            </div>
            {importState.progress.total > 0 ? (
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{importState.progress.done} / {importState.progress.total}</p>
            ) : (
              <p style={{ fontSize: 13, color: '#888', margin: 0 }}>{lang === 'zh' ? '正在处理…' : 'Processing…'}</p>
            )}
          </div>
        )}
      </Modal>
      <Modal title={null} open={aboutVisible} onCancel={() => setAboutVisible(false)} footer={null} centered width="min(320px, calc(100vw - 48px))">
        <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #f6ffed, #d9f7be)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', fontSize: 32 }}>{'🌱'}</div>
          <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#333' }}>{t('app.title')}</h2>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#52c41a', fontWeight: 500 }}>v1.2.0</p>
          <p style={{ margin: 0, fontSize: 13, color: '#888', lineHeight: 1.8 }}>{lang === 'zh' ? '简洁高效的个人记账工具\n本地存储 · 无需联网 · 数据安全' : 'Simple, efficient expense tracker.\nLocal storage · Offline · Private.'}</p>
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0', fontSize: 11, color: '#bbb' }}>Tauri 2 · React 19 · SQLite<br />{'©'} 2026 Sprout Ledger</div>
        </div>
      </Modal>
      <CategoryManager open={catManagerOpen} onClose={() => setCatManagerOpen(false)} onChanged={refresh} />
    </div>
  );
}
