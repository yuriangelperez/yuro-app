import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useBloqueo } from './bloqueo';
import { c } from './theme';

const TECLAS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['bio', '0', '⌫']];
export const LARGO_PIN = 4;

// Teclado numérico + puntos. Se usa para desbloquear y también (con `onPin`) para elegir un PIN nuevo.
export const TecladoPin = ({ titulo, sub, error, onPin, biometria, onBiometria, deshabilitado }: {
  titulo: string; sub?: string; error?: string | null; onPin: (pin: string) => void; biometria?: boolean; onBiometria?: () => void; deshabilitado?: boolean;
}) => {
  const [pin, setPin] = useState('');
  useEffect(() => { if (error) setPin(''); }, [error]);
  const pulsar = (k: string) => {
    if (deshabilitado) return;
    if (k === 'bio') return onBiometria?.();
    if (k === '⌫') return setPin((p) => p.slice(0, -1));
    const nuevo = (pin + k).slice(0, LARGO_PIN);
    setPin(nuevo);
    if (nuevo.length === LARGO_PIN) {
      onPin(nuevo);
      setTimeout(() => setPin(''), 150);
    }
  };
  return (
    <View style={{ alignItems: 'center', padding: 24 }}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: '800', marginBottom: 6 }}>{titulo}</Text>
      {!!sub && <Text style={{ color: c.muted, marginBottom: 8, textAlign: 'center' }}>{sub}</Text>}
      <View style={{ flexDirection: 'row', gap: 14, marginVertical: 18 }}>
        {Array.from({ length: LARGO_PIN }, (_, i) => <View key={i} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: i < pin.length ? c.accent : c.border }} />)}
      </View>
      <Text style={{ color: c.gasto, minHeight: 20, marginBottom: 8, textAlign: 'center' }}>{error ?? ''}</Text>
      {TECLAS.map((fila, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 14, marginBottom: 14 }}>
          {fila.map((k) => {
            const oculta = k === 'bio' && !biometria;
            return (
              <Pressable
                key={k}
                disabled={oculta || deshabilitado}
                onPress={() => pulsar(k)}
                style={({ pressed }) => ({ width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: oculta ? 'transparent' : pressed ? c.border : c.card, opacity: deshabilitado ? 0.4 : 1 })}
              >
                <Text style={{ color: c.text, fontSize: k === 'bio' ? 26 : 26, fontWeight: '600' }}>{k === 'bio' ? (oculta ? '' : '🫆') : k}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

// Pantalla que tapa toda la app mientras está bloqueada
export default function PantallaBloqueo() {
  const { desbloquear, usarBiometria, biometria, esperaHasta } = useBloqueo();
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Al abrir se ofrece la huella enseguida
  useEffect(() => { if (biometria) usarBiometria(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const espera = Math.max(0, Math.ceil((esperaHasta - ahora) / 1000));
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 40, marginBottom: 8 }}>🔒</Text>
      <TecladoPin
        titulo="Yuro bloqueado"
        sub={espera ? `Demasiados intentos. Esperá ${espera} s.` : 'Ingresá tu PIN'}
        error={error}
        deshabilitado={espera > 0}
        biometria={biometria}
        onBiometria={() => { usarBiometria(); }}
        onPin={async (pin) => setError((await desbloquear(pin)) ? null : 'PIN incorrecto')}
      />
    </View>
  );
}
