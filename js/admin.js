// ============================================================
// admin.js
// Panel de administración (solo rol "admin").
//   - Reservas: ver todas, confirmar el pago, cancelar.
//   - Pistas: crear (con precio, imagen, nº de pistas, horario) y eliminar.
// Necesita js/ui.js (popups, toast, paginación, formatos) cargado antes.
// ============================================================

const ADMIN_POR_PAGINA = 10;
const ESTADOS_ADMIN = { pendiente: 'Pendiente de pago', confirmada: 'Confirmada', cancelada: 'Cancelada' };

let reservasAdmin = [];
let resumenAdmin = { pendiente: 0, confirmada: 0, cancelada: 0 };
let estadoFiltro = 'pendiente';   // 'pendiente' | 'confirmada' | 'cancelada' | 'todas'
let paginaAdmin = 1;

const tabReservas = document.getElementById('tabReservas');
const tabPistas = document.getElementById('tabPistas');
const panelReservas = document.getElementById('panelReservas');
const panelPistas = document.getElementById('panelPistas');
const contPendientes = document.getElementById('contPendientes');
const adminFiltros = document.getElementById('adminFiltros');
const tablaReservas = document.getElementById('tablaReservas');
const reservasVacio = document.getElementById('reservasVacio');
const adminPaginacion = document.getElementById('adminPaginacion');
const formPista = document.getElementById('formPista');
const pistaError = document.getElementById('pistaError');
const btnCrearPista = document.getElementById('btnCrearPista');
const listaPistas = document.getElementById('listaPistas');
const listaDeportes = document.getElementById('listaDeportes');
const nombreAdmin = document.getElementById('nombreAdmin');

// ------------------------------------------------------------
// Protección de la página
// ------------------------------------------------------------

async function protegerPagina() {
  try {
    const resp = await fetch('db/sesion.php', { credentials: 'include' });
    const data = await resp.json();

    if (!data.ok || !data.usuario || data.usuario.rol !== 'admin') {
      window.location.href = 'login.html';
      return false;
    }

    nombreAdmin.textContent = data.usuario.nombre;
    document.body.classList.remove('verificando-sesion');
    return true;
  } catch (err) {
    window.location.href = 'login.html';
    return false;
  }
}

// ------------------------------------------------------------
// Pestañas
// ------------------------------------------------------------

function mostrarPanel(cual) {
  const esReservas = cual === 'reservas';
  tabReservas.classList.toggle('is-activa', esReservas);
  tabPistas.classList.toggle('is-activa', !esReservas);
  tabReservas.setAttribute('aria-selected', String(esReservas));
  tabPistas.setAttribute('aria-selected', String(!esReservas));
  tabReservas.tabIndex = esReservas ? 0 : -1;
  tabPistas.tabIndex = esReservas ? -1 : 0;
  panelReservas.hidden = !esReservas;
  panelPistas.hidden = esReservas;
}

tabReservas.addEventListener('click', () => mostrarPanel('reservas'));
tabPistas.addEventListener('click', () => mostrarPanel('pistas'));
[tabReservas, tabPistas].forEach((tab) => {
  tab.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    const destino = tab === tabReservas ? tabPistas : tabReservas;
    mostrarPanel(destino === tabReservas ? 'reservas' : 'pistas');
    destino.focus();
  });
});

// ------------------------------------------------------------
// Reservas
// ------------------------------------------------------------

async function cargarReservas() {
  try {
    const url = estadoFiltro === 'todas'
      ? 'db/admin_reservas.php'
      : `db/admin_reservas.php?estado=${encodeURIComponent(estadoFiltro)}`;
    const resp = await fetch(url, { credentials: 'include' });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.error);

    reservasAdmin = data.reservas;
    resumenAdmin = data.resumen;
    renderFiltrosAdmin();
    renderReservasAdmin();
  } catch (err) {
    tablaReservas.innerHTML = '';
    reservasVacio.hidden = false;
    reservasVacio.textContent = 'No se pudieron cargar las reservas. Inténtalo de nuevo.';
  }
}

function renderFiltrosAdmin() {
  const total = resumenAdmin.pendiente + resumenAdmin.confirmada + resumenAdmin.cancelada;
  const filtros = [
    ['pendiente', `Pendientes de pago (${resumenAdmin.pendiente})`],
    ['confirmada', `Confirmadas (${resumenAdmin.confirmada})`],
    ['cancelada', `Canceladas (${resumenAdmin.cancelada})`],
    ['todas', `Todas (${total})`],
  ];
  adminFiltros.innerHTML = filtros.map(([valor, texto]) => `
    <button type="button" class="filter ${valor === estadoFiltro ? 'is-active' : ''}" data-estado="${valor}" aria-pressed="${valor === estadoFiltro}">${esc(texto)}</button>
  `).join('');
  contPendientes.textContent = resumenAdmin.pendiente;
  contPendientes.classList.toggle('is-cero', resumenAdmin.pendiente === 0);
}

adminFiltros.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-estado]');
  if (!boton) return;
  estadoFiltro = boton.dataset.estado;
  paginaAdmin = 1;
  cargarReservas();
});

