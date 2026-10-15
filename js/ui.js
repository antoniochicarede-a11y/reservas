// ============================================================
// ui.js
// Piezas compartidas por la web (script.js) y el panel admin (admin.js):
//   - formato de fechas y precios
//   - popup animado (confirmaciones, avisos, errores)
//   - toast (aviso rápido)
//   - paginación
// Se incluye ANTES de script.js / admin.js. Necesita en la página los
// elementos #popup, #popupBox y #toast.
// ============================================================

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']; // 1 = lunes ... 7 = domingo

// Escapa texto antes de meterlo en un innerHTML
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ------------------------------------------------------------
// Formato
// ------------------------------------------------------------

function fmtEuro(importe) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(importe) || 0);
}

// '2026-10-14' -> '14/10/2026'
function fmtFechaCorta(iso) {
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

// '2026-10-14' -> 'miércoles, 14 de octubre de 2026'
function fmtFechaLarga(iso) {
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-').map(Number);
  return new Date(anio, mes - 1, dia).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

// [1,2,3,4,5,6,7] -> 'Todos los días' · [1,2,3,4,5,6] -> 'Lun–Sáb' · [1,3,5] -> 'Lun, Mié, Vie'
function diasTexto(dias) {
  const lista = [...dias].sort((a, b) => a - b);
  if (lista.length === 7) return 'Todos los días';
  if (lista.length === 0) return '—';
  const seguidos = lista.every((d, i) => i === 0 || d === lista[i - 1] + 1);
  if (seguidos && lista.length > 2) {
    return `${DIAS_CORTOS[lista[0] - 1]}–${DIAS_CORTOS[lista[lista.length - 1] - 1]}`;
  }
  return lista.map(d => DIAS_CORTOS[d - 1]).join(', ');
}

// Si una imagen no carga (enlace roto), se pone la imagen por defecto
const IMAGEN_POR_DEFECTO = 'img/pista-defecto.svg';
function imagenSegura(url) {
  return url && String(url).trim() !== '' ? url : IMAGEN_POR_DEFECTO;
}
document.addEventListener('error', (ev) => {
  const img = ev.target;
  if (img && img.tagName === 'IMG' && img.dataset.pista !== undefined && !img.dataset.fallo) {
    img.dataset.fallo = '1';
    img.src = IMAGEN_POR_DEFECTO;
  }
}, true);

// ------------------------------------------------------------
// Popup animado
// abrirPopup() devuelve una promesa con el "id" del botón pulsado
// (o 'cerrar' si se cierra con Esc o pulsando fuera).
// ------------------------------------------------------------

const ICONOS = {
  exito: `<svg class="icono-svg" viewBox="0 0 52 52" aria-hidden="true">
    <circle class="circulo" cx="26" cy="26" r="23" pathLength="100"/>
    <path class="trazo" d="M15 27l8 8 15-17" pathLength="100"/>
  </svg>`,
  aviso: `<svg class="icono-svg" viewBox="0 0 52 52" aria-hidden="true">
    <circle class="circulo" cx="26" cy="26" r="23" pathLength="100"/>
    <path class="trazo" d="M26 14v15" pathLength="100"/>
    <path class="trazo" d="M26 37.5v.5" pathLength="100"/>
  </svg>`,
  error: `<svg class="icono-svg" viewBox="0 0 52 52" aria-hidden="true">
    <circle class="circulo" cx="26" cy="26" r="23" pathLength="100"/>
    <path class="trazo" d="M18 18l16 16M34 18L18 34" pathLength="100"/>
  </svg>`,
};

const CLASES_BOTON = {
  primario: 'btn--primary',
  secundario: 'btn--outline',
  peligro: 'btn--peligro',
};

let popupResolver = null;
let alPulsarEscape = null; // función a ejecutar con Esc si no hay popup abierto

function elPopup() { return document.getElementById('popup'); }
function popupAbierto() { const p = elPopup(); return !!p && p.classList.contains('is-open'); }

// Cuando se pulsa Esc: primero se cierra el popup; si no hay, se ejecuta la función registrada
function registrarEscape(fn) { alPulsarEscape = fn; }

function crearConfeti(cantidad = 26) {
  let piezas = '';
  for (let i = 0; i < cantidad; i++) {
    const x = Math.round((Math.random() - 0.5) * 340);
    const giro = Math.round((Math.random() - 0.5) * 900);
    const retraso = (0.35 + Math.random() * 0.5).toFixed(2);
    piezas += `<i style="--x:${x}px;--r:${giro}deg;--d:${retraso}s"></i>`;
  }
  return `<div class="confeti" aria-hidden="true">${piezas}</div>`;
}

function abrirPopup({
  tipo = 'exito',
  titulo,
  mensaje = '',
  detalles = [],
  avisoHtml = '',           // bloque extra con HTML ya escapado (p. ej. datos de pago)
  confeti = tipo === 'exito',
  acciones = [{ id: 'cerrar', texto: 'Entendido', estilo: 'primario' }],
}) {
  const popup = elPopup();
  const caja = document.getElementById('popupBox');
  if (popupResolver) cerrarPopup('cerrar');

  caja.className = `popup__box popup__box--${tipo}`;
  caja.innerHTML = `
    <div class="popup__icono">${ICONOS[tipo] ?? ICONOS.exito}</div>
    <h3 class="popup__titulo">${esc(titulo)}</h3>
    ${mensaje ? `<p class="popup__mensaje">${esc(mensaje)}</p>` : ''}
    ${detalles.length ? `
      <dl class="popup__detalles">
        ${detalles.map(([clave, valor], i) => `
          <div style="--i:${i}"><dt>${esc(clave)}</dt><dd>${esc(valor)}</dd></div>
        `).join('')}
      </dl>` : ''}
    ${avisoHtml ? `<div class="popup__aviso">${avisoHtml}</div>` : ''}
    <div class="popup__acciones">
      ${acciones.map(a => `
        <button type="button" class="btn popup__btn ${CLASES_BOTON[a.estilo] ?? CLASES_BOTON.secundario}" data-accion="${esc(a.id)}">${esc(a.texto)}</button>
      `).join('')}
    </div>
    ${confeti ? crearConfeti() : ''}
  `;
  caja.setAttribute('aria-label', titulo);

  popup.classList.add('is-open');
  popup.setAttribute('aria-hidden', 'false');

  const botonPrincipal = caja.querySelector('.btn--primary, .btn--peligro') || caja.querySelector('.popup__btn');
  if (botonPrincipal) botonPrincipal.focus();

  return new Promise(resolver => { popupResolver = resolver; });
}

function cerrarPopup(accion = 'cerrar') {
  const popup = elPopup();
  if (popup) {
    popup.classList.remove('is-open');
    popup.setAttribute('aria-hidden', 'true');
  }
  const resolver = popupResolver;
  popupResolver = null;
  if (resolver) resolver(accion);
}

(function iniciarPopup() {
  const popup = elPopup();
  if (popup) {
    popup.addEventListener('click', (ev) => {
      const boton = ev.target.closest('[data-accion]');
      if (boton) return cerrarPopup(boton.dataset.accion);
      if (ev.target === popup) cerrarPopup('cerrar');
    });
  }
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (popupAbierto()) cerrarPopup('cerrar');
    else if (alPulsarEscape) alPulsarEscape();
  });
})();

