// src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

const SUPABASE_URL = "https://ghzwyigouhvljubitowt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdoend5aWdvdWh2bGp1Yml0b3d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwNTAyMDEsImV4cCI6MjA3MDYyNjIwMX0.N18DkGrlF-0X8Gcg-7kePK0ZJ86-1wyiZu9SeUCjWvY";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const memoryStorage: StorageLike = (() => {
  const store: Record<string, string> = {};
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
})();

function getSafeStorage(): StorageLike {
  try {
    const ls = globalThis?.localStorage;
    if (!ls) return memoryStorage;
    const testKey = "__sb_storage_test__";
    ls.setItem(testKey, testKey);
    ls.removeItem(testKey);
    return ls;
  } catch {
    return memoryStorage;
  }
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: getSafeStorage(),
    persistSession: true,
    autoRefreshToken: true,
  },
});
