/**
 * useI18n — the cartridge follows the app's language (same hook as
 * MnemoScience). The host puts the language in the frame's query string when
 * it opens the window and broadcasts it again on every config update.
 * Outside the shell nothing broadcasts, so the page stays in English.
 */
import { useEffect, useState } from 'react';
import { onHostConfig } from '@mnemosyne_os/cartridge-sdk';
import { isLang, translate, type Key, type Lang } from './strings';

function initialLang(): Lang {
  try {
    const base = new URLSearchParams(window.location.search).get('lang')?.split('-')[0]?.toLowerCase();
    if (isLang(base)) return base;
  } catch (err) {
    console.warn('[mnemo-labwatch] language not read from the frame address', err);
  }
  return 'en';
}

export function useI18n() {
  const [lang, setLang] = useState<Lang>(initialLang);

  useEffect(() => onHostConfig((cfg) => {
    const base = cfg.lang?.split('-')[0]?.toLowerCase();
    if (isLang(base)) setLang(base);
  }, { apply: false }), []);

  return {
    lang,
    t: (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars),
  };
}
