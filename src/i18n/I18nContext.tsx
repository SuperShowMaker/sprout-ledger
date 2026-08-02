// 青禾记账 - 多语言 + 暗色模式上下文
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import type { Lang } from './translations';
import { t as translate } from './translations';

interface I18nContextType {
  lang: Lang;
  darkMode: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  toggleLang: () => void;
  toggleDark: () => void;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'zh',
  darkMode: false,
  t: (key: string) => key,
  toggleLang: () => {},
  toggleDark: () => {},
});

const getDarkPref = (): boolean => {
  try { return localStorage.getItem('sprout_darkMode') === '1'; } catch { return false; }
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('zh');
  const [darkMode, setDarkMode] = useState(getDarkPref);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text = translate(lang, key);
      if (vars) Object.entries(vars).forEach(([k, v]) => { text = text.replace(`{${k}}`, String(v)); });
      return text;
    },
    [lang]
  );

  const toggleLang = useCallback(() => {
    const newLang = lang === 'zh' ? 'en' : 'zh';
    setLang(newLang);
    dayjs.locale(newLang === 'zh' ? 'zh-cn' : 'en');
  }, [lang]);

  const toggleDark = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('sprout_darkMode', next ? '1' : '0');
      return next;
    });
  }, []);

  return (
    <I18nContext.Provider value={{ lang, darkMode, t, toggleLang, toggleDark }}>
      <ConfigProvider
        locale={lang === 'zh' ? zhCN : enUS}
        theme={{
          algorithm: darkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: { colorPrimary: '#52c41a', borderRadius: 8 },
        }}
      >
        {children}
      </ConfigProvider>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
