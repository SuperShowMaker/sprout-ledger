// 青禾记账 - 分类管理（参考「记一笔」网格：一级网格 + 点选后子类 pill 区；角标锁/红✕；长按拖拽排序）
import { useEffect, useRef, useState } from 'react';
import { Input, message } from 'antd';
import { LeftOutlined, PlusOutlined, CloseOutlined, LockOutlined, DeleteOutlined } from '@ant-design/icons';
import {
  getCategories,
  addCategory1,
  addCategory2,
  deleteCategory1,
  deleteCategory2,
  updateCategory1Sort,
  updateCategory2Sort,
  countExpensesByCategory,
  TxType,
} from '../db';
import { useI18n } from '../i18n/I18nContext';
import { translateCategory } from '../i18n/categoryTranslations';
import { defaultCat1Names, defaultCategories, incomeCat1Names } from '../data/categories';
import { useBackBlock } from '../useBackBlock';

interface Props {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type CatKind = 'cat1' | 'cat2' | 'income';

type SheetState =
  | { mode: 'confirm-delete'; kind: CatKind; name: string; parent?: string; count: number }
  | { mode: 'add'; kind: CatKind }
  | null;

interface Cat1 { name: string; icon: string; children: string[] }

// 拖拽中的项（区分层级：一级 / 子类 / 收入）
interface DragState { kind: CatKind; name: string; parent?: string }

// emoji 语义分组：支出 / 收入各一套（添加面板用，含自定义扩充）
const EMOJI_GROUPS: { zh: string; en: string; icons: string[] }[] = [
  { zh: '饮食', en: 'Food', icons: ['🍜', '🍚', '🍰', '🍎', '🍺', '☕', '🥤', '🍖', '🍔', '🍟', '🍣', '🥟', '🍲', '🧋'] },
  { zh: '交通', en: 'Transport', icons: ['🚗', '🚌', '🚇', '✈️', '🚕', '⛽', '🚲', '🚄', '🚢', '🛵', '🚚'] },
  { zh: '购物', en: 'Shopping', icons: ['🛒', '👗', '💄', '📱', '🎁', '🧴', '💍', '👜', '👠', '🧥', '⌚'] },
  { zh: '居家', en: 'Home', icons: ['🏠', '🛋', '💡', '🔧', '🧹', '🐱', '🪴', '🛏', '🚿', '🪑', '📺', '🧺'] },
  { zh: '娱乐', en: 'Leisure', icons: ['🎮', '🎬', '🎵', '🏸', '⚽', '🎨', '📚', '🎳', '🎯', '🎤', '🎪', '🧗'] },
  { zh: '健康', en: 'Health', icons: ['💊', '🏥', '💉', '🦷', '🏋', '🧘', '🧑‍⚕️', '🦺', '😷', '💪'] },
  { zh: '其他', en: 'Others', icons: ['🧾', '🔋', '📷', '🖥', '🎸', '🃏', '🍼', '🧸'] },
];
const INCOME_EMOJI_GROUPS: { zh: string; en: string; icons: string[] }[] = [
  { zh: '收入', en: 'Income', icons: ['💰', '💳', '🏦', '📈', '🧧', '🪙', '💻', '🎓', '🎁', '🎟', '💎', '🏅', '🛍'] },
];

export default function CategoryManager({ open, onClose, onChanged }: Props) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<TxType>('expense');
  const [expenseCats, setExpenseCats] = useState<Cat1[]>([]);
  const [incomeCats, setIncomeCats] = useState<Cat1[]>([]);
  const [selectedCat1, setSelectedCat1] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [inputValue, setInputValue] = useState('');
  const [inputIcon, setInputIcon] = useState('📦');
  const [inputError, setInputError] = useState('');
  const [deleting, setDeleting] = useState(false);

  // 子类别内联添加（不跳页，原页面输入）
  const [inlineAdd, setInlineAdd] = useState(false);
  const [inlineValue, setInlineValue] = useState('');
  const [inlineError, setInlineError] = useState('');

  // B4 新类滚动定位：记录刚添加的项，渲染后滚动 + 高亮
  const [highlight, setHighlight] = useState<{ name: string; parent?: string } | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 无障碍：记录面板触发元素，关闭时把焦点还回去
  const lastFocus = useRef<HTMLElement | null>(null);

