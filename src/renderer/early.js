// Se ejecuta antes de pintar nada: fija el tema y el skin guardados para evitar parpadeos.
(function () {
  var theme = null;
  var skin = null;
  var estetica = null;
  try {
    theme = localStorage.getItem('theme');
    skin = localStorage.getItem('skin');
    estetica = localStorage.getItem('estetica');
  } catch (e) { /* sin almacenamiento: valores por defecto */ }
  if (!theme) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  var SKINS = { windows: 'skins/windows.css', mac: 'skins/mac.css' }; // 'plumd' es el aspecto base
  if (!SKINS[skin]) skin = 'plumd';
  var ESTETICAS = { folio: 'esteticas/folio.css' }; // 'clasica' es la base, sin hoja
  if (!Object.prototype.hasOwnProperty.call(ESTETICAS, estetica)) estetica = 'clasica';
  var root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.skin = skin;
  root.dataset.estetica = estetica;
  if (SKINS[skin]) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SKINS[skin];
    link.dataset.skin = skin;
    document.head.appendChild(link);
  }
  if (ESTETICAS[estetica]) { // la base no tiene hoja
    var enlace = document.createElement('link');
    enlace.rel = 'stylesheet';
    enlace.href = ESTETICAS[estetica];
    enlace.dataset.estetica = estetica;
    document.head.appendChild(enlace);
  }
})();
