import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// La publishable key es pública por diseño: la seguridad la da RLS (ver supabase/migrations).
const URL = 'https://awydrtxgtmfbmchzylze.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_LC5ZUItkWiBn4TOrUn6pbA_gkXRNTWo';

// Todas las tablas viven en el schema "yuro" (hay que exponerlo en Settings > API > Exposed schemas).
export const supabase = createClient(URL, PUBLISHABLE_KEY, {
  db: { schema: 'yuro' },
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Sin esto Supabase usa el flujo "implícito" y devuelve la sesión en #access_token, sin `code`: el login del celular no la leía.
    flowType: 'pkce',
    detectSessionInUrl: Platform.OS === 'web', // en el celular el código se canjea a mano (ver auth.ts)
  },
});
