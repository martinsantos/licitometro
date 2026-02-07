import { useState, useCallback } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const newValue = value instanceof Function ? value(prev) : value;
      localStorage.setItem(key, JSON.stringify(newValue));
      return newValue;
    });
  }, [key]);

  return [storedValue, setValue];
}

export function useLocalStorageSet(key: string): [Set<string>, (updater: (prev: Set<string>) => Set<string>) => void] {
  const [value, setValue] = useState<Set<string>>(() => {
    try {
      const item = localStorage.getItem(key);
      return new Set(item ? JSON.parse(item) : []);
    } catch {
      return new Set();
    }
  });

  const setSet = useCallback((updater: (prev: Set<string>) => Set<string>) => {
    setValue(prev => {
      const next = updater(prev);
      localStorage.setItem(key, JSON.stringify(Array.from(next)));
      return next;
    });
  }, [key]);

  return [value, setSet];
}