  // 拖拽排序状态（pointer 自定义拖拽：绕过 HTML5 DnD，WebView 兼容）
  // dragRef/dropTargetRef 供事件回调同步读取（pointermove/up 紧跟状态变化，避免 React state 异步读到旧值）
  const [dragName, setDragName] = useState<string | null>(null);     // 渲染：被拖项
  const [dropTarget, setDropTarget] = useState<{ name: string; parent?: string; position: 'before' | 'after' } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dropTargetRef = useRef<typeof dropTarget>(null);
  const draggingRef = useRef(false);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  // 锁定判断：cat2 按「父类 + 名字」查预设子类，避免自定义父类下与预设子类重名的分类被误锁
  const isLocked = (kind: CatKind, name: string, parent?: string) =>
    kind === 'cat1' ? defaultCat1Names.includes(name)
    : kind === 'cat2' ? (defaultCategories.find((c) => c.name === parent)?.children.includes(name) ?? false)
    : incomeCat1Names.includes(name);

  const load = async () => {
    const [exp, inc] = await Promise.all([getCategories('expense'), getCategories('income')]);
    setExpenseCats(exp);
    setIncomeCats(inc);
  };

  // 无障碍/IME 守卫：纯辅助，早于早退定义（避免 hooks 闭包引用未声明 const）
  const guardEnter = (fn: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    fn();
  };
  const rememberFocus = () => { lastFocus.current = document.activeElement as HTMLElement | null; };
  const closeSheet = () => { setSheet(null); lastFocus.current?.focus(); };

  useEffect(() => {
    if (open) { load(); setTab('expense'); setSelectedCat1(null); setSheet(null); resetDrag(); }
  }, [open]);

  // B4：提交成功后滚动到新 cell 并短暂高亮（900ms 后移除）
  useEffect(() => {
    if (!highlight) return;
    const el = highlight.parent
      ? Array.from(document.querySelectorAll('.catmgr-sub-cell')).find((n) =>
          (n as HTMLElement).dataset.name === highlight.name && (n as HTMLElement).dataset.parent === highlight.parent)
      : Array.from(document.querySelectorAll('.catmgr-cell')).find((n) => (n as HTMLElement).dataset.name === highlight.name);
    if (!el) return;
    el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    el.classList.add('catmgr-highlight');
    highlightTimer.current = setTimeout(() => {
      el.classList.remove('catmgr-highlight');
      setHighlight(null);
    }, 900);
    return () => { if (highlightTimer.current) clearTimeout(highlightTimer.current); };
  }, [highlight]);

  // 无障碍：Esc 优先关面板/确认视图，其次退出页面（与返回键同序）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sheet) setSheet(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sheet]);

  // 返回键：优先关面板/确认视图，其次退出页面
  useBackBlock(open, () => { if (sheet) setSheet(null); else onClose(); });

  if (!open) return null;

  const currentCats = tab === 'expense' ? expenseCats : incomeCats;
  const selectedCat = tab === 'expense' ? expenseCats.find((c) => c.name === selectedCat1) ?? null : null;

  // ============ 添加（全屏面板：仅一级/收入；子类别走内联） ============
  const openAdd = (kind: CatKind) => {
    rememberFocus();
    setInputValue('');
    setInputError('');
    // 图标沿用上次选择（会话内），避免连续添加全是默认 📦
    setSheet({ mode: 'add', kind });
  };

  const submitAdd = async () => {
    if (!sheet || sheet.mode !== 'add') return;
    const name = inputValue.trim();
    if (!name) return;
    // 收支分类名跨 type 全局唯一（DB categories1.name UNIQUE 不区分 type），添加时同时查两套列表
    const nameExists = expenseCats.some((c) => c.name === name) || incomeCats.some((c) => c.name === name);
    if (nameExists) { setInputError(t('cat.nameExists')); return; }
    await addCategory1(name, inputIcon, sheet.kind === 'income' ? 'income' : 'expense');
    message.success(t('cat.added'));
    closeSheet();
    await load();
    setHighlight({ name, parent: undefined });
    onChanged();
  };

  // 子类别内联添加：提交后收起输入行
  const submitInline = async () => {
    if (!selectedCat1 || !selectedCat) return;
    const name = inlineValue.trim();
    if (!name) return;
    if (selectedCat.children.includes(name)) { setInlineError(t('cat.subExists')); return; }
    await addCategory2(name, selectedCat1);
    message.success(t('cat.added'));
    setInlineValue('');
    setInlineError('');
    setInlineAdd(false);
    await load();
    setHighlight({ name, parent: selectedCat1 });
    lastFocus.current?.focus();
    onChanged();
  };

  const openInline = () => {
    rememberFocus();
    setInlineValue('');
    setInlineError('');
    setInlineAdd(true);
  };

