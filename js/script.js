
const eventos = [
  { id: 1, deporte: "Pádel",    titulo: "Pista Central · Liga amistosa", fecha: "Sáb 22 ago · 10:00", lugar: "Club Norte", plazasTotal: 4, plazasOcupadas: 1 },
  { id: 2, deporte: "Fútbol 7", titulo: "Partido abierto de barrio",     fecha: "Sáb 22 ago · 18:00", lugar: "Polideportivo Sur", plazasTotal: 14, plazasOcupadas: 14 },
  { id: 3, deporte: "Baloncesto", titulo: "3x3 Torneo relámpago",        fecha: "Dom 23 ago · 11:00", lugar: "Pista Miralbueno", plazasTotal: 8, plazasOcupadas: 3 },
  { id: 4, deporte: "Tenis",    titulo: "Pista 2 · Reserva individual",  fecha: "Dom 23 ago · 09:00", lugar: "Club Norte", plazasTotal: 2, plazasOcupadas: 0 },
  { id: 5, deporte: "Pádel",    titulo: "Pista 4 · Dobles nocturno",     fecha: "Lun 24 ago · 21:00", lugar: "Club Este", plazasTotal: 4, plazasOcupadas: 2 },
  { id: 6, deporte: "Running", titulo: "Salida grupal 10K",              fecha: "Mar 25 ago · 07:30", lugar: "Parque del Río", plazasTotal: 20, plazasOcupadas: 6 },
];

const misReservas = [];
let filtroActivo = "Todos";
let eventoSeleccionado = null;


const board = document.getElementById("board");
const filtrosEl = document.getElementById("filtros");
const reservasList = document.getElementById("reservasList");
const modal = document.getElementById("modal");
const modalDeporte = document.getElementById("modalDeporte");
const modalTitulo = document.getElementById("modalTitulo");
const modalMeta = document.getElementById("modalMeta");
const formReserva = document.getElementById("formReserva");
const formError = document.getElementById("formError");
const toast = document.getElementById("toast");

const statEventos = document.getElementById("statEventos");
const statPlazas = document.getElementById("statPlazas");
const statReservas = document.getElementById("statReservas");


function renderFiltros() {
  const deportes = ["Todos", ...new Set(eventos.map(e => e.deporte))];
  filtrosEl.innerHTML = deportes.map(d => `
    <button class="filter ${d === filtroActivo ? "is-active" : ""}" data-deporte="${d}">${d}</button>
  `).join("");

  filtrosEl.querySelectorAll(".filter").forEach(btn => {
    btn.addEventListener("click", () => {
      filtroActivo = btn.dataset.deporte;
      renderFiltros();
      renderBoard();
    });
  });
}


function renderBoard() {
  const lista = eventos.filter(e => filtroActivo === "Todos" || e.deporte === filtroActivo);

  board.innerHTML = lista.map(e => {
    const libres = e.plazasTotal - e.plazasOcupadas;
    const lleno = libres <= 0;
    const porcentaje = Math.round((e.plazasOcupadas / e.plazasTotal) * 100);

    return `
      <article class="card ${lleno ? "is-full" : ""}">
        <div class="card__band">
          <span class="card__sport">${e.deporte}</span>
          <span class="card__slots">${lleno ? "COMPLETO" : `${libres} libres`}</span>
        </div>
        <div class="card__body">
          <h3 class="card__title">${e.titulo}</h3>
          <p class="card__meta">${e.fecha} · ${e.lugar}</p>
          <div class="card__bar"><div class="card__bar-fill" style="width:${porcentaje}%"></div></div>
        </div>
        <div class="card__footer">
          <button class="btn btn--primary btn--block" data-id="${e.id}" ${lleno ? "disabled" : ""}>
            ${lleno ? "Sin plazas" : "Reservar plaza"}
          </button>
        </div>
      </article>
    `;
  }).join("");

  board.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", () => abrirModal(Number(btn.dataset.id)));
  });

  actualizarStats();
}


function actualizarStats() {
  const plazasLibres = eventos.reduce((acc, e) => acc + (e.plazasTotal - e.plazasOcupadas), 0);
  statEventos.textContent = eventos.length;
  statPlazas.textContent = plazasLibres;
  statReservas.textContent = misReservas.length;
}

function abrirModal(id) {
  eventoSeleccionado = eventos.find(e => e.id === id);
  if (!eventoSeleccionado) return;

  modalDeporte.textContent = eventoSeleccionado.deporte;
  modalTitulo.textContent = eventoSeleccionado.titulo;
  modalMeta.textContent = `${eventoSeleccionado.fecha} · ${eventoSeleccionado.lugar}`;
  formError.textContent = "";
  formReserva.reset();

  const libres = eventoSeleccionado.plazasTotal - eventoSeleccionado.plazasOcupadas;
  formReserva.plazas.max = Math.min(4, libres);

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function cerrarModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  eventoSeleccionado = null;
}

document.getElementById("modalClose").addEventListener("click", cerrarModal);
modal.addEventListener("click", (ev) => { if (ev.target === modal) cerrarModal(); });
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") cerrarModal(); });


formReserva.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (!eventoSeleccionado) return;

  const datos = new FormData(formReserva);
  const nombre = datos.get("nombre").trim();
  const email = datos.get("email").trim();
  const plazas = Number(datos.get("plazas"));
  const libres = eventoSeleccionado.plazasTotal - eventoSeleccionado.plazasOcupadas;

  if (!nombre || !email) {
    formError.textContent = "Rellena todos los campos.";
    return;
  }
  if (plazas < 1 || plazas > libres) {
    formError.textContent = `Solo quedan ${libres} plaza(s) disponibles.`;
    return;
  }

  eventoSeleccionado.plazasOcupadas += plazas;
  misReservas.push({
    evento: eventoSeleccionado.titulo,
    deporte: eventoSeleccionado.deporte,
    fecha: eventoSeleccionado.fecha,
    nombre,
    plazas,
  });

  cerrarModal();
  renderBoard();
  renderReservas();
  mostrarToast(`Reserva confirmada: ${plazas} plaza(s) en "${eventoSeleccionado.titulo}"`);
});

function renderReservas() {
  if (misReservas.length === 0) {
    reservasList.innerHTML = `<p class="empty">Todavía no has reservado ninguna plaza. Elige un evento arriba para empezar.</p>`;
    return;
  }

  reservasList.innerHTML = misReservas.map(r => `
    <div class="reserva-item">
      <div class="reserva-item__info">
        <strong>${r.evento}</strong>
        <span>${r.fecha} · ${r.nombre} · ${r.plazas} plaza(s)</span>
      </div>
      <span class="badge">${r.deporte}</span>
    </div>
  `).join("");
}


let toastTimer = null;
function mostrarToast(mensaje) {
  toast.textContent = mensaje;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}


document.getElementById("btnLogin").addEventListener("click", () => {
  mostrarToast("El acceso de usuarios llegará en una próxima fase del proyecto.");
});

renderFiltros();
renderBoard();
renderReservas();