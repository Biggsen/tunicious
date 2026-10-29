import { computed, readonly, ref } from 'vue';

const STORAGE_KEY = 'tunicious-theme';

function readStoredTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

const theme = ref(typeof document === 'undefined' ? 'light' : readStoredTheme());

if (typeof document !== 'undefined') {
  applyTheme(theme.value);
}

export function useTheme() {
  function setTheme(next) {
    const value = next === 'dark' ? 'dark' : 'light';
    theme.value = value;
    applyTheme(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // The class is already on the document for this session.
    }
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark');
  }

  return {
    theme: readonly(theme),
    isDark: computed(() => theme.value === 'dark'),
    setTheme,
    toggleTheme,
  };
}
