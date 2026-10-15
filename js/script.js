// ============================================================
// script.js
// Web del cliente: pistas, calendario con horarios, reservas y "Mis reservas".
// Datos desde db/recursos.php, db/disponibilidad.php, db/reservas.php,
// db/estadisticas.php y db/pago.php.
// Necesita js/ui.js (popups, toast, paginación, formatos) cargado antes.
// ============================================================

const API = {
  recursos: 'db/recursos.php',
  disponibilidad: 'db/disponibilidad.php',
  reservas: 'db/reservas.php',
  estadisticas: 'db/estadisticas.php',
  sesion: 'db/sesion.php',
  pago: 'db/pago.php',
};

const RESERVAS_POR_PAGINA = 6;

let recursos = [];
let filtroActivo = 'Todos';
let misReservas = [];
let paginaReservas = 1;
let pagoInfo = { telefono: '', metodo: 'Bizum o transferencia' };
let botonQueAbrio = null;

const board = document.getElementById('board');
const filtrosEl = document.getElementById('filtros');
const reservasList = document.getElementById('reservasList');
const reservasPaginacion = document.getElementById('reservasPaginacion');

const modal = document.getElementById('modal');
const modalDeporte = document.getElementById('modalDeporte');
const modalTitulo = document.getElementById('modalTitulo');
const modalMeta = document.getElementById('modalMeta');
const calMes = document.getElementById('calMes');
const calAnio = document.getElementById('calAnio');
const calPrev = document.getElementById('calPrev');
const calNext = document.getElementById('calNext');
const calGrid = document.getElementById('calGrid');
const slotsTitulo = document.getElementById('slotsTitulo');
const slotsGrid = document.getElementById('slotsGrid');
const slotsMensaje = document.getElementById('slotsMensaje');
const reservaComo = document.getElementById('reservaComo');
const resumen = document.getElementById('resumen');
const pagoNota = document.getElementById('pagoNota');
const formReserva = document.getElementById('formReserva');
const formError = document.getElementById('formError');
const btnReservar = document.getElementById('btnReservar');

const pagoBanner = document.getElementById('pagoBanner');

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
    if (filtroActivo !== 'Todos' && !recursos.some(r => r.tipo === filtroActivo)) {
      filtroActivo = 'Todos';
    }
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

    statEventos.textContent = data.pistas_totales;
    statPlazas.textContent = data.horarios_libres_hoy;
    statReservas.textContent = data.reservas_hoy;
  } catch (err) {
    statEventos.textContent = '–';
    statPlazas.textContent = '–';
    statReservas.textContent = '–';
  }
}

// Forma de pago siempre visible en la página
function pintarPagoBanner() {
  if (!pagoInfo.telefono) {
    pagoBanner.hidden = true;
    return;
  }
  pagoBanner.hidden = false;
  pagoBanner.innerHTML = `<strong>Forma de pago:</strong> ${esc(pagoInfo.metodo)} al móvil `
    + `<strong class="pago-tel">${esc(pagoInfo.telefono)}</strong>. Indica el número de tu reserva en el concepto.`;
}

async function cargarPago() {
  try {
    const resp = await fetch(API.pago);
    const data = await resp.json();
    if (data.ok) pagoInfo = data.pago;
  } catch (err) { /* se mantiene el valor por defecto */ }
  pintarPagoBanner();
}

// Texto con las instrucciones de pago (HTML ya escapado)
function pagoHtml(importe, idReserva) {
  const tel = pagoInfo.telefono
    ? ` al móvil <strong class="pago-tel">${esc(pagoInfo.telefono)}</strong>`
    : '';
  const concepto = idReserva ? ` indicando «Reserva #${esc(idReserva)}»` : '';
  return `Haz el pago de <strong>${esc(fmtEuro(importe))}</strong> por ${esc(pagoInfo.metodo)}${tel}${concepto}.`;
}

// ------------------------------------------------------------
// Pistas: filtros y tarjetas
// ------------------------------------------------------------

