import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useFinanzas } from '../../src/store';
import { c } from '../../src/theme';

export default function Ajustes() {
  const { url, token, setConfig, sincronizar, sincronizando, error, ultimaSync } = useFinanzas();
  const [u, setU] = useState(url);
  const [t, setT] = useState(token);
  const input = { backgroundColor: c.card, color: c.text, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: c.border } as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 16 }}>
      <Text style={{ color: c.muted, marginBottom: 12 }}>Pegá la URL del Web App de Apps Script y el token que definiste (ver README).</Text>
      <TextInput style={input} placeholder="https://script.google.com/macros/s/…/exec" placeholderTextColor={c.muted} autoCapitalize="none" value={u} onChangeText={setU} />
      <TextInput style={input} placeholder="Token" placeholderTextColor={c.muted} autoCapitalize="none" secureTextEntry value={t} onChangeText={setT} />
      <Pressable
        onPress={async () => { setConfig(u, t); await sincronizar(); }}
        style={{ backgroundColor: c.accent, padding: 16, borderRadius: 14, alignItems: 'center' }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{sincronizando ? 'Sincronizando…' : 'Guardar y sincronizar'}</Text>
      </Pressable>
      {error && <Text style={{ color: c.gasto, marginTop: 12 }}>⚠ {error}</Text>}
      {ultimaSync && <Text style={{ color: c.muted, marginTop: 12 }}>Última sincronización: {new Date(ultimaSync).toLocaleString()}</Text>}
    </View>
  );
}
