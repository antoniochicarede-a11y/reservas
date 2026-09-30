// ============================================================
// script.js
// Datos desde db/recursos.php, db/reservas.php, db/estadisticas.php.
// Reservar, ver "Mis reservas" y cancelar requiere sesión iniciada
// (auth.js gestiona el topbar; aquí solo se usa db/sesion.php
// para saber en nombre de quién se reserva).
// ============================================================

const API = {
  recursos: 'db/recursos.php',
  reservas: 'db/reservas.php',
  estadisticas: 'db/estadisticas.php',
  sesion: 'db/sesion.php',
};

let recursos = [];
let filtroActivo = 'Todos';
let recursoSeleccionado = null;
let reservasCache = [];

const board = document.getElementById('board');
const filtrosEl = document.getElementById('filtros');
const reservasList = document.getElementById('reservasList');
const modal = document.getElementById('modal');
const modalDeporte = document.getElementById('modalDeporte');
const modalTitulo = document.getElementById('modalTitulo');
const modalMeta = document.getElementById('modalMeta');
const reservaComo = document.getElementById('reservaComo');
const formReserva = document.getElementById('formReserva');
const formError = document.getElementById('formError');
const popup = document.getElementById('popup');
const popupBox = document.getElementById('popupBox');
const toast = document.getElementById('toast');

const statEventos = document.getElementById('statEventos');
const statPlazas = document.getElementById('statPlazas');
const statReservas = document.getElementById('statReservas');

// Escapa texto antes de meterlo en un innerHTML
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ------------------------------------------------------------
// Sesión
// ------------------------------------------------------------

async function obtenerSesion() {
  try {
    const resp = await fetch(API.sesion, { credentials: 'include' });
    const data = await resp.json();
    return data.ok ? data.usuario : null;
  } catch (err) {
    return null;
  }
}

// ------------------------------------------------------------
// Carga de datos desde la BD
// ------------------------------------------------------------

async function cargarRecursos() {
  try {
    const resp = await fetch(API.recursos);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error || 'Error desconocido');

    recursos = data.recursos;
    renderFiltros();
    renderBoard();
  } catch (err) {
    board.innerHTML = `<p class="empty">No se han podido cargar las pistas. Inténtalo más tarde.</p>`;
  }
}

async function cargarEstadisticas() {
  try {
    const resp = await fetch(API.estadisticas);
    const data = await resp.json();
    if (!data.ok) throw new Error();

    statEventos.textContent = data.eventos_activos;
    statPlazas.textContent = data.plazas_libres;
    statReservas.textContent = data.reservas_hoy;
  } catch (err) {
    statEventos.textContent = '–';
    statPlazas.textContent = '–';
    statReservas.textContent = '–';
  }
}

const ESTADOS = { confirmada: 'Confirmada', cancelada: 'Cancelada' };

async function cargarMisReservas() {
  try {
    const resp = await fetch(API.reservas, { credentials: 'include' });
    const data = await resp.json();

    if (resp.status === 401) {
      reservasCache = [];
      reservasList.innerHTML = `<p class="empty">Inicia sesión para ver tus reservas.</p>`;
      return;
    }
    if (!data.ok || data.reservas.length === 0) {
      reservasCache = [];
      reservasList.innerHTML = `<p class="empty">Todavía no has reservado ninguna plaza. Elige un evento arriba para empezar.</p>`;
      return;
    }

    reservasCache = data.reservas;
    reservasList.innerHTML = data.reservas.map(renderReserva).join('');
  } catch (err) {
    reservasList.innerHTML = `<p class="empty">No se han podido cargar tus reservas ahora mismo.</p>`;
  }
}

