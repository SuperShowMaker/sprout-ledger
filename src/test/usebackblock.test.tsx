// useBackBlock 回归测试：覆盖「旧弹窗关闭 + 新弹窗打开」同批切换时，
// 旧弹窗 cleanup 的 history.back() 不得误关新弹窗（曾导致删除确认弹窗闪现即关）。
import { useState } from 'react';
import { it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { useBackBlock } from '../useBackBlock';

// 同时挂两个 useBackBlock 的宿主组件，模拟 ExpenseList 的 editItem/deleteTarget 双弹窗
function Host() {
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delClosed, setDelClosed] = useState(false);
  useBackBlock(editOpen, () => setEditOpen(false));
  useBackBlock(delOpen, () => { setDelOpen(false); setDelClosed(true); });
  return (
    <div>
      <button onClick={() => setEditOpen(true)}>open-edit</button>
      {/* 模拟编辑弹窗内点删除：同批关闭编辑、打开删除确认 */}
      <button onClick={() => { setEditOpen(false); setDelOpen(true); }}>edit-to-delete</button>
      <div data-testid="del-open">{String(delOpen)}</div>
      <div data-testid="del-closed">{String(delClosed)}</div>
    </div>
  );
}

afterEach(() => { cleanup(); history.replaceState(null, ''); });

it('编辑弹窗切删除确认弹窗：删除弹窗不被旧弹窗的 back 误关', async () => {
  render(<Host />);
  fireEvent.click(screen.getByText('open-edit'));
  // 编辑弹窗打开（pushState 已入栈）
  await waitFor(() => expect(history.state).not.toBeNull());
  // 编辑 → 删除 同批切换
  fireEvent.click(screen.getByText('edit-to-delete'));
  // 给宏任务（cleanup 延迟 back）留出执行时间
  await new Promise((r) => setTimeout(r, 50));
  // 删除弹窗必须仍开着，且从未被关闭
  expect(screen.getByTestId('del-open').textContent).toBe('true');
  expect(screen.getByTestId('del-closed').textContent).toBe('false');
});

it('弹窗打开时用户返回键（popstate）正常关闭', async () => {
  render(<Host />);
  fireEvent.click(screen.getByText('open-edit'));
  await waitFor(() => expect(history.state).not.toBeNull());
  // 用户按返回键 → history.back() 触发 popstate → onClose
  fireEvent.click(screen.getByText('edit-to-delete'));
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.getByTestId('del-open').textContent).toBe('true');
  history.back();
  await waitFor(() => expect(screen.getByTestId('del-closed').textContent).toBe('true'));
});
