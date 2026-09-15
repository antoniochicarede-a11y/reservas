// ============================================================
// script.js
// Ahora la información viene de la base de datos a través de
// los endpoints PHP: api/recursos.php, api/reservas.php,
// api/estadisticas.php. Ajusta las rutas de API si tu carpeta
// "api" no está justo al lado de este script.
// ============================================================

const API = {
  recursos: 'api/recursos.php',
  reservas: 'api/reservas.php',
  estadisticas: 'api/estadisticas.php',
};

let recursos = [];                 // pistas traídas de la BD
let filtroActivo = 'Todos';
let recursoSeleccionado = null;
let emailActual = localStorage.getItem('emailReservas') || '';

const board = document.getElementById('board');
const filtrosEl = document.getElementById('filtros');
const reservasList = document.getElementById('reservasList');
const modal = document.getElementById('modal');
const modalDeporte = document.getElementById('modalDeporte');
const modalTitulo = document.getElementById('modalTitulo');
const modalMeta = document.getElementById('modalMeta');
const formReserva = document.getElementById('formReserva');
const formError = document.getElementById('formError');
const toast = document.getElementById('toast');

const statEventos = document.getElementById('statEventos');
const statPlazas = document.getElementById('statPlazas');
const statReservas = document.getElementById('statReservas');

// ------------------------------------------------------------
// Carga de datos desde la BD
// ------------------------------------------------------------


//funcion de cargar recursos
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
  if (!emailActual) {
    reservasList.innerHTML = `<p class="empty">Todavía no has reservado ninguna plaza. Elige una pista arriba para empezar.</p>`;
    return;
  }

  try {
    const resp = await fetch(`${API.reservas}?email=${encodeURIComponent(emailActual)}`);
    const data = await resp.json();

    if (!data.ok || data.reservas.length === 0) {
      reservasList.innerHTML = `<p class="empty">Todavía no has reservado ninguna plaza. Elige una pista arriba para empezar.</p>`;
      return;
    }

    reservasList.innerHTML = data.reservas.map(r => `
      <div class="reserva-item">
        <div class="reserva-item__info">
          <strong>${r.recurso}</strong>
          <span>${r.fecha} · ${r.hora} · ${r.estado}</span>
        </div>
        <span class="badge">${r.tipo}</span>
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

  board.innerHTML = lista.map(r => `
    <article class="card">
      <div class="card__band">
        <span class="card__sport">${r.tipo}</span>
        <span class="card__slots">${r.capacidad} plazas</span>
      </div>
      <div class="card__body">
        <h3 class="card__title">${r.nombre}</h3>
        <p class="card__meta">${r.descripcion ?? ''}</p>
      </div>
      <div class="card__footer">
        <button class="btn btn--primary btn--block" data-id="${r.id_recurso}">
          Reservar plaza
        </button>
      </div>
    </article>
  `).join('');

  board.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => abrirModal(Number(btn.dataset.id)));
  });
}

function renderReservas() {
  cargarMisReservas();
}

// ------------------------------------------------------------
// Modal de reserva
// ------------------------------------------------------------

function abrirModal(id) {
  recursoSeleccionado = recursos.find(r => r.id_recurso === id);
  if (!recursoSeleccionado) return;

  modalDeporte.textContent = recursoSeleccionado.tipo;
  modalTitulo.textContent = recursoSeleccionado.nombre;
  modalMeta.textContent = recursoSeleccionado.descripcion
    || `Capacidad: ${recursoSeleccionado.capacidad} persona(s)`;
  formError.textContent = '';
  formReserva.reset();

  // La fecha mínima seleccionable es hoy
  const hoy = new Date().toISOString().split('T')[0];
  if (formReserva.fecha) {
    formReserva.fecha.min = hoy;
    formReserva.fecha.value = hoy;
  }
  if (formReserva.plazas) {
    formReserva.plazas.max = recursoSeleccionado.capacidad;
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
  const nombre = (datos.get('nombre') || '').trim();
  const email = (datos.get('email') || '').trim();
  const fecha = datos.get('fecha');
  const hora = datos.get('hora');
  const plazas = Number(datos.get('plazas'));

  if (!nombre || !email || !fecha || !hora) {
    formError.textContent = 'Rellena todos los campos, incluida la fecha y la hora.';
    return;
  }

  formError.textContent = '';
  const botonEnviar = formReserva.querySelector('button[type="submit"]');
  botonEnviar.disabled = true;

  try {
    const resp = await fetch(API.reservas, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre,
        email,
        plazas,
        id_recurso: recursoSeleccionado.id_recurso,
        fecha,
        hora,
      }),
    });
    const data = await resp.json();

    if (!data.ok) {
      formError.textContent = data.error || 'No se pudo completar la reserva.';
      return;
    }

    emailActual = email;
    localStorage.setItem('emailReservas', email);

    const nombrePista = recursoSeleccionado.nombre;
    cerrarModal();
    mostrarToast(`Reserva confirmada: ${plazas} plaza(s) en "${nombrePista}"`);

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
// Botón "Acceder" (login llegará en otra fase)
// ------------------------------------------------------------

document.getElementById('btnLogin').addEventListener('click', () => {
  console.log('¡Botón principal pulsado correctamente en el módulo deportivo!');
  mostrarToast('El acceso de usuarios llegará en una próxima fase del proyecto.');
});

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------

cargarRecursos();
cargarEstadisticas();
cargarMisReservas();