function renderReservasAdmin() {
  if (reservasAdmin.length === 0) {
    tablaReservas.innerHTML = '';
    reservasVacio.hidden = false;
    reservasVacio.textContent = estadoFiltro === 'pendiente'
      ? 'No hay reservas pendientes de pago. ¡Todo al día!'
      : 'No hay reservas en este apartado.';
    renderPaginacion(adminPaginacion, 0, 1, ADMIN_POR_PAGINA, () => {});
    return;
  }
  reservasVacio.hidden = true;

  const paginas = Math.ceil(reservasAdmin.length / ADMIN_POR_PAGINA);
  paginaAdmin = Math.min(Math.max(1, paginaAdmin), paginas);
  const inicio = (paginaAdmin - 1) * ADMIN_POR_PAGINA;

  tablaReservas.innerHTML = reservasAdmin.slice(inicio, inicio + ADMIN_POR_PAGINA).map(r => {
    let acciones = '<span class="tabla__nada">—</span>';
    if (r.estado === 'pendiente') {
      acciones = `
        <button type="button" class="btn btn--primary btn--mini" data-accion="confirmar" data-id="${r.id_reserva}">Confirmar pago</button>
        <button type="button" class="btn btn--cancelar btn--mini" data-accion="cancelar" data-id="${r.id_reserva}">Rechazar</button>`;
    } else if (r.estado === 'confirmada') {
      acciones = `<button type="button" class="btn btn--cancelar btn--mini" data-accion="cancelar" data-id="${r.id_reserva}">Cancelar</button>`;
    }
    return `
      <tr class="fila--${esc(r.estado)}">
        <td data-label="Nº">#${r.id_reserva}</td>
        <td data-label="Cliente"><strong>${esc(r.nombre)}</strong><span class="tabla__sub">${esc(r.email)}</span></td>
        <td data-label="Pista">${esc(r.recurso)}<span class="tabla__sub">${esc(r.tipo)}</span></td>
        <td data-label="Día y hora">${esc(fmtFechaCorta(r.fecha))}<span class="tabla__sub">${esc(r.hora_inicio)} – ${esc(r.hora_fin)}</span></td>
        <td data-label="Importe">${esc(fmtEuro(r.precio))}</td>
        <td data-label="Estado"><em class="estado estado--${esc(r.estado)}">${esc(ESTADOS_ADMIN[r.estado] ?? r.estado)}</em></td>
        <td data-label="Acciones"><div class="tabla__acciones">${acciones}</div></td>
      </tr>`;
  }).join('');

  renderPaginacion(adminPaginacion, reservasAdmin.length, paginaAdmin, ADMIN_POR_PAGINA, (pagina) => {
    paginaAdmin = pagina;
    renderReservasAdmin();
  });
}

async function enviarAccion(id, accion) {
  try {
    const resp = await fetch('db/admin_reservas.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id_reserva: id, accion }),
    });
    return await resp.json();
  } catch (err) {
    return { ok: false, error: 'Error de conexión con el servidor.' };
  }
}

tablaReservas.addEventListener('click', async (ev) => {
  const boton = ev.target.closest('[data-accion]');
  if (!boton) return;

  const id = Number(boton.dataset.id);
  const accion = boton.dataset.accion;
  const reserva = reservasAdmin.find(r => r.id_reserva === id);
  if (!reserva) return;

  if (accion === 'cancelar') {
    const decision = await abrirPopup({
      tipo: 'aviso',
      titulo: reserva.estado === 'pendiente' ? '¿Rechazar esta reserva?' : '¿Cancelar esta reserva?',
      mensaje: 'La pista quedará libre y se avisará al cliente por correo.',
      detalles: [
        ['Cliente', reserva.nombre],
        ['Pista', reserva.recurso],
        ['Día y hora', `${fmtFechaCorta(reserva.fecha)} · ${reserva.hora_inicio} – ${reserva.hora_fin}`],
      ],
      acciones: [
        { id: 'no', texto: 'Volver', estilo: 'secundario' },
        { id: 'si', texto: 'Sí, cancelar reserva', estilo: 'peligro' },
      ],
    });
    if (decision !== 'si') return;
  }

  boton.disabled = true;
  const data = await enviarAccion(id, accion);

  if (!data.ok) {
    await cargarReservas();
    mostrarToast(data.error || 'No se pudo actualizar la reserva.', 'error');
    return;
  }

  const correo = data.correo_enviado ? 'Se ha avisado al cliente por correo.' : 'No se pudo enviar el correo al cliente.';
  mostrarToast(
    accion === 'confirmar' ? `Reserva #${id} confirmada. ${correo}` : `Reserva #${id} cancelada. ${correo}`,
    data.correo_enviado ? 'exito' : 'info'
  );
  await cargarReservas();
});

// ------------------------------------------------------------
// Pistas: listar y eliminar
// ------------------------------------------------------------