  // ============ 删除（面板内两步确认） ============
  const requestDelete = async (kind: CatKind, name: string, parent?: string) => {
    rememberFocus();
    const count = await countExpensesByCategory(kind === 'cat2' ? parent! : name, kind === 'cat2' ? name : undefined);
    setSheet({ mode: 'confirm-delete', kind, name, parent, count });
  };

  const executeDelete = async () => {
    if (!sheet || sheet.mode !== 'confirm-delete' || deleting) return;
    setDeleting(true);
    try {
      if (sheet.kind === 'cat2') await deleteCategory2(sheet.name, sheet.parent!);
      else await deleteCategory1(sheet.name);
      message.success(t(sheet.count > 0 ? 'cat.deletedWithRecords' : 'cat.deleted'));
      closeSheet();
      await load();
      onChanged();
    } catch (err) {
      message.error(`${lang === 'zh' ? '删除失败' : 'Delete failed'}: ${String(err)}`);
    } finally {
      setDeleting(false);
    }
  };

  // ============ 拖拽排序（pointer 自定义：按住移动 5px 进入拖拽，elementFromPoint 找目标） ============
  const resetDrag = () => {
    dragRef.current = null;
    dropTargetRef.current = null;
    draggingRef.current = false;
    startPosRef.current = null;
    setDragName(null);
    setDropTarget(null);
  };

  const orderByName = (cats: Cat1[], names: string[]) =>
    names.map((n) => cats.find((c) => c.name === n)).filter((c): c is Cat1 => Boolean(c));

  // 纯函数：从 list 中把 fromName 移动到 targetName 的 before/after 位置，返回新顺序；非法入参返回 null
  function computeInsertOrder<T extends string>(list: T[], fromName: T, toName: T, position: 'before' | 'after'): T[] | null {
    const from = list.indexOf(fromName);
    const to = list.indexOf(toName);
    if (from < 0 || to < 0 || from === to) return null;
    const next = [...list];
    next.splice(from, 1);
    const newTo = to > from ? to - 1 : to;
    const insertPos = position === 'before' ? newTo : newTo + 1;
    next.splice(insertPos, 0, fromName);
    return next;
  }

  const handlePointerDown = (e: React.PointerEvent, item: DragState) => {
    if (e.button !== 0) return; // 仅鼠标左键 / 触屏单点
    // 角标按下不进拖拽：避免 setPointerCapture 把 click 重定向到 cell、吞掉按钮点击
    if ((e.target as HTMLElement).closest('.catmgr-badge')) return;
    dragRef.current = item;
    startPosRef.current = { x: e.clientX, y: e.clientY };
    // 锁定指针到该元素，保证快速拖动不丢事件
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const start = startPosRef.current;
    if (!drag || !start) return;
    // 移动距离 < 5px 视为点击，不进入拖拽
    if (!draggingRef.current) {
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
      draggingRef.current = true;
      setDragName(drag.name);
    }
    // 命中当前指针位置的最近 cell/sub-cell
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const target = el?.closest('.catmgr-cell, .catmgr-sub-cell') as HTMLElement | null;
    if (!target?.dataset.name) {
      if (dropTargetRef.current) { dropTargetRef.current = null; setDropTarget(null); }
      return;
    }
    const tn = target.dataset.name;
    const tp = target.dataset.parent || undefined;
    // 排除自身 + 跨层（cat2 drag 必须同 parent；cat1/income drag 不能落子类）
    if (tn === drag.name) {
      if (dropTargetRef.current) { dropTargetRef.current = null; setDropTarget(null); }
      return;
    }
    if (drag.kind === 'cat2' && tp !== drag.parent) {
      if (dropTargetRef.current) { dropTargetRef.current = null; setDropTarget(null); }
      return;
    }
    if (drag.kind !== 'cat2' && tp) {
      if (dropTargetRef.current) { dropTargetRef.current = null; setDropTarget(null); }
      return;
    }
    // before/after：指针 y 在目标上半 → before，下半 → after
    const rect = target.getBoundingClientRect();
    const position: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    const next: { name: string; parent?: string; position: 'before' | 'after' } = { name: tn, parent: tp, position };
    dropTargetRef.current = next;
    setDropTarget(next);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const target = dropTargetRef.current;
    const wasDragging = draggingRef.current;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    if (wasDragging && drag && target && target.name !== drag.name) {
      e.preventDefault(); // 阻止后续 click（避免点击事件误触发）
      handleDropAt(drag, target);
    }
    resetDrag();
  };

