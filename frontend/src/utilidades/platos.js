// Color de fondo de la ilustración de cada plato (solo presentación).
const TINTES = {
  pechuga: '#FFF1DE',
  bistec: '#FCE6E2',
  tilapia: '#E4F0FB',
  arroz: '#EDF1F6',
  frijoles: '#F5E8E1',
  maduro: '#FFF3D6',
  ensalada: '#E5F3E2',
};

export function imagenDePlato(url) {
  return url || '/platos/generico.svg';
}

export function tinteDePlato(url) {
  const nombre = (url || '').split('/').pop()?.replace(/\.\w+$/, '');
  return TINTES[nombre] ?? '#EEF2F7';
}
