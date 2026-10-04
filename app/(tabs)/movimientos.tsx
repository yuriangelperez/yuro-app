import { FlatList, RefreshControl, View } from 'react-native';
import { useFinanzas } from '../../src/store';
import { c } from '../../src/theme';
import { Fab, Fila } from '../../src/ui';

export default function Movimientos() {
  const { movimientos, sincronizando, sincronizar } = useFinanzas();
  const ordenados = [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha));
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList
        data={ordenados}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <Fila m={item} />}
        refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={sincronizar} tintColor={c.text} />}
      />
      <Fab />
    </View>
  );
}