async function cargarPistas() {
  try {
    const resp = await fetch('db/recursos.php');
    const data = await resp.json();
    if (!data.ok) throw new Error();

    // Sugerencias del campo "Deporte": las que ya existen
    const tipos = new Set(['Fútbol 7 y Fútbol 11', 'Tenis y Pádel', 'Baloncesto', ...data.recursos.map(r => r.tipo)]);
    listaDeportes.innerHTML = [...tipos].map(t => `<option value="${esc(t)}"></option>`).join('');

    if (data.recursos.length === 0) {
      listaPistas.innerHTML = '<p class="empty">Todavía no hay pistas creadas.</p>';
      return;
    }

    listaPistas.innerHTML = `<div class="admin-pistas">${data.recursos.map(r => `
      <article class="admin-pista">
        <img class="admin-pista__img" src="${esc(imagenSegura(r.imagen_url))}" alt="Foto de ${esc(r.nombre)}" data-pista loading="lazy">
        <div class="admin-pista__cuerpo">
          <div class="admin-pista__cabecera">
            <span class="admin-pista__badge">${esc(r.tipo)}</span>
            <button type="button" class="admin-pista__borrar" data-id="${r.id_recurso}" aria-label="Eliminar la pista ${esc(r.nombre)}" title="Eliminar pista">🗑</button>
          </div>
          <h3 class="admin-pista__nombre">${esc(r.nombre)}</h3>
          <p class="admin-pista__meta">${r.num_pistas} ${r.num_pistas === 1 ? 'pista' : 'pistas'} · <strong>${esc(fmtEuro(r.precio))}</strong> · ${r.duracion_min} min</p>
          <p class="admin-pista__meta">${esc(r.hora_apertura)}–${esc(r.hora_cierre)} · ${esc(diasTexto(r.dias))}</p>
          ${r.lugar ? `<p class="admin-pista__meta">${esc(r.lugar)}</p>` : ''}
        </div>
      </article>
    `).join('')}</div>`;

    listaPistas.querySelectorAll('.admin-pista__borrar').forEach(btn => {
      btn.addEventListener('click', () => eliminarPista(Number(btn.dataset.id), data.recursos));
    });
  } catch (err) {
    listaPistas.innerHTML = '<p class="empty">No se pudieron cargar las pistas.</p>';
  }
}

async function eliminarPista(id, pistas) {
  const pista = pistas.find(p => p.id_recurso === id);
  const decision = await abrirPopup({
    tipo: 'error',
    titulo: '¿Eliminar esta pista?',
    mensaje: 'Se borrará de forma definitiva, junto con TODAS sus reservas. Esta acción no se puede deshacer.',
    detalles: pista ? [['Pista', pista.nombre], ['Deporte', pista.tipo]] : [],
    acciones: [
      { id: 'no', texto: 'Volver', estilo: 'secundario' },
      { id: 'si', texto: 'Sí, eliminar', estilo: 'peligro' },
    ],
  });
  if (decision !== 'si') return;

  try {
    const resp = await fetch(`db/recursos.php?id=${id}`, { method: 'DELETE', credentials: 'include' });
    const data = await resp.json();
    if (!data.ok) {
      mostrarToast(data.error || 'No se pudo eliminar la pista.', 'error');
      return;
    }
    mostrarToast('Pista eliminada.', 'exito');
    await Promise.all([cargarPistas(), cargarReservas()]);
  } catch (err) {
    mostrarToast('Error de conexión con el servidor.', 'error');
  }
}

// ------------------------------------------------------------
// Pistas: crear
// ------------------------------------------------------------

formPista.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  pistaError.textContent = '';

  const datos = new FormData(formPista);
  const dias = datos.getAll('dias').map(Number);

  if (dias.length === 0) {
    pistaError.textContent = 'Marca al menos un día de la semana en que abre la pista.';
    return;
  }

  btnCrearPista.disabled = true;
  try {
    const resp = await fetch('db/recursos.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        nombre: datos.get('nombre').trim(),
        tipo: datos.get('tipo').trim(),
        descripcion: datos.get('descripcion').trim(),
        num_pistas: Number(datos.get('num_pistas')),
        precio: Number(datos.get('precio')),
        duracion_min: Number(datos.get('duracion_min')),
        hora_apertura: datos.get('hora_apertura'),
        hora_cierre: datos.get('hora_cierre'),
        dias,
        lugar: datos.get('lugar').trim(),
        imagen_url: datos.get('imagen_url').trim(),
      }),
    });
    const data = await resp.json();

    if (!data.ok) {
      pistaError.textContent = data.error || 'No se pudo crear la pista.';
      return;
    }

    formPista.reset();
    mostrarToast('Pista creada. Ya se puede reservar desde la web.', 'exito');
    cargarPistas();
  } catch (err) {
    pistaError.textContent = 'Error de conexión con el servidor.';
  } finally {
    btnCrearPista.disabled = false;
  }
});

document.getElementById('btnLogout').addEventListener('click', async () => {
  await fetch('db/logout.php', { credentials: 'include' });
  window.location.href = 'login.html';
});

(async () => {
  const autorizado = await protegerPagina();
  if (autorizado) {
    cargarReservas();
    cargarPistas();
  }
})();