// ------------------------------------------------------------
// Toast (aviso rápido animado). tipo: 'info' | 'exito' | 'error'
// ------------------------------------------------------------

let toastTimer = null;
function mostrarToast(mensaje, tipo = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = mensaje;
  toast.className = `toast is-${tipo}`; // reinicia estado y animaciones
  void toast.offsetWidth;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3600);
}

// ------------------------------------------------------------
// Paginación
// renderPaginacion(<nav>, total de elementos, página actual, elementos por página, función(nuevaPagina))
// Si caben en una sola página, no se muestra nada.
// ------------------------------------------------------------

function paginasVisibles(actual, total) {
  const set = new Set([1, total, actual - 1, actual, actual + 1]);
  const orden = [...set].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const salida = [];
  orden.forEach((p, i) => {
    if (i > 0 && p - orden[i - 1] > 1) salida.push('…');
    salida.push(p);
  });
  return salida;
}

function renderPaginacion(nav, total, pagina, porPagina, alCambiar) {
  if (!nav) return;
  const paginas = Math.ceil(total / porPagina);
  if (paginas <= 1) {
    nav.innerHTML = '';
    nav.hidden = true;
    nav.onclick = null;
    return;
  }

  const desde = (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);

  nav.hidden = false;
  nav.innerHTML = `
    <button type="button" class="pag__btn" data-pag="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''} aria-label="Página anterior">‹</button>
    ${paginasVisibles(pagina, paginas).map(p => p === '…'
      ? '<span class="pag__puntos" aria-hidden="true">…</span>'
      : `<button type="button" class="pag__btn ${p === pagina ? 'is-activa' : ''}" data-pag="${p}" aria-label="Página ${p}" ${p === pagina ? 'aria-current="page"' : ''}>${p}</button>`
    ).join('')}
    <button type="button" class="pag__btn" data-pag="${pagina + 1}" ${pagina === paginas ? 'disabled' : ''} aria-label="Página siguiente">›</button>
    <span class="pag__info">${desde}–${hasta} de ${total}</span>
  `;
  nav.onclick = (ev) => {
    const boton = ev.target.closest('[data-pag]');
    if (!boton || boton.disabled) return;
    alCambiar(Number(boton.dataset.pag));
  };
}