function renderReserva(r) {
  let accion = '';
  let nota = '';

  if (r.estado === 'confirmada') {
    if (r.puede_cancelar) {
      accion = `<button type="button" class="btn btn--cancelar" data-cancelar="${r.id_reserva}">Cancelar reserva</button>`;
    } else {
      nota = `<small class="reserva-item__nota">El plazo para cancelar (hasta 24 h antes) ya ha terminado.</small>`;
    }
  }

  return `
    <div class="reserva-item ${r.estado === 'cancelada' ? 'is-cancelada' : ''}" data-id="${r.id_reserva}">
      <div class="reserva-item__info">
        <strong>${esc(r.recurso)}</strong>
        <span>${esc(r.fecha)} · ${esc(r.hora)}${r.lugar ? ' · ' + esc(r.lugar) : ''}</span>
        <em class="estado estado--${esc(r.estado)}">${esc(ESTADOS[r.estado] ?? r.estado)}</em>
        ${nota}
      </div>
      <div class="reserva-item__acciones">
        <span class="badge">${esc(r.plazas)} plaza(s)</span>
        ${accion}
      </div>
    </div>
  `;
}

// Hace "saltar" la tarjeta de la reserva recién creada
function resaltarReserva(id, desplazar) {
  const tarjeta = reservasList.querySelector(`[data-id="${id}"]`);
  if (!tarjeta) return;

  const lanzar = () => {
    tarjeta.classList.remove('is-new');
    void tarjeta.offsetWidth; // reinicia la animación
    tarjeta.classList.add('is-new');
    tarjeta.addEventListener('animationend', () => tarjeta.classList.remove('is-new'), { once: true });
  };

  if (desplazar) {
    tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(lanzar, 500);
  } else {
    lanzar();
  }
}

// ------------------------------------------------------------
// Render
// ------------------------------------------------------------

function renderFiltros() {
  const deportes = ['Todos', ...new Set(recursos.map(r => r.tipo))];
  filtrosEl.innerHTML = deportes.map(d => `
    <button class="filter ${d === filtroActivo ? 'is-active' : ''}" data-deporte="${d}">${d}</button>
  `).join('');

  filtrosEl.querySelectorAll('.filter').forEach(btn => {
    btn.addEventListener('click', () => {
      filtroActivo = btn.dataset.deporte;
      renderFiltros();
      renderBoard();
    });
  });
}

function renderBoard() {
  const lista = recursos.filter(r => filtroActivo === 'Todos' || r.tipo === filtroActivo);

  board.innerHTML = lista.map(r => {
    const sinPlazas = r.plazas_libres <= 0;
    return `
    <article class="card">
      <div class="card__band">
        <span class="card__sport">${r.tipo}</span>
        <span class="card__slots">${r.plazas_libres} / ${r.capacidad} plazas</span>
      </div>
      <div class="card__body">
        <h3 class="card__title">${r.nombre}</h3>
        <p class="card__meta">${r.descripcion ?? ''}</p>
        <p class="card__meta">${formatearFecha(r.fecha)} · ${r.hora?.slice(0, 5) ?? ''} · ${r.lugar ?? ''}</p>
      </div>
      <div class="card__footer">
        <button class="btn btn--primary btn--block" data-id="${r.id_recurso}" ${sinPlazas ? 'disabled' : ''}>
          ${sinPlazas ? 'Completo' : 'Reservar plaza'}
        </button>
      </div>
    </article>
  `;
  }).join('');

  board.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => abrirModal(Number(btn.dataset.id)));
  });
}

function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const [anio, mes, dia] = fechaISO.split('-');
  return `${dia}/${mes}/${anio}`;
}

