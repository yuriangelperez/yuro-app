import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { mensajeError } from '../src/alerta';
import { entrarConGoogle } from '../src/auth';
import { c } from '../src/theme';
import { centrado, tap } from '../src/ui';

// Pantalla de entrada: sin sesión no se ve nada más (ver el guard en _layout.tsx).
export default function Login() {
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entrar = async () => {
    tap(true);
    setError(null);
    setTrabajando(true);
    try {
      await entrarConGoogle(); // en web redirige a Google; en el celular abre el navegador y vuelve sola
    } catch (e) {
      setError(mensajeError(e));
    }
    setTrabajando(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', padding: 24 }}>
      <View style={centrado(420)}>
        <Text style={{ fontSize: 64, textAlign: 'center' }}>💸</Text>
        <Text style={{ color: c.text, fontSize: 34, fontWeight: '800', textAlign: 'center', marginTop: 8 }}>Yuro</Text>
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 36, lineHeight: 22 }}>
          Tus gastos, ingresos y ahorros en un solo lugar. Entrá para ver tus datos en cualquier dispositivo.
        </Text>

        <Pressable
          onPress={entrar}
          disabled={trabajando}
          style={{ backgroundColor: c.accent, padding: 16, borderRadius: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', opacity: trabajando ? 0.7 : 1 }}
        >
          {trabajando && <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{trabajando ? 'Abriendo Google…' : 'Continuar con Google'}</Text>
        </Pressable>

        {!!error && <Text style={{ color: c.gasto, marginTop: 14, textAlign: 'center', lineHeight: 19 }}>{error}</Text>}

        <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center', marginTop: 28, lineHeight: 18 }}>
          Solo usamos tu cuenta de Google para identificarte. Tus datos son privados: nadie más puede verlos.
        </Text>
      </View>
    </View>
  );
}
