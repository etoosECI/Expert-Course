import { createLocalStorage } from './local.js';
import { createSupabaseStorage } from './supabase.js';
export function createStorage(config) {
  return config.storage === 'supabase' ? createSupabaseStorage(config) : createLocalStorage(config);
}
