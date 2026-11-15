import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { calcular, formatoCalc, pulsarCalc } from '../src/calc';
import { c } from '../src/theme';
import { centrado, MAX_FORM, s, tap } from '../src/ui';

const TECLAS = [['C', '()', '%', '÷'], ['7', '8', '9', '×'], ['4', '5', '6', '−'], ['1', '2', '3', '+'], ['0', ',', '⌫', '=']];
const OPS = '÷×−+';

// Muestra la cuenta con puntos de miles en cada número ("1500×2" → "1.500×2")
const bonita = (q: string) => q.replace(/\d+(,\d*)?/g, (n) => { const [e, d] = n.split(','); return e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d !== undefined ? ',' + d : ''); });

export default function Calculadora() {
  const [cuenta, setCuenta] = useState('');
  const [historial, setHistorial] = useState<{ cuenta: string; resultado: number }[]>([]);
  const resultado = calcular(cuenta);
  const hayOperacion = /[+−×÷%()]/.test(cuenta.replace(/^−/, ''));

  const tecla = (k: string) => {
    tap();
    if (k === '=') {
      if (resultado === null) return;
      if (hayOperacion) setHistorial((h) => [{ cuenta, resultado }, ...h].slice(0, 8));
      setCuenta(String(resultado).replace('.', ',').replace('-', '−'));
      return;
    }
    setCuenta((q) => pulsarCalc(q, k));
  };

  // En la web (compu) se escribe con el teclado físico: números, coma o punto, + − * / ( ) %, borrar, Esc (todo) y Enter (=)
  const teclaRef = useRef(tecla);
  teclaRef.current = tecla;
  useEffect(() => {
    type TeclaWeb = { key: string; target: { tagName?: string } | null; ctrlKey: boolean; metaKey: boolean; altKey: boolean; preventDefault: () => void };
    const doc = (globalThis as unknown as { document?: { addEventListener: (t: string, f: (e: TeclaWeb) => void) => void; removeEventListener: (t: string, f: (e: TeclaWeb) => void) => void } }).document;
    if (Platform.OS !== 'web' || !doc) return;
    const alTeclear = (e: TeclaWeb) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName ?? '') || e.ctrlKey || e.metaKey || e.altKey) return;
      const MAPA: Record<string, string> = { ',': ',', '.': ',', '+': '+', '-': '−', '*': '×', x: '×', '/': '÷', '%': '%', Backspace: '⌫', Enter: '=', '=': '=', Escape: 'C', '(': '()', ')': '()' };
      const k = /^\d$/.test(e.key) ? e.key : MAPA[e.key];
      if (k) { e.preventDefault(); teclaRef.current(k); }
    };
    doc.addEventListener('keydown', alTeclear);
    return () => doc.removeEventListener('keydown', alTeclear);
  }, []);

  const llevar = (tipo: 'Egreso' | 'Ingreso') => {
    if (resultado === null || resultado <= 0) return;
    tap(true);
    router.push({ pathname: '/nuevo', params: { monto: String(resultado).replace('.', ','), tipo } });
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }}>
      {/* Pantalla */}
      <View style={{ backgroundColor: c.card, borderRadius: 16, padding: 16, marginBottom: 12, minHeight: 120, justifyContent: 'flex-end' }}>
        <Text style={{ color: c.muted, fontSize: 20, textAlign: 'right' }} numberOfLines={2} adjustsFontSizeToFit>{cuenta ? bonita(cuenta) : ' '}</Text>
        <Text style={{ color: resultado !== null && resultado < 0 ? c.gasto : c.text, fontSize: 40, fontWeight: '700', textAlign: 'right', letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
          {resultado === null ? (cuenta ? '…' : '0') : formatoCalc(resultado)}
        </Text>
      </View>

      {/* Teclado */}
      {TECLAS.map((fila) => (
        <View key={fila.join()} style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          {fila.map((k) => {
            const op = OPS.includes(k);
            const igual = k === '=';
            return (
              <Pressable
                key={k}
                onPress={() => tecla(k)}
                onLongPress={k === '⌫' ? () => { tap(true); setCuenta(''); } : undefined}
                style={({ pressed }) => ({ flex: 1, height: 60, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: igual ? c.accent : pressed ? c.border : op ? c.accent + '26' : '()%C⌫'.includes(k) ? c.card2 : c.card })}
              >
                <Text style={{ color: igual ? c.sobre : op ? c.accent : c.text, fontSize: 24, fontWeight: op || igual ? '700' : '500' }}>{k}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
      <Text style={[s.sub, { textAlign: 'center', marginBottom: 14 }]}>Mantené ⌫ para borrar todo. “200 + 10%” suma el 10% de 200.{Platform.OS === 'web' ? ' En la compu escribí con el teclado: Enter es =, Esc borra todo.' : ''}</Text>

      {/* Llevar el resultado a un movimiento */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
        <Pressable onPress={() => llevar('Egreso')} disabled={!resultado || resultado <= 0} style={{ flex: 1, backgroundColor: c.gasto + '26', borderRadius: 12, padding: 13, alignItems: 'center', opacity: resultado && resultado > 0 ? 1 : 0.4 }}>
          <Text style={{ color: c.gasto, fontWeight: '700' }}>Cargar como gasto</Text>
        </Pressable>
        <Pressable onPress={() => llevar('Ingreso')} disabled={!resultado || resultado <= 0} style={{ flex: 1, backgroundColor: c.ingreso + '26', borderRadius: 12, padding: 13, alignItems: 'center', opacity: resultado && resultado > 0 ? 1 : 0.4 }}>
          <Text style={{ color: c.ingreso, fontWeight: '700' }}>Cargar como ingreso</Text>
        </Pressable>
      </View>

      {historial.length > 0 && (
        <>
          <Text style={[s.h, { marginLeft: 4, marginBottom: 8 }]}>Anteriores · tocá para reutilizar</Text>
          <View style={{ backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' }}>
            {historial.map((h, i) => (
              <Pressable key={i} onPress={() => { tap(); setCuenta(String(h.resultado).replace('.', ',')); }} style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: i < historial.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={s.sub}>{bonita(h.cuenta)}</Text>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>= {formatoCalc(h.resultado)}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}