function renderFiltros() {
  const deportes = ['Todos', ...new Set(recursos.map(r => r.tipo))];
  filtrosEl.innerHTML = deportes.map(d => `
    <button type="button" class="filter ${d === filtroActivo ? 'is-active' : ''}" data-deporte="${esc(d)}" aria-pressed="${d === filtroActivo}">${esc(d)}</button>
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

  if (lista.length === 0) {
    board.innerHTML = `<p class="empty">Todavía no hay pistas disponibles. Vuelve a mirar más tarde.</p>`;
    return;
  }

  board.innerHTML = lista.map(r => `
    <article class="card card--pista">
      <img class="card__img" src="${esc(imagenSegura(r.imagen_url))}" alt="Foto de ${esc(r.nombre)}" data-pista loading="lazy">
      <div class="card__band">
        <span class="card__sport">${esc(r.tipo)}</span>
        <span class="card__slots">${r.num_pistas} ${r.num_pistas === 1 ? 'pista' : 'pistas'}</span>
      </div>
      <div class="card__body">
        <h3 class="card__title">${esc(r.nombre)}</h3>
        ${r.descripcion ? `<p class="card__meta">${esc(r.descripcion)}</p>` : ''}
        ${r.lugar ? `<p class="card__meta">Lugar: ${esc(r.lugar)}</p>` : ''}
        <p class="card__meta">Abierto ${esc(r.hora_apertura)}–${esc(r.hora_cierre)} · ${esc(diasTexto(r.dias))}</p>
        <p class="card__precio"><strong>${esc(fmtEuro(r.precio))}</strong> <span>por reserva de ${r.duracion_min} min</span></p>
      </div>
      <div class="card__footer">
        <button type="button" class="btn btn--primary btn--block" data-id="${r.id_recurso}">Ver horarios y reservar</button>
      </div>
    </article>
  `).join('');

  board.querySelectorAll('button[data-id]').forEach(btn => {
    btn.addEventListener('click', () => abrirModal(Number(btn.dataset.id), btn));
  });
}

// ------------------------------------------------------------
// Calendario de reserva
// ------------------------------------------------------------

const cal = {
  recurso: null,
  anio: 0,
  mes: 0,            // 0-11
  hoy: null,         // 'AAAA-MM-DD' según el servidor
  cache: new Map(),  // 'idPista|AAAA-MM' -> respuesta de disponibilidad.php
  cargando: false,
  error: '',
  diaSel: null,
  horaSel: null,
};

const dosCifras = (n) => String(n).padStart(2, '0');
const mesClave = () => `${cal.anio}-${dosCifras(cal.mes + 1)}`;
const diaISO = (anio, mes, dia) => `${anio}-${dosCifras(mes + 1)}-${dosCifras(dia)}`;
const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function datosMesActual() {
  return cal.recurso ? cal.cache.get(`${cal.recurso.id_recurso}|${mesClave()}`) : null;
}

// Primer y último mes que se pueden mirar: el actual y diciembre del año siguiente
function limitesMes() {
  const hoy = cal.hoy ?? diaISO(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const anioHoy = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7)) - 1;
  return { anioHoy, minimo: anioHoy * 12 + mesHoy, maximo: (anioHoy + 1) * 12 + 11 };
}

function ajustarMes() {
  const { minimo, maximo } = limitesMes();
  const actual = cal.anio * 12 + cal.mes;
  const ajustado = Math.min(maximo, Math.max(minimo, actual));
  cal.anio = Math.floor(ajustado / 12);
  cal.mes = ajustado % 12;
}

async function cargarMes(forzar = false) {
  if (!cal.recurso) return;
  const idPista = cal.recurso.id_recurso;
  const clave = `${idPista}|${mesClave()}`;

  if (!forzar && cal.cache.has(clave)) {
    cal.error = '';
    renderModal();
    return;
  }

  cal.cargando = true;
  cal.error = '';
  renderModal();

  let datos = null;
  let error = '';
  try {
    const resp = await fetch(`${API.disponibilidad}?id_recurso=${idPista}&mes=${mesClave()}`);
    const data = await resp.json();
    if (data.ok) datos = data;
    else error = data.error || 'No se pudo cargar la disponibilidad.';
  } catch (err) {
    error = 'Error de conexión con el servidor.';
  }

  // Si mientras tanto se cerró el modal o se cambió de mes/pista, se descarta
  if (!cal.recurso || cal.recurso.id_recurso !== idPista || clave !== `${idPista}|${mesClave()}`) return;

  cal.cargando = false;
  if (datos) {
    cal.hoy = datos.hoy;
    cal.cache.set(clave, datos);
  } else {
    cal.error = error;
  }
  renderModal();
}

function renderModal() {
  renderCabeceraCalendario();
  renderDias();
  renderSlots();
  renderResumen();
}

function renderCabeceraCalendario() {
  const { anioHoy, minimo, maximo } = limitesMes();
  calMes.innerHTML = MESES.map((m, i) => `<option value="${i}" ${i === cal.mes ? 'selected' : ''}>${m}</option>`).join('');
  calAnio.innerHTML = [anioHoy, anioHoy + 1].map(a => `<option value="${a}" ${a === cal.anio ? 'selected' : ''}>${a}</option>`).join('');
  const actual = cal.anio * 12 + cal.mes;
  calPrev.disabled = actual <= minimo;
  calNext.disabled = actual >= maximo;
}

function renderDias() {
  const datos = datosMesActual();
  const offset = (new Date(cal.anio, cal.mes, 1).getDay() + 6) % 7; // semana que empieza en lunes
  const diasMes = new Date(cal.anio, cal.mes + 1, 0).getDate();
  const diasMesAnterior = new Date(cal.anio, cal.mes, 0).getDate();
  const celdas = Math.ceil((offset + diasMes) / 7) * 7;

  let html = '';
  for (let i = 0; i < celdas; i++) {
    if (i < offset) {
      html += `<span class="cal__dia is-otro" aria-hidden="true">${diasMesAnterior - offset + i + 1}</span>`;
      continue;
    }
    if (i >= offset + diasMes) {
      html += `<span class="cal__dia is-otro" aria-hidden="true">${i - offset - diasMes + 1}</span>`;
      continue;
    }

    const dia = i - offset + 1;
    const iso = diaISO(cal.anio, cal.mes, dia);
    const info = datos?.dias?.[iso];
    const estado = info?.estado ?? 'cargando';
    const esHoy = iso === cal.hoy ? ' is-hoy' : '';
    const nombre = fmtFechaLarga(iso);

    if (estado === 'disponible') {
      const libres = info.slots.filter(s => s.estado === 'libre').length;
      const sel = iso === cal.diaSel ? ' is-seleccionado' : '';
      html += `<button type="button" class="cal__dia is-disponible${sel}${esHoy}" data-fecha="${iso}" aria-pressed="${iso === cal.diaSel}" aria-label="${esc(nombre)}: ${libres} ${libres === 1 ? 'horario libre' : 'horarios libres'}">${dia}</button>`;
    } else if (estado === 'completo') {
      html += `<button type="button" class="cal__dia is-completo${esHoy}" disabled aria-label="${esc(nombre)}: completo">${dia}</button>`;
    } else {
      html += `<button type="button" class="cal__dia is-cerrado${esHoy}" disabled aria-label="${esc(nombre)}: no disponible">${dia}</button>`;
    }
  }
  calGrid.innerHTML = html;
  calGrid.setAttribute('aria-busy', cal.cargando ? 'true' : 'false');
  calGrid.classList.toggle('is-cargando', cal.cargando);
}

function renderSlots() {
  const datos = datosMesActual();
  slotsGrid.innerHTML = '';
  slotsMensaje.className = 'slots__mensaje';

  if (cal.error) {
    slotsTitulo.textContent = 'Horarios disponibles';
    slotsMensaje.textContent = cal.error;
    slotsMensaje.classList.add('is-error');
    return;
  }
  if (cal.cargando || !datos) {
    slotsTitulo.textContent = 'Horarios disponibles';
    slotsMensaje.textContent = 'Cargando disponibilidad…';
    return;
  }

  const info = cal.diaSel ? datos.dias[cal.diaSel] : null;

  // Aún no se ha elegido día
  if (!info) {
    slotsTitulo.textContent = 'Horarios disponibles';
    const hayDias = Object.values(datos.dias).some(d => d.estado === 'disponible');
    if (hayDias) {
      slotsMensaje.textContent = 'Elige un día del calendario para ver las horas libres.';
    } else {
      slotsMensaje.textContent = 'No quedan horarios disponibles este mes. Prueba con el mes siguiente.';
      slotsMensaje.classList.add('is-aviso');
    }
    return;
  }

  slotsTitulo.textContent = mayus(fmtFechaLarga(cal.diaSel));

  if (info.estado !== 'disponible') {
    slotsMensaje.textContent = 'No quedan pistas libres este día. Prueba con otro día.';
    slotsMensaje.classList.add('is-aviso');
  }

  slotsGrid.innerHTML = info.slots.map(s => {
    const texto = s.estado === 'libre' ? `${s.libres} ${s.libres === 1 ? 'libre' : 'libres'}`
      : s.estado === 'completo' ? 'Completo' : 'Pasada';
    const aria = s.estado === 'libre'
      ? `${s.hora} a ${s.fin}, ${s.libres} ${s.libres === 1 ? 'pista libre' : 'pistas libres'}`
      : `${s.hora} a ${s.fin}, ${s.estado === 'completo' ? 'completo, no disponible' : 'ya ha pasado'}`;
    const sel = s.estado === 'libre' && s.hora === cal.horaSel ? ' is-seleccionado' : '';
    return `<button type="button" class="slot is-${s.estado}${sel}" data-hora="${s.hora}" ${s.estado !== 'libre' ? 'disabled' : ''} aria-pressed="${s.estado === 'libre' && s.hora === cal.horaSel}" aria-label="${esc(aria)}">
      <span class="slot__hora">${s.hora}</span>
      <span class="slot__info">${texto}</span>
    </button>`;
  }).join('');
}

function franjaElegida() {
  const datos = datosMesActual();
  const info = cal.diaSel && datos ? datos.dias[cal.diaSel] : null;
  return info ? info.slots.find(s => s.hora === cal.horaSel && s.estado === 'libre') : null;
}

function renderResumen() {
  const franja = franjaElegida();
  if (!franja) {
    resumen.hidden = true;
    resumen.innerHTML = '';
    btnReservar.disabled = true;
    return;
  }
  resumen.hidden = false;
  resumen.innerHTML = `
    <div><span>Día</span><strong>${esc(mayus(fmtFechaLarga(cal.diaSel)))}</strong></div>
    <div><span>Hora</span><strong>${esc(franja.hora)} – ${esc(franja.fin)}</strong></div>
    <div><span>Reserva</span><strong>1 pista</strong></div>
    <div><span>Importe</span><strong>${esc(fmtEuro(cal.recurso.precio))}</strong></div>
  `;
  btnReservar.disabled = false;
}

// Clics en el calendario y en las horas
calGrid.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-fecha]');
  if (!boton || boton.disabled) return;
  if (cal.diaSel !== boton.dataset.fecha) cal.horaSel = null;
  cal.diaSel = boton.dataset.fecha;
  formError.textContent = '';
  renderModal();
  const panel = slotsGrid.closest('.slots');
  if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

slotsGrid.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-hora]');
  if (!boton || boton.disabled) return;
  cal.horaSel = boton.dataset.hora;
  formError.textContent = '';
  renderModal();
});

// Cambio de mes / año
function cambiarMes() {
  ajustarMes();
  cal.diaSel = null;
  cal.horaSel = null;
  formError.textContent = '';
  cargarMes();
}
calMes.addEventListener('change', () => { cal.mes = Number(calMes.value); cambiarMes(); });
calAnio.addEventListener('change', () => { cal.anio = Number(calAnio.value); cambiarMes(); });
calPrev.addEventListener('click', () => { cal.mes -= 1; if (cal.mes < 0) { cal.mes = 11; cal.anio -= 1; } cambiarMes(); });
calNext.addEventListener('click', () => { cal.mes += 1; if (cal.mes > 11) { cal.mes = 0; cal.anio += 1; } cambiarMes(); });

// ------------------------------------------------------------
// Modal de reserva
// ------------------------------------------------------------

async function abrirModal(id, boton) {
  const recurso = recursos.find(r => r.id_recurso === id);
  if (!recurso) return;

  // Comprobamos la sesión en el momento de reservar (puede haber caducado)
  const usuario = await obtenerSesion();
  if (!usuario) {
    mostrarToast('Inicia sesión para reservar tu pista.', 'info');
    setTimeout(() => { window.location.href = 'login.html'; }, 900);
    return;
  }
  if (usuario.rol === 'admin') {
    mostrarToast('Con la cuenta de administrador no se pueden hacer reservas. Entra con una cuenta de cliente.', 'error');
    return;
  }

  botonQueAbrio = boton || null;
  cal.recurso = recurso;
  const ahora = new Date();
  cal.anio = ahora.getFullYear();
  cal.mes = ahora.getMonth();
  cal.hoy = null;
  cal.cache.clear();
  cal.diaSel = null;
  cal.horaSel = null;
  cal.error = '';

  modalDeporte.textContent = recurso.tipo;
  modalTitulo.textContent = recurso.nombre;
  modalMeta.textContent = [
    recurso.lugar,
    `${fmtEuro(recurso.precio)} por reserva de ${recurso.duracion_min} min`,
    `${recurso.num_pistas} ${recurso.num_pistas === 1 ? 'pista' : 'pistas'}`,
  ].filter(Boolean).join(' · ');
  reservaComo.textContent = `Reservando como: ${usuario.nombre} (${usuario.email})`;
  pagoNota.innerHTML = `Pago por ${esc(pagoInfo.metodo)}${pagoInfo.telefono ? ` al <strong>${esc(pagoInfo.telefono)}</strong>` : ''}. `
    + `Tu reserva queda <strong>pendiente</strong> hasta que el administrador confirme el pago.`;
  formError.textContent = '';

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  modal.querySelector('.modal__box').focus();

  await cargarMes(true);
}

function cerrarModal() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  cal.recurso = null;
  if (botonQueAbrio) {
    botonQueAbrio.focus();
    botonQueAbrio = null;
  }
}

document.getElementById('modalClose').addEventListener('click', cerrarModal);
modal.addEventListener('click', (ev) => { if (ev.target === modal) cerrarModal(); });
registrarEscape(cerrarModal);

function sacudirModal() {
  const caja = modal.querySelector('.modal__box');
  caja.classList.remove('is-shake');
  void caja.offsetWidth;
  caja.classList.add('is-shake');
  caja.addEventListener('animationend', () => caja.classList.remove('is-shake'), { once: true });
}

// ------------------------------------------------------------
// Envío del formulario -> POST a reservas.php
// ------------------------------------------------------------

formReserva.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!cal.recurso) return;

  const franja = franjaElegida();
  if (!franja) {
    formError.textContent = 'Elige un día y una hora libres para tu reserva.';
    sacudirModal();
    return;
  }

  formError.textContent = '';
  btnReservar.disabled = true;
  btnReservar.textContent = 'Reservando…';

  let data = null;
  let estado = 0;
  try {
    const resp = await fetch(API.reservas, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        id_recurso: cal.recurso.id_recurso,
        fecha: cal.diaSel,
        hora: franja.hora,
      }),
    });
    estado = resp.status;
    data = await resp.json();
  } catch (err) {
    data = { ok: false, error: 'Error de conexión con el servidor.' };
  }

  btnReservar.textContent = 'Reservar pista';

  if (!data.ok) {
    formError.textContent = estado === 401
      ? 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
      : (data.error || 'No se pudo completar la reserva.');
    sacudirModal();
    if (estado === 409) {
      // Alguien ha reservado antes: se vuelve a pedir la disponibilidad para que se vea completo
      cal.horaSel = null;
      cal.cache.clear();
      await cargarMes(true);
    } else {
      renderResumen();
    }
    return;
  }

  cerrarModal();
  await mostrarReservaRecibida(data);
});

// Reserva guardada (pendiente de pago): la lista se actualiza al instante,
// sin recargar la página, y se muestra el popup con las instrucciones de pago.
async function mostrarReservaRecibida(data) {
  const r = data.reserva;
  if (data.pago) pagoInfo = data.pago;

  paginaReservas = 1;
  const actualizado = Promise.all([cargarMisReservas(), cargarEstadisticas()]);

  const accion = await abrirPopup({
    tipo: 'aviso',
    titulo: '¡Reserva recibida!',
    mensaje: 'Tu reserva queda PENDIENTE hasta que el administrador confirme tu pago. '
      + (data.correo_enviado
        ? 'Te hemos enviado un correo con los detalles.'
        : 'Tu reserva está guardada, pero no hemos podido enviarte el correo.'),
    detalles: [
      ['Pista', r.recurso],
      ['Día', mayus(fmtFechaLarga(r.fecha))],
      ['Hora', `${r.hora_inicio} – ${r.hora_fin}`],
      ['Reserva', '1 pista'],
      ['Importe', fmtEuro(r.precio)],
      ['Nº de reserva', `#${r.id_reserva}`],
    ],
    avisoHtml: pagoHtml(r.precio, r.id_reserva),
    acciones: [
      { id: 'cerrar', texto: 'Cerrar', estilo: 'secundario' },
      { id: 'ver', texto: 'Ver mis reservas', estilo: 'primario' },
    ],
  });

  await actualizado;
  resaltarReserva(r.id_reserva, accion === 'ver');
}

