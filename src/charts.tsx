import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { c } from './theme';
import type { Moneda } from './types';
import { tap } from './ui';
import { MESES, money, moneyCorto, pct } from './util';

export type Porcion = { label: string; valor: number; color: string; emoji: string };

// Torta (dona) tocable: al tocar una porción se resalta y el centro muestra su detalle.
export const Dona = ({ data, sel, onSel, moneda = 'ARS', size = 210 }: { data: Porcion[]; sel: string | null; onSel: (l: string | null) => void; moneda?: Moneda; size?: number }) => {
  const grosor = 28;
  const r = (size - grosor - 12) / 2;
  const C = 2 * Math.PI * r;
  const total = data.reduce((a, d) => a + d.valor, 0);
  const elegido = data.find((d) => d.label === sel);
  let offset = 0;

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.border} strokeWidth={grosor} fill="none" />
        {data.map((d) => {
          const largo = total ? (d.valor / total) * C : 0;
          const hueco = data.length > 1 ? 3 : 0;
          const activo = sel === d.label;
          const circ = (
            <Circle
              key={d.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={d.color}
              strokeWidth={activo ? grosor + 10 : grosor}
              strokeDasharray={`${Math.max(largo - hueco, 0.5)} ${C - Math.max(largo - hueco, 0.5)}`} // período = C para que el corrimiento dé la vuelta bien
              strokeDashoffset={C / 4 - offset} // C/4: empieza arriba (12 en punto) sin rotar
              opacity={sel && !activo ? 0.3 : 1}
              fill="none"
              // En web react-native-svg pasa los props táctiles al DOM y React los rechaza: ahí se elige desde la lista.
              {...(Platform.OS !== 'web' && { onPress: () => { tap(); onSel(activo ? null : d.label); } })}
            />
          );
          offset += largo;
          return circ;
        })}
      </Svg>
      <Pressable onPress={() => onSel(null)} style={{ position: 'absolute', top: size * 0.25, left: size * 0.2, right: size * 0.2, bottom: size * 0.25, alignItems: 'center', justifyContent: 'center' }}>
        {elegido ? (
          <>
            <Text style={{ fontSize: 26 }}>{elegido.emoji}</Text>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }} numberOfLines={1}>{money(elegido.valor, moneda)}</Text>
            <Text style={{ color: elegido.color, fontWeight: '700' }}>{pct(elegido.valor, total)}%</Text>
          </>
        ) : (
          <>
            <Text style={{ color: c.muted, fontSize: 12 }}>Total</Text>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 18 }} numberOfLines={1}>{money(total, moneda)}</Text>
            <Text style={{ color: c.muted, fontSize: 11 }}>{Platform.OS === 'web' ? 'elegí abajo' : 'tocá una porción'}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
};

export type BarraMes = { ym: string; ingresos: number; gastos: number };

// Barras por mes (ingresos vs gastos). Tocar un mes lo selecciona.
export const BarrasMeses = ({ data, sel, onSel, moneda = 'ARS', alto = 150 }: { data: BarraMes[]; sel: string; onSel: (ym: string) => void; moneda?: Moneda; alto?: number }) => {
  const max = Math.max(1, ...data.flatMap((d) => [d.ingresos, d.gastos]));
  return (
    <View>
      <Text style={{ color: c.muted, fontSize: 11, marginBottom: 4 }}>{moneyCorto(max, moneda)}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: alto, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {data.map((d) => {
          const activo = d.ym === sel;
          return (
            <Pressable key={d.ym} onPress={() => { tap(); onSel(d.ym); }} style={{ flex: 1, height: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2, backgroundColor: activo ? c.card2 : 'transparent', borderTopLeftRadius: 6, borderTopRightRadius: 6 }}>
              <View style={{ width: 7, height: Math.max(2, (d.ingresos / max) * (alto - 8)), backgroundColor: c.ingreso, borderRadius: 3, opacity: activo ? 1 : 0.55 }} />
              <View style={{ width: 7, height: Math.max(2, (d.gastos / max) * (alto - 8)), backgroundColor: c.gasto, borderRadius: 3, opacity: activo ? 1 : 0.55 }} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {data.map((d) => (
          <Text key={d.ym} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: d.ym === sel ? c.text : c.muted, fontWeight: d.ym === sel ? '700' : '400' }}>
            {MESES[+d.ym.slice(5) - 1].slice(0, 1)}
          </Text>
        ))}
      </View>
    </View>
  );
};
