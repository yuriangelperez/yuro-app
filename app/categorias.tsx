import { useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { confirmar } from '../src/alerta';
import { Icono } from '../src/iconos';
import { type Nivel, useCategorias, useFinanzas } from '../src/store';
import { c, catInfo, suave } from '../src/theme';
import { Boton, centrado, Hoja, MAX_FORM, NuevaCategoria, s, SelectorEstilo, tap, Tip } from '../src/ui';

// Lista editable. Nivel 1: cada categoría con su ícono y color; tocala para cambiarlos o borrarla. Nivel 2: chips.
const ListaCategorias = ({ nivel, titulo }: { nivel: Nivel; titulo: string }) => {
  const lista = useCategorias(nivel);
  const borrar = useFinanzas((st) => st.borrarCategoria);
  const setEstilo = useFinanzas((st) => st.setEstiloCategoria);
  useFinanzas((st) => st.catEstilos); // redibuja al cambiar un ícono o color
  const [editando, setEditando] = useState<string | null>(null);
  const onBorrar = async (x: string) => {
    tap(true);
    if (await confirmar('¿Borrar categoría?', `"${x}" deja de aparecer en la lista. Los movimientos que ya la usan no cambian.`, 'Borrar')) { borrar(nivel, x); setEditando(null); }
  };
  const info = editando ? catInfo(editando) : null;
  return (
    <>
      <Text style={[s.h, { marginTop: 10, marginBottom: 8 }]}>{titulo}</Text>
      {nivel === 'cat' ? (
        <View style={{ marginBottom: 8 }}>
          {lista.map((x) => {
            const i = catInfo(x);
            return (
              <Pressable key={x} onPress={() => { tap(); setEditando(x); }} accessibilityRole="button" accessibilityLabel={`Editar ${x}`} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, borderTopWidth: 1, borderTopColor: c.border }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: suave(i.color) }}>
                  <Icono nombre={i.icono ?? 'tag'} color={i.color} size={20} />
                </View>
                <Text style={{ color: c.text, flex: 1, fontSize: 15 }}>{x}</Text>
                <Icono nombre="lapiz" color={c.muted} size={18} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {nivel !== 'cat' && lista.map((x) => (
          <Pressable key={x} onPress={() => onBorrar(x)} accessibilityRole="button" accessibilityLabel={`Borrar ${x}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 10, minHeight: 36, borderRadius: 20, backgroundColor: c.card2, marginRight: 8, marginBottom: 8 }}>
            <Text style={{ color: c.text }}>{x}</Text>
            <Icono nombre="cerrar" color={c.gasto} size={14} />
          </Pressable>
        ))}
        <NuevaCategoria nivel={nivel} />
      </View>
      <Hoja visible={!!editando} onCerrar={() => setEditando(null)} titulo={editando ?? ''}>
        {editando && info && (
          <>
            <SelectorEstilo icono={info.icono ?? 'tag'} color={info.color} onIcono={(icono) => setEstilo(editando, { icono })} onColor={(color) => setEstilo(editando, { color })} />
            <Boton titulo="Listo" onPress={() => setEditando(null)} />
            <View style={{ height: 8 }} />
            <Boton titulo="Borrar categoría" variante="borde" color={c.gasto} icono="basura" onPress={() => onBorrar(editando)} />
          </>
        )}
      </Hoja>
    </>
  );
};

export default function Categorias() {
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40, ...centrado(MAX_FORM) }} keyboardShouldPersistTaps="handled">
      <Tip id="categorias-ayuda" emoji="🏷️">Tocá una categoría para cambiarle el ícono y el color, o borrarla. Borrar una no cambia los movimientos que ya la tienen.</Tip>
      <ListaCategorias nivel="cat" titulo="Categorías" />
      <ListaCategorias nivel="cat2" titulo="Categoría 2" />
    </ScrollView>
  );
}
