// 手机端：拦截系统返回键/手势，关闭当前弹窗而非退出 App
import { useEffect } from 'react';

export function useBackBlock(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const key = `modal_${Date.now()}`;
    history.pushState({ [key]: true }, '');
    const handler = () => {
      onClose();
    };
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      // 清理：如果当前还在这个 state 上，回退一步
      try {
        if (history.state && history.state[key]) history.back();
      } catch { /* ignore */ }
    };
  }, [open]);
}
