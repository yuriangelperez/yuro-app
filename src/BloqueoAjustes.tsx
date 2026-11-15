import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { avisar } from './alerta';
import { useBloqueo } from './bloqueo';
import { TecladoPin } from './PantallaBloqueo';
import { c } from './theme';
import { Card, s, tap, Titulo } from './ui';

type Paso = null | 'nuevo' | 'repetir' | 'quitar';

// Tarjeta de Ajustes: activar/desactivar el PIN y la huella
export default function BloqueoAjustes() {
  const { activo, biometria, biometriaDisponible, fijarPin, quitarPin, setBiometria, bloquear } = useBloqueo();
  const [paso, setPaso] = useState<Paso>(null);
  const [primero, setPrimero] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cancelar = () => { setPaso(null); setPrimero(''); setError(null); };

  if (paso) {
    return (
      <Card>
        <TecladoPin
          titulo={paso === 'nuevo' ? 'Elegí un PIN' : paso === 'repetir' ? 'Repetí el PIN' : 'Ingresá tu PIN actual'}
          sub={paso === 'quitar' ? 'Para desactivar el bloqueo' : 'De 4 dígitos. No lo olvides: si lo perdés tenés que borrar los datos de la app.'}
          error={error}
          onPin={async (pin) => {
            setError(null);
            if (paso === 'nuevo') { setPrimero(pin); setPaso('repetir'); return; }
            if (paso === 'repetir') {
              if (pin !== primero) { setError('No coinciden, probá de nuevo'); setPaso('nuevo'); setPrimero(''); return; }
              await fijarPin(pin);
              cancelar();
              avisar('Bloqueo activado. Se pide al abrir la app y después de 30 segundos en segundo plano.');
              return;
            }
            if (await quitarPin(pin)) { cancelar(); avisar('Bloqueo desactivado.'); } else setError('PIN incorrecto');
          }}
        />
        <Pressable onPress={cancelar} style={{ alignItems: 'center', paddingBottom: 8 }}><Text style={{ color: c.muted }}>Cancelar</Text></Pressable>
      </Card>
    );
  }

  return (
    <Card>
      <Titulo t="Bloqueo de la app" sub="Pedir un PIN para abrir Yuro: tus finanzas quedan protegidas si alguien usa tu teléfono." />
      {Platform.OS === 'web' && <Text style={{ color: c.aviso, fontSize: 12, marginBottom: 8 }}>En la versión web el PIN no se guarda de forma segura: usalo solo para probar. En el celular se guarda en el almacén seguro del teléfono.</Text>}
      {activo ? (
        <>
          <Pressable onPress={() => { tap(); bloquear(); }} style={{ paddingVertical: 10 }}><Text style={{ color: c.text }}>Bloquear ahora</Text></Pressable>
          {biometriaDisponible && (
            <Pressable onPress={() => { tap(); setBiometria(!biometria); }} style={{ paddingVertical: 10, flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ color: c.text, flex: 1 }}>Desbloquear también con huella o rostro</Text>
              <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: biometria ? c.accent : c.border, justifyContent: 'center', paddingHorizontal: 3 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: biometria ? 'flex-end' : 'flex-start' }} />
              </View>
            </Pressable>
          )}
          <Pressable onPress={() => { tap(); setPaso('quitar'); }} style={{ paddingVertical: 10 }}><Text style={{ color: c.gasto }}>Desactivar el bloqueo</Text></Pressable>
        </>
      ) : (
        <Pressable onPress={() => { tap(); setPaso('nuevo'); }} style={{ backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: 'center' }}>
          <Text style={{ color: c.sobre, fontWeight: '800' }}>Activar PIN</Text>
        </Pressable>
      )}
    </Card>
  );
}