// ------------------------------------------------------------
// Mis reservas (las más recientes primero, con paginación)
// ------------------------------------------------------------

const ETIQUETAS_ESTADO = { pendiente: 'Pendiente de pago', confirmada: 'Confirmada', cancelada: 'Cancelada' };

async function cargarMisReservas() {
  try {
    const resp = await fetch(API.reservas, { credentials: 'include' });
    const data = await resp.json();

    if (resp.status === 401) {
      misReservas = [];
      reservasList.innerHTML = `<p class="empty">Inicia sesión para ver tus reservas.</p>`;
      renderPaginacion(reservasPaginacion, 0, 1, RESERVAS_POR_PAGINA, () => {});
      return;
    }
    if (!data.ok) throw new Error();

    if (data.pago) pagoInfo = data.pago;
    misReservas = data.reservas;
    renderMisReservas();
  } catch (err) {
    reservasList.innerHTML = `<p class="empty">No se han podido cargar tus reservas ahora mismo.</p>`;
    renderPaginacion(reservasPaginacion, 0, 1, RESERVAS_POR_PAGINA, () => {});
  }
}

function renderMisReservas() {
  if (misReservas.length === 0) {
    reservasList.innerHTML = `<p class="empty">Todavía no has reservado ninguna pista. Elige una arriba para empezar.</p>`;
    renderPaginacion(reservasPaginacion, 0, 1, RESERVAS_POR_PAGINA, () => {});
    return;
  }

  const paginas = Math.ceil(misReservas.length / RESERVAS_POR_PAGINA);
  paginaReservas = Math.min(Math.max(1, paginaReservas), paginas);

  const inicio = (paginaReservas - 1) * RESERVAS_POR_PAGINA;
  reservasList.innerHTML = misReservas.slice(inicio, inicio + RESERVAS_POR_PAGINA).map(renderReserva).join('');

  renderPaginacion(reservasPaginacion, misReservas.length, paginaReservas, RESERVAS_POR_PAGINA, (pagina) => {
    paginaReservas = pagina;
    renderMisReservas();
    document.getElementById('mis-reservas').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function renderReserva(r) {
  let accion = '';
  let extra = '';

  if (r.estado !== 'cancelada' && r.ya_paso) {
    extra = `<small class="reserva-item__nota">Esta reserva ya ha pasado.</small>`;
  } else if (r.estado === 'pendiente') {
    extra = `<p class="reserva-item__pago">${pagoHtml(r.precio, r.id_reserva)} El administrador la confirmará cuando vea el pago.</p>`;
  } else if (r.estado === 'confirmada' && !r.puede_cancelar) {
    extra = `<small class="reserva-item__nota">El plazo para cancelar (hasta 24 h antes) ya ha terminado.</small>`;
  }
  if (r.puede_cancelar) {
    accion = `<button type="button" class="btn btn--cancelar" data-cancelar="${r.id_reserva}">Cancelar reserva</button>`;
  }

  return `
    <div class="reserva-item is-${esc(r.estado)}" data-id="${r.id_reserva}">
      <div class="reserva-item__info">
        <strong>${esc(r.recurso)}</strong>
        <span>${esc(fmtFechaCorta(r.fecha))} · ${esc(r.hora_inicio)} – ${esc(r.hora_fin)}${r.lugar ? ' · ' + esc(r.lugar) : ''}</span>
        <span>${esc(fmtEuro(r.precio))} · Reserva #${r.id_reserva}</span>
        <em class="estado estado--${esc(r.estado)}">${esc(ETIQUETAS_ESTADO[r.estado] ?? r.estado)}</em>
        ${extra}
      </div>
      <div class="reserva-item__acciones">
        <span class="badge">1 pista</span>
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

// Cancelar una reserva (botón en "Mis reservas")
reservasList.addEventListener('click', async (ev) => {
  const boton = ev.target.closest('[data-cancelar]');
  if (!boton) return;

  const id = Number(boton.dataset.cancelar);
  const reserva = misReservas.find(r => r.id_reserva === id);
  if (!reserva) return;

  const decision = await abrirPopup({
    tipo: 'aviso',
    titulo: '¿Cancelar esta reserva?',
    mensaje: 'La pista quedará libre para otras personas y te enviaremos un correo de confirmación.',
    detalles: [
      ['Pista', reserva.recurso],
      ['Día y hora', `${fmtFechaCorta(reserva.fecha)} · ${reserva.hora_inicio} – ${reserva.hora_fin}`],
      ['Estado', ETIQUETAS_ESTADO[reserva.estado] ?? reserva.estado],
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

  await Promise.all([cargarMisReservas(), cargarEstadisticas()]);
  mostrarToast(
    data.correo_enviado
      ? 'Reserva cancelada. Te hemos enviado un correo de confirmación.'
      : 'Reserva cancelada.',
    'exito'
  );
});

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------

cargarRecursos();
cargarEstadisticas();
cargarPago();
cargarMisReservas();