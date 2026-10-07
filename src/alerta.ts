import { Alert, Platform } from 'react-native';

// En web existen alert/confirm del navegador (el tsconfig no incluye los tipos del DOM).
const web = globalThis as unknown as { alert: (m: string) => void; confirm: (m: string) => boolean };

// Alert de React Native no hace nada en web: ahí se usan los diálogos del navegador.
export const avisar = (msg: string) => (Platform.OS === 'web' ? web.alert(msg) : Alert.alert(msg));

export const confirmar = (titulo: string, msg: string, ok: string) =>
  new Promise<boolean>((resolve) => {
    if (Platform.OS === 'web') return resolve(web.confirm(`${titulo}\n\n${msg}`));
    Alert.alert(titulo, msg, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });

// Texto legible de cualquier error (Error, error de Supabase u objeto suelto); también lo deja en la consola.
export const mensajeError = (e: unknown): string => {
  console.error('[yuro]', e);
  if (typeof e === 'string' && e) return e;
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>;
    const partes = [o.message, o.error_description, o.details, o.hint, o.code].filter((x): x is string => typeof x === 'string' && !!x);
    if (partes.length) return partes.join(' · ');
    const nombre = e instanceof Error ? e.name : '';
    try { return `${nombre} ${JSON.stringify(e)}`.trim(); } catch { /* sin detalle */ }
  }
  return 'Error desconocido (mirá la consola del navegador)';
};
