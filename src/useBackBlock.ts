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
      // 清理：回退自己 push 的 entry。但 history.back() 是异步执行的——
      // 同一批渲染里「旧弹窗关闭 + 新弹窗打开」时（如编辑弹窗点删除切到确认弹窗），
      // 新弹窗的 pushState 会先覆盖栈顶，back 误弹新 entry 触发 popstate 把新弹窗关掉。
      // 故延迟到宏任务后重新校验栈顶是否仍是自己，是才回退。
      if (history.state && history.state[key]) {
        setTimeout(() => {
          try {
            if (history.state && history.state[key]) history.back();
          } catch { /* ignore */ }
        }, 0);
      }
    };
  }, [open]);
}
