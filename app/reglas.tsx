import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { avisar, confirmar } from '../src/alerta';
import { aplicables } from '../src/reglas';
import { useCategorias, useFinanzas } from '../src/store';
import { c, catInfo } from '../src/theme';
import { Card, centrado, Chip, MAX_FORM, s, tap, Tip, Titulo } from '../src/ui';
import { hoyYmd, ymdMenos } from '../src/util';

const input = { backgroundColor: c.card2, color: c.text, borderRadius: 10, padding: 10, fontSize: 16, marginBottom: 8 } as const;

export default function Reglas() {
  const { reglas, guardarRegla, borrarRegla, aplicarReglas } = useFinanzas();
  const porAnio = useFinanzas((st) => st.porAnio);
  const categorias = useCategorias('cat');
  const [patron, setPatron] = useState('');
  const [categoria, setCategoria] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const pendientes = useMemo(() => aplicables(reglas, Object.values(porAnio).flat(), ymdMenos(90), hoyYmd()).length, [reglas, porAnio]);

  const agregar = async () => {
    if (!patron.trim()) return avisar('Escribí la palabra (ej. sube)');
    if (!categoria) return avisar('Elegí la categoría');
    tap(true);
    await guardarRegla(patron, categoria);
    setPatron('');
    setCategoria('');
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Tip id="reglas-ayuda" emoji="🧠">
        Una regla dice: "si el concepto tiene esta palabra, es esta categoría". Se aplica sola a los movimientos nuevos (por notificación, Mercado Pago, extracto o a mano) y es instantánea, sin IA ni internet. Si una palabra coincide con varias reglas, gana la más específica ("uber eats" antes que "uber").
      </Tip>

      <Card>
        <Titulo t="Nueva regla" />
        <TextInput style={input} placeholder='Palabra en el concepto (ej. "sube")' placeholderTextColor={c.muted} autoCapitalize="none" value={patron} onChangeText={setPatron} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {categorias.map((x) => <Chip key={x} label={`${catInfo(x).emoji} ${x}`} on={categoria === x} onPress={() => setCategoria(categoria === x ? '' : x)} />)}
        </View>
        <Pressable onPress={agregar} style={{ backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>Guardar regla</Text>
        </Pressable>
      </Card>

      {pendientes > 0 && (
        <Pressable
          onPress={async () => {
            tap(true);
            const n = await aplicarReglas();
            setAviso(`✓ Se clasificaron ${n} movimiento(s).`);
          }}
          style={[s.tip, { borderColor: c.accent }]}
        >
          <Text style={{ color: c.text, flex: 1 }}>✨ {pendientes} movimiento(s) sin categoría de los últimos 90 días coinciden con tus reglas. <Text style={{ color: c.accent, fontWeight: '700' }}>Aplicar ahora</Text></Text>
        </Pressable>
      )}
      {aviso && <Text style={{ color: c.ingreso, marginBottom: 10 }}>{aviso}</Text>}

      <Card>
        <Titulo t={`Tus reglas (${reglas.length})`} />
        {reglas.length === 0 && <Text style={s.sub}>Todavía no tenés reglas. Creá una arriba o desde una sugerencia del asistente de IA.</Text>}
        {[...reglas].sort((a, b) => a.patron.localeCompare(b.patron)).map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.border }}>
            <View style={{ flex: 1 }}>
              <Text style={s.titulo}>"{r.patron}"</Text>
              <Text style={s.sub}>→ {catInfo(r.categoria).emoji} {r.categoria}</Text>
            </View>
            <Pressable onPress={async () => { if (await confirmar('¿Borrar la regla?', `"${r.patron}" deja de clasificar solo. Los movimientos ya clasificados no cambian.`, 'Borrar')) borrarRegla(r.id); }}>
              <Text style={{ color: c.gasto }}>🗑</Text>
            </Pressable>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
