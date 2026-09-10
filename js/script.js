const eventos = [
  { id: 1, deporte: "Pádel",    titulo: "Pista Central · Liga amistosa", fecha: "Sáb 22 ago · 10:00", lugar: "Club Norte", plazasTotal: 4, plazasOcupadas: 1 },
  { id: 2, deporte: "Fútbol 7", titulo: "Partido abierto de barrio",     fecha: "Sáb 22 ago · 18:00", lugar: "Polideportivo Sur", plazasTotal: 14, plazasOcupadas: 14 },
  { id: 3, deporte: "Baloncesto", titulo: "3x3 Torneo relámpago",        fecha: "Dom 23 ago · 11:00", lugar: "Pista Miralbueno", plazasTotal: 8, plazasOcupadas: 3 },
  { id: 4, deporte: "Tenis",    titulo: "Pista 2 · Reserva individual",  fecha: "Dom 23 ago · 09:00", lugar: "Club Norte", plazasTotal: 2, plazasOcupadas: 0 },
  { id: 5, deporte: "Pádel",    titulo: "Pista 4 · Dobles nocturno",     fecha: "Lun 24 ago · 21:00", lugar: "Club Este", plazasTotal: 4, plazasOcupadas: 2 },
  { id: 6, deporte: "Running", titulo: "Salida grupal 10K",              fecha: "Mar 25 ago · 07:30", lugar: "Parque del Río", plazasTotal: 20, plazasOcupadas: 6 },
];

let filtroActivo = "Todos";
let eventoSeleccionado = null;
let misReservas = JSON.parse(localStorage.getItem("misReservas")) || [];

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
  localStorage.setItem("misReservas", JSON.stringify(misReservas));
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
<<<<<<< HEAD:js/script.js
// Ejercicio 1: Mostrar mensaje en consola al pulsar el botón de login/acceder
const botonAcceder = document.getElementById("btnLogin");

if (botonAcceder) {
    botonAcceder.addEventListener("click", function() {
        console.log("¡Botón principal pulsado correctamente en el módulo deportivo!");
    });
}
=======
// --- BLOQUE 1 Y 2: EVENTOS Y MOSTRAR/OCULTAR ---

// Función para mostrar los eventos en el tablero
function renderizarEventos() {
    if (!board) return;
    board.innerHTML = "";

    eventos.forEach((evento) => {
        const tarjeta = document.createElement("article");
        tarjeta.className = "card";
        tarjeta.innerHTML = `
            <h3>${evento.titulo}</h3>
            <p>Deporte: ${evento.deporte}</p>
            <button class="btn-detalle" onclick="verDetalle(${evento.id})">Ver detalle</button>
            <button class="btn-reservar" onclick="abrirModal(${evento.id})">Reservar</button>
        `;
        board.appendChild(tarjeta);
    });
}// --- BLOQUE 3 Y 5: FORMULARIO, VALIDACIÓN Y LOCALSTORAGE ---

/* 
 * BLOQUE 3 Y 5: Manejo del formulario, validación y almacenamiento en localStorage.
 * ¿Qué hace?: Captura el envío de la reserva, comprueba que los datos no estén vacíos 
 *              y los guarda en el navegador.
 * ¿Cómo funciona?: Intercepta el evento "submit", evita el refresco por defecto con 
 *                  preventDefault(), lee los valores de los inputs y usa localStorage.setItem().
 * ¿Por qué?: Para garantizar la persistencia de datos del usuario sin depender de un servidor backend.
 */
if (formReserva) {
    formReserva.addEventListener("submit", (e) => {
        e.preventDefault(); // Impedir el envío por defecto

        // Obtener valores de los inputs
        const nombreInput = document.getElementById("nombre");
        const fechaInput = document.getElementById("fecha");

        const nombre = nombreInput ? nombreInput.value.trim() : "";
        const fecha = fechaInput ? fechaInput.value : "";

        // Validaciones básicas: campos vacíos
        if (!nombre || !fecha) {
            alert("Error: Por favor, completa todos los campos obligatorios.");
            return;
        }

        // Crear objeto de reserva siguiendo el modelo común
        const nuevaReserva = {
            id: Date.now(),
            eventoId: eventoSeleccionado,
            usuario: nombre,
            fecha: fecha
        };

        // Guardar en array local
        misReservas.push(nuevaReserva);

        // Guardar en localStorage con la clave del módulo
        localStorage.setItem("reservas_deportivo", JSON.stringify(misReservas));

        alert(`¡Reserva confirmada para ${nombre}!`);
        
        // Limpiar formulario y cerrar modal si existe
        if (typeof limpiarFormulario === "function") limpiarFormulario();
        if (typeof cerrarModal === "function") cerrarModal();
    });
}

// Cargar reservas guardadas al iniciar la página
function cargarReservasGuardadas() {
    const reservasGuardadas = localStorage.getItem("reservas_deportivo");
    if (reservasGuardadas) {
        const parsed = JSON.parse(reservasGuardadas);
        misReservas.push(...parsed);
        console.log("Reservas recuperadas de localStorage:", misReservas);
    }
}

// Ejecutar al cargar
cargarReservasGuardadas();
>>>>>>> 5717540 (docs: completar memoria de explicacion de david):script.js
