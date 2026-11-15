import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';

// Bloqueo de la app con PIN (y huella o rostro si el teléfono los tiene). El PIN nunca se guarda: solo su hash con sal,
// en el almacén seguro del teléfono (Keychain / Keystore). En la web (solo para desarrollo) cae en AsyncStorage, que no es seguro.

const K = { hash: 'yuro-pin-hash', sal: 'yuro-pin-sal', bio: 'yuro-bio', fallos: 'yuro-pin-fallos', hasta: 'yuro-pin-hasta' };
const web = Platform.OS === 'web';
const leer = (k: string) => (web ? AsyncStorage.getItem(k) : SecureStore.getItemAsync(k));
const guardar = (k: string, v: string) => (web ? AsyncStorage.setItem(k, v) : SecureStore.setItemAsync(k, v));
const borrar = (k: string) => (web ? AsyncStorage.removeItem(k) : SecureStore.deleteItemAsync(k));

const hashear = (pin: string, sal: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${sal}:${pin}`);
const salAleatoria = () => Array.from(Crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');

// Después de cada fallo la espera crece: 0, 0, 0, 30 s, 1 min, 5 min, 15 min…
const ESPERAS = [0, 0, 0, 30, 60, 300, 900];

interface Bloqueo {
  cargado: boolean;
  activo: boolean; // hay un PIN configurado
  bloqueado: boolean; // la pantalla de bloqueo está puesta
  biometria: boolean; // desbloquear también con huella/rostro
  biometriaDisponible: boolean;
  esperaHasta: number; // epoch ms: hasta cuándo no se aceptan intentos
  iniciar: () => Promise<void>;
  bloquear: () => void;
  fijarPin: (pin: string) => Promise<void>;
  quitarPin: (pin: string) => Promise<boolean>;
  desbloquear: (pin: string) => Promise<boolean>;
  usarBiometria: () => Promise<boolean>;
  setBiometria: (v: boolean) => Promise<void>;
}

export const useBloqueo = create<Bloqueo>()((set, get) => ({
  cargado: false,
  activo: false,
  bloqueado: false,
  biometria: false,
  biometriaDisponible: false,
  esperaHasta: 0,

  iniciar: async () => {
    const [hash, bio, hasta] = await Promise.all([leer(K.hash), leer(K.bio), leer(K.hasta)]);
    const disponible = !web && (await LocalAuthentication.hasHardwareAsync().catch(() => false)) && (await LocalAuthentication.isEnrolledAsync().catch(() => false));
    set({ cargado: true, activo: !!hash, bloqueado: !!hash, biometria: bio === '1' && disponible, biometriaDisponible: disponible, esperaHasta: Number(hasta) || 0 });
  },

  bloquear: () => {
    if (get().activo) set({ bloqueado: true });
  },

  fijarPin: async (pin) => {
    const sal = salAleatoria();
    await guardar(K.sal, sal);
    await guardar(K.hash, await hashear(pin, sal));
    await Promise.all([borrar(K.fallos), borrar(K.hasta)]);
    set({ activo: true, bloqueado: false, esperaHasta: 0 });
  },

  // Verifica el PIN con el límite de intentos; devuelve true si es correcto
  desbloquear: async (pin) => {
    if (Date.now() < get().esperaHasta) return false;
    const [hash, sal] = await Promise.all([leer(K.hash), leer(K.sal)]);
    if (hash && sal && (await hashear(pin, sal)) === hash) {
      await Promise.all([borrar(K.fallos), borrar(K.hasta)]);
      set({ bloqueado: false, esperaHasta: 0 });
      return true;
    }
    const fallos = (Number(await leer(K.fallos)) || 0) + 1;
    const espera = ESPERAS[Math.min(fallos, ESPERAS.length - 1)] * 1000;
    await guardar(K.fallos, String(fallos));
    if (espera) {
      const hasta = Date.now() + espera;
      await guardar(K.hasta, String(hasta));
      set({ esperaHasta: hasta });
    }
    return false;
  },

  quitarPin: async (pin) => {
    const [hash, sal] = await Promise.all([leer(K.hash), leer(K.sal)]);
    if (!hash || !sal || (await hashear(pin, sal)) !== hash) return false;
    await Promise.all([borrar(K.hash), borrar(K.sal), borrar(K.bio), borrar(K.fallos), borrar(K.hasta)]);
    set({ activo: false, bloqueado: false, biometria: false, esperaHasta: 0 });
    return true;
  },

  usarBiometria: async () => {
    if (!get().biometria) return false;
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloquear Yuro', cancelLabel: 'Usar PIN', disableDeviceFallback: true });
    if (r.success) set({ bloqueado: false });
    return r.success;
  },

  setBiometria: async (v) => {
    if (v) await guardar(K.bio, '1');
    else await borrar(K.bio);
    set({ biometria: v && get().biometriaDisponible });
  },
}));
