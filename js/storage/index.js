import { createLocalStorage } from './local.js?v=3.0';
import { createSupabaseStorage } from './supabase.js?v=3.0';
// collection: 'students'(진단실) / 'analyses'(대학 분석)
export function createStorage(config, collection = 'students') {
  return config.storage === 'supabase' ? createSupabaseStorage(config, collection) : createLocalStorage(config, collection);
}
