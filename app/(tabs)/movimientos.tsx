import { FlatList, RefreshControl, Text, View } from 'react-native';
import { useFinanzas, useMovimientosMes } from '../../src/store';
import { c } from '../../src/theme';
import { Fab, Fila, MesSelector } from '../../src/ui';

export default function Movimientos() {
  const { sincronizando, sincronizar } = useFinanzas();
  const { movimientos } = useMovimientosMes();
  const ordenados = [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <MesSelector />
      <FlatList
        data={ordenados}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Fila m={item} />}
        ListEmptyComponent={<Text style={{ color: c.muted, textAlign: 'center', marginTop: 40 }}>Sin movimientos este mes</Text>}
        refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}
      />
      <Fab />
    </View>
  );
}