// ------------------------------------------------------------
// Popup animado (confirmaciones, avisos y errores)
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
  acciones = [{ id: 'cerrar', texto: 'Entendido', estilo: 'primario' }],
}) {
  if (popupResolver) cerrarPopup('cerrar');

  popupBox.className = `popup__box popup__box--${tipo}`;
  popupBox.innerHTML = `
    <div class="popup__icono">${ICONOS[tipo] ?? ICONOS.exito}</div>
    <h3 class="popup__titulo">${esc(titulo)}</h3>
    ${mensaje ? `<p class="popup__mensaje">${esc(mensaje)}</p>` : ''}
    ${detalles.length ? `
      <dl class="popup__detalles">
        ${detalles.map(([clave, valor], i) => `
          <div style="--i:${i}"><dt>${esc(clave)}</dt><dd>${esc(valor)}</dd></div>
        `).join('')}
      </dl>` : ''}
    <div class="popup__acciones">
      ${acciones.map(a => `
        <button type="button" class="btn popup__btn ${CLASES_BOTON[a.estilo] ?? CLASES_BOTON.secundario}" data-accion="${esc(a.id)}">${esc(a.texto)}</button>
      `).join('')}
    </div>
    ${tipo === 'exito' ? crearConfeti() : ''}
  `;

  popup.classList.add('is-open');
  popup.setAttribute('aria-hidden', 'false');

  const botonPrincipal = popupBox.querySelector('.btn--primary, .btn--peligro') || popupBox.querySelector('.popup__btn');
  if (botonPrincipal) botonPrincipal.focus();

  return new Promise(resolver => { popupResolver = resolver; });
}

function cerrarPopup(accion = 'cerrar') {
  popup.classList.remove('is-open');
  popup.setAttribute('aria-hidden', 'true');
  const resolver = popupResolver;
  popupResolver = null;
  if (resolver) resolver(accion);
}

popup.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-accion]');
  if (boton) return cerrarPopup(boton.dataset.accion);
  if (ev.target === popup) cerrarPopup('cerrar');
});

// ------------------------------------------------------------
// Modal de reserva
// ------------------------------------------------------------

async function abrirModal(id) {
  recursoSeleccionado = recursos.find(r => r.id_recurso === id);
  if (!recursoSeleccionado) return;

  // Comprobamos la sesión en el momento de reservar (puede haber caducado)
  const usuario = await obtenerSesion();
  if (!usuario) {
    mostrarToast('Inicia sesión para reservar tu plaza.', 'info');
    setTimeout(() => { window.location.href = 'login.html'; }, 900);
    return;
  }

  modalDeporte.textContent = recursoSeleccionado.tipo;
  modalTitulo.textContent = recursoSeleccionado.nombre;
  modalMeta.textContent = `${formatearFecha(recursoSeleccionado.fecha)} · ${recursoSeleccionado.hora?.slice(0, 5) ?? ''} · ${recursoSeleccionado.lugar ?? ''}`;
  reservaComo.textContent = `Reservando como: ${usuario.nombre} (${usuario.email})`;
  formError.textContent = '';
  formReserva.reset();

  if (formReserva.plazas) {
    formReserva.plazas.max = Math.max(1, recursoSeleccionado.plazas_libres);
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
}

function cerrarModal() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  recursoSeleccionado = null;
}

function sacudirModal() {
  const caja = modal.querySelector('.modal__box');
  caja.classList.remove('is-shake');
  void caja.offsetWidth;
  caja.classList.add('is-shake');
  caja.addEventListener('animationend', () => caja.classList.remove('is-shake'), { once: true });
}

document.getElementById('modalClose').addEventListener('click', cerrarModal);
modal.addEventListener('click', (ev) => { if (ev.target === modal) cerrarModal(); });
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape') return;
  if (popup.classList.contains('is-open')) cerrarPopup('cerrar');
  else cerrarModal();
});

// ------------------------------------------------------------
// Envío del formulario -> POST a reservas.php
// ------------------------------------------------------------

formReserva.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!recursoSeleccionado) return;

  const datos = new FormData(formReserva);
  const plazas = Number(datos.get('plazas'));

  if (!plazas || plazas < 1) {
    formError.textContent = 'Indica cuántas plazas quieres reservar.';
    sacudirModal();
    return;
  }

  formError.textContent = '';
  const botonEnviar = formReserva.querySelector('button[type="submit"]');
  botonEnviar.disabled = true;
  botonEnviar.textContent = 'Reservando…';

  let data;
  try {
    const resp = await fetch(API.reservas, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        plazas,
        id_recurso: recursoSeleccionado.id_recurso,
      }),
    });
    data = await resp.json();

    if (!data.ok) {
      formError.textContent = resp.status === 401
        ? 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
        : (data.error || 'No se pudo completar la reserva.');
      sacudirModal();
      return;
    }
  } catch (err) {
    formError.textContent = 'Error de conexión con el servidor.';
    sacudirModal();
    return;
  } finally {
    botonEnviar.disabled = false;
    botonEnviar.textContent = 'Confirmar reserva';
  }

  cerrarModal();
  await mostrarReservaConfirmada(data);
});