  const handleDropAt = async (drag: DragState, target: { name: string; parent?: string; position: 'before' | 'after' }) => {
    if (drag.kind === 'cat2') {
      const parent = drag.parent!;
      const list = expenseCats.find((c) => c.name === parent)?.children ?? [];
      const next = computeInsertOrder(list, drag.name, target.name, target.position);
      if (!next) return;
      setExpenseCats((cats) => cats.map((c) => (c.name === parent ? { ...c, children: next } : c)));
      await Promise.all(next.map((n, i) => updateCategory2Sort(n, parent, i)));
    } else {
      const list = currentCats.map((c) => c.name);
      const next = computeInsertOrder(list, drag.name, target.name, target.position);
      if (!next) return;
      if (tab === 'income') setIncomeCats(orderByName(incomeCats, next));
      else setExpenseCats(orderByName(expenseCats, next));
      await Promise.all(next.map((n, i) => updateCategory1Sort(n, i)));
    }
    onChanged();
  };

  const addTitle = () => {
    if (!sheet || sheet.mode !== 'add') return '';
    // 一级类别按收支 tab 区分标题
    return sheet.kind === 'income' ? t('cat.addIncome') : t('cat.addExpenseCat');
  };

  const activeEmojiGroups = tab === 'income' ? INCOME_EMOJI_GROUPS : EMOJI_GROUPS;

  // 角标：锁定（纯展示）/ 红✕删除（点击 → 两步确认）
  const badge = (kind: CatKind, name: string, parent?: string) =>
    isLocked(kind, name, parent) ? (
      <span className="catmgr-badge lock" aria-label={t('cat.lockedAria')}><LockOutlined /></span>
    ) : (
      <button
        type="button"
        className="catmgr-badge del"
        aria-label={t('cat.deleteAria')}
        onClick={(e) => { e.stopPropagation(); requestDelete(kind, name, parent); }}
      >
        <CloseOutlined />
      </button>
    );

  // 格子属性：pointer 拖拽 + data-name/data-parent 用于命中查找
  const cellProps = (kind: CatKind, name: string, parent?: string) => {
    const item: DragState = { kind, name, parent };
    return {
      onPointerDown: (e: React.PointerEvent) => handlePointerDown(e, item),
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    };
  };

