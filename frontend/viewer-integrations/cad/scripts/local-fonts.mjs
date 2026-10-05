// Pinned mtext worker starts before its asynchronous font-URL configuration.
// Keep that initial default local as well as the SDK's configured URL.
const donorDefault = '"https://cdn.jsdelivr.net/gh/mlightcad/cad-data/fonts/"';
export function localizeCadWorkerFonts(source) {
  if (source.split(donorDefault).length !== 2)
    throw new Error(
      "Pinned CAD worker font default changed; review the adaptation",
    );
  return source.replace(
    donorDefault,
    'new URL("./fonts/", self.location.href).href',
  );
}
