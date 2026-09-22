// ============================================================
// script.js
// Datos desde db/recursos.php, db/reservas.php, db/estadisticas.php.
// Reservar y ver "Mis reservas" ahora requiere sesión iniciada
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
const toast = document.getElementById('toast');

const statEventos = document.getElementById('statEventos');
const statPlazas = document.getElementById('statPlazas');
const statReservas = document.getElementById('statReservas');

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

async function cargarMisReservas() {
  try {
    const resp = await fetch(API.reservas, { credentials: 'include' });
    const data = await resp.json();

    if (resp.status === 401) {
      reservasList.innerHTML = `<p class="empty">Inicia sesión para ver tus reservas.</p>`;
      return;
    }
    if (!data.ok || data.reservas.length === 0) {
      reservasList.innerHTML = `<p class="empty">Todavía no has reservado ninguna plaza. Elige un evento arriba para empezar.</p>`;
      return;
    }

    reservasList.innerHTML = data.reservas.map(r => `
      <div class="reserva-item">
        <div class="reserva-item__info">
          <strong>${r.recurso}</strong>
          <span>${r.fecha} · ${r.hora} · ${r.estado}</span>
        </div>
        <span class="badge">${r.plazas} plaza(s)</span>
      </div>
    `).join('');
  } catch (err) {
    reservasList.innerHTML = `<p class="empty">No se han podido cargar tus reservas ahora mismo.</p>`;
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
// Modal de reserva
// ------------------------------------------------------------

async function abrirModal(id) {
  recursoSeleccionado = recursos.find(r => r.id_recurso === id);
  if (!recursoSeleccionado) return;

  // Comprobamos la sesión en el momento de reservar (puede haber caducado)
  const usuario = await obtenerSesion();
  if (!usuario) {
    mostrarToast('Inicia sesión para reservar tu plaza.');
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

document.getElementById('modalClose').addEventListener('click', cerrarModal);
modal.addEventListener('click', (ev) => { if (ev.target === modal) cerrarModal(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarModal(); });

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
    return;
  }

  formError.textContent = '';
  const botonEnviar = formReserva.querySelector('button[type="submit"]');
  botonEnviar.disabled = true;

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
    const data = await resp.json();

    if (!data.ok) {
      if (resp.status === 401) {
        formError.textContent = 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
      } else {
        formError.textContent = data.error || 'No se pudo completar la reserva.';
      }
      return;
    }

    const nombrePista = recursoSeleccionado.nombre;
    cerrarModal();
    mostrarToast(`Reserva confirmada: ${plazas} plaza(s) en "${nombrePista}"`);

    cargarRecursos();
    cargarEstadisticas();
    cargarMisReservas();
  } catch (err) {
    formError.textContent = 'Error de conexión con el servidor.';
  } finally {
    botonEnviar.disabled = false;
  }
});

// ------------------------------------------------------------
// Toast
// ------------------------------------------------------------

let toastTimer = null;
function mostrarToast(mensaje) {
  toast.textContent = mensaje;
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