// Reserva guardada: la lista se actualiza al instante (sin recargar la
// página) y se muestra el popup de confirmación.
async function mostrarReservaConfirmada(data) {
  const r = data.reserva;

  // Se refresca todo en paralelo mientras el usuario ve el popup
  const actualizado = Promise.all([cargarMisReservas(), cargarRecursos(), cargarEstadisticas()]);

  const accion = await abrirPopup({
    tipo: 'exito',
    titulo: '¡Reserva confirmada!',
    mensaje: data.correo_enviado
      ? 'Te hemos enviado un correo con todos los detalles.'
      : 'Tu reserva está guardada, pero no hemos podido enviarte el correo.',
    detalles: [
      ['Evento', r.evento],
      ['Fecha y hora', `${r.fecha} · ${r.hora}`],
      ['Lugar', r.lugar || '—'],
      ['Plazas', String(r.plazas)],
      ['Nº de reserva', `#${r.id_reserva}`],
    ],
    acciones: [
      { id: 'cerrar', texto: 'Cerrar', estilo: 'secundario' },
      { id: 'ver', texto: 'Ver mis reservas', estilo: 'primario' },
    ],
  });

  await actualizado;
  resaltarReserva(r.id_reserva, accion === 'ver');
}

// ------------------------------------------------------------
// Cancelar una reserva (botón en "Mis reservas")
// ------------------------------------------------------------

reservasList.addEventListener('click', async (ev) => {
  const boton = ev.target.closest('[data-cancelar]');
  if (!boton) return;

  const id = Number(boton.dataset.cancelar);
  const reserva = reservasCache.find(r => r.id_reserva === id);
  if (!reserva) return;

  const decision = await abrirPopup({
    tipo: 'aviso',
    titulo: '¿Cancelar esta reserva?',
    mensaje: 'Las plazas quedarán libres para otras personas y te enviaremos un correo de confirmación.',
    detalles: [
      ['Evento', reserva.recurso],
      ['Fecha y hora', `${reserva.fecha} · ${reserva.hora}`],
      ['Plazas', String(reserva.plazas)],
    ],
    acciones: [
      { id: 'mantener', texto: 'Mantener reserva', estilo: 'secundario' },
      { id: 'cancelar', texto: 'Sí, cancelar', estilo: 'peligro' },
    ],
  });
  if (decision !== 'cancelar') return;

  boton.disabled = true;
  boton.textContent = 'Cancelando…';

  let data;
  try {
    const resp = await fetch(`${API.reservas}?id=${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    data = await resp.json();
  } catch (err) {
    data = { ok: false, error: 'Error de conexión con el servidor.' };
  }

  if (!data.ok) {
    // Se recarga la lista por si el estado real ha cambiado (p. ej. ya pasó el plazo)
    cargarMisReservas();
    await abrirPopup({
      tipo: 'error',
      titulo: 'No se ha podido cancelar',
      mensaje: data.error || 'Inténtalo de nuevo en unos minutos.',
    });
    return;
  }

  await Promise.all([cargarMisReservas(), cargarRecursos(), cargarEstadisticas()]);
  mostrarToast(
    data.correo_enviado
      ? 'Reserva cancelada. Te hemos enviado un correo de confirmación.'
      : 'Reserva cancelada.',
    'exito'
  );
});

// ------------------------------------------------------------
// Toast (aviso rápido animado). tipo: 'info' | 'exito' | 'error'
// ------------------------------------------------------------

let toastTimer = null;
function mostrarToast(mensaje, tipo = 'info') {
  toast.textContent = mensaje;
  toast.className = `toast is-${tipo}`; // reinicia estado y animaciones
  void toast.offsetWidth;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------

cargarRecursos();
cargarEstadisticas();
cargarMisReservas();