import { requireOptionalNativeModule } from 'expo';

// Módulo nativo de Android (ver android/). En web, iOS o un APK viejo no existe: todo queda inerte.
type Nativo = {
  tieneAcceso: () => boolean;
  abrirAjustes: () => void;
  setPalabras: (palabras: string[]) => void;
  leer: () => string;
  quitar: (n: number) => void;
};

const nativo = requireOptionalNativeModule<Nativo>('YuroNotificaciones');

export type NotificacionCruda = { paquete: string; app: string; titulo: string; texto: string; hora: number };

export const disponible = nativo !== null;
export const tieneAcceso = () => nativo?.tieneAcceso() ?? false;
export const abrirAjustes = () => nativo?.abrirAjustes();
export const setPalabras = (p: string[]) => nativo?.setPalabras(p);
export const quitar = (n: number) => nativo?.quitar(n);
export const leer = (): NotificacionCruda[] => {
  try {
    return nativo ? (JSON.parse(nativo.leer()) as NotificacionCruda[]) : [];
  } catch {
    return [];
  }
};