  return (
    <div className="catmgr-page">
      {/* 顶栏 */}
      <header className="catmgr-header">
        <button type="button" className="catmgr-back" onClick={onClose} aria-label={t('cat.backAria')}><LeftOutlined /></button>
        <span className="catmgr-title">{t('cat.title')}</span>
        <span style={{ width: 32 }} />
      </header>

      {/* 支出 / 收入分段 */}
      <div style={{ padding: '4px 16px 0' }}>
        <div className="stats-seg" style={{ margin: 0 }}>
          {(['expense', 'income'] as TxType[]).map((v) => (
            <span
              key={v}
              className={`stats-seg-item${tab === v ? ' active' : ''}`}
              onClick={() => { setTab(v); setSelectedCat1(null); resetDrag(); }}
            >
              {t(v === 'income' ? 'form.income' : 'form.expense')}
            </span>
          ))}
        </div>
      </div>

      {/* 一级类别网格 */}
      <div className="catmgr-body">
        <div className="catmgr-grid">
          {currentCats.map((cat) => {
            const kind = tab === 'income' ? 'income' as CatKind : 'cat1' as CatKind;
            const dragging = dragName === cat.name;
            const dropBefore = dropTarget?.name === cat.name && dropTarget.position === 'before';
            const dropAfter = dropTarget?.name === cat.name && dropTarget.position === 'after';
            return (
              <div
                key={cat.name}
                data-name={cat.name}
                className={`catmgr-cell${selectedCat1 === cat.name ? ' selected' : ''}${dragging ? ' dragging' : ''}${dropBefore ? ' drop-before' : ''}${dropAfter ? ' drop-after' : ''}`}
                onClick={() => setSelectedCat1(cat.name)}
                {...cellProps(kind, cat.name)}
              >
                <span className="catmgr-cell-icon">{cat.icon}</span>
                <span className="catmgr-cell-name">{translateCategory(lang, cat.name)}</span>
                {badge(kind, cat.name)}
              </div>
            );
          })}
          <button type="button" className="catmgr-cell-add" onClick={() => openAdd(tab === 'income' ? 'income' : 'cat1')}>
            <PlusOutlined />
            <span>{tab === 'income' ? t('cat.addIncome') : t('cat.addCat1')}</span>
          </button>
        </div>

        {/* 子类别区（支出、点选一级后浮现；添加为原页面内联输入，不跳页） */}
        {tab === 'expense' && selectedCat && (
          <div className="catmgr-sub-section">
            <div className="catmgr-sub-grid">
              {selectedCat.children.map((sub) => {
                const dragging = dragName === sub;
                const dropBefore = dropTarget?.name === sub && dropTarget.position === 'before';
                const dropAfter = dropTarget?.name === sub && dropTarget.position === 'after';
                return (
                  <div
                    key={sub}
                    data-name={sub}
                    data-parent={selectedCat.name}
                    className={`catmgr-sub-cell${dragging ? ' dragging' : ''}${dropBefore ? ' drop-before' : ''}${dropAfter ? ' drop-after' : ''}`}
                    {...cellProps('cat2', sub, selectedCat.name)}
                  >
                    <span className="catmgr-sub-name">{translateCategory(lang, sub)}</span>
                    {badge('cat2', sub, selectedCat.name)}
                  </div>
                );
              })}
              {inlineAdd ? (
                <div className="catmgr-inline-add">
                  <Input
                    placeholder={t('cat.cat2Placeholder')}
                    value={inlineValue}
                    status={inlineError ? 'error' : undefined}
                    onChange={(e) => { setInlineValue(e.target.value); if (inlineError) setInlineError(''); }}
                    onPressEnter={guardEnter(submitInline)}
                    maxLength={12}
                    autoFocus
                  />
                  <button type="button" className="catmgr-inline-cancel" onClick={() => setInlineAdd(false)}>{t('cat.cancel')}</button>
                  <button type="button" className="catmgr-inline-ok" disabled={!inlineValue.trim()} onClick={submitInline}>{t('cat.ok')}</button>
                  {inlineError && <div className="sheet-input-error">{inlineError}</div>}
                </div>
              ) : (
                <button type="button" className="catmgr-sub-add" onClick={openInline}>
                  <PlusOutlined />
                  <span>{t('cat.addCat2')}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 删除确认底部面板 */}
      {sheet?.mode === 'confirm-delete' && (
        <>
          <div className="sheet-mask" onClick={closeSheet} />
          <div className="sheet-panel" role="dialog" aria-modal="true">
            <div className="sheet-grabber" />
            <div className="sheet-confirm">
              <div className="sheet-confirm-icon"><DeleteOutlined /></div>
              <div className="sheet-title">{t('cat.deleteTitle')}「{translateCategory(lang, sheet.name)}」</div>
              <p className="sheet-confirm-desc">
                {sheet.count > 0
                  ? t(sheet.kind === 'cat2' ? 'cat.deleteSubContent' : 'cat.deleteContent', { count: sheet.count })
                  : t('cat.deleteSimpleContent')}
              </p>
              <div className="sheet-btn-row">
                <button type="button" className="sheet-btn ghost" onClick={closeSheet}>
                  {t('list.cancel')}
                </button>
                <button type="button" className="sheet-btn danger" disabled={deleting} onClick={executeDelete}>
                  {t('cat.keepDelete')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 添加类别全屏面板：上半固定（大图标预览 + 类别名称），下半滚动（分组 emoji） */}
      {sheet?.mode === 'add' && (
        <div className="addcat-page" role="dialog" aria-modal="true">
          <header className="addcat-header">
            <button type="button" className="addcat-cancel" onClick={closeSheet}>{t('cat.cancel')}</button>
            <span className="addcat-title">{addTitle()}</span>
            <button
              type="button"
              className="addcat-done"
              disabled={!inputValue.trim()}
              onClick={submitAdd}
            >{t('cat.done')}</button>
          </header>
          {/* 固定区：图标 → 名称（滑动图标时保持不动） */}
          <div className="addcat-fixed">
            <div className="addcat-preview"><span>{inputIcon}</span></div>
            <div className="addcat-input-row">
              <Input
                placeholder={t('cat.cat1Placeholder')}
                value={inputValue}
                status={inputError ? 'error' : undefined}
                onChange={(e) => { setInputValue(e.target.value); if (inputError) setInputError(''); }}
                onPressEnter={guardEnter(submitAdd)}
                maxLength={12}
                autoFocus
                prefix={inputIcon}
              />
            </div>
            {inputError && <div className="sheet-input-error">{inputError}</div>}
          </div>
          {/* 滚动区：分组 emoji 选择 */}
          <div className="addcat-icon-scroll">
            {activeEmojiGroups.map((g) => (
              <div className="addcat-group" key={g.zh}>
                <div className="addcat-group-label">{lang === 'zh' ? g.zh : g.en}</div>
                <div className="addcat-group-icons">
                  {g.icons.map((emoji) => (
                    <span
                      key={emoji}
                      className={`addcat-emoji${inputIcon === emoji ? ' selected' : ''}`}
                      onClick={() => setInputIcon(emoji)}
                    >
                      {emoji}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
