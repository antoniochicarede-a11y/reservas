// ============================================================
// admin.js
// Solo accesible para usuarios con rol "admin". Comprueba la
// sesión contra db/sesion.php antes de mostrar nada.
// ============================================================

const formEvento = document.getElementById('formEvento');
const eventoError = document.getElementById('eventoError');
const listaEventos = document.getElementById('listaEventos');
const nombreAdmin = document.getElementById('nombreAdmin');

//Comentario de Ana

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

function formatearFecha(fechaISO) {
  if (!fechaISO) return '';
  const [anio, mes, dia] = fechaISO.split('-');
  return `${dia}/${mes}/${anio}`;
}

async function cargarEventos() {
  try {
    const resp = await fetch('db/recursos.php');
    const data = await resp.json();
    if (!data.ok) throw new Error();

    if (data.recursos.length === 0) {
      listaEventos.innerHTML = '<p class="empty">Todavía no hay eventos creados.</p>';
      return;
    }

    listaEventos.innerHTML = `<div class="admin-events-grid">${data.recursos.map(r => `
      <article class="admin-event">
        <div class="admin-event__head">
          <span class="admin-event__badge">${r.tipo}</span>
          <button class="admin-event__delete" data-id="${r.id_recurso}" title="Eliminar evento" aria-label="Eliminar evento">🗑</button>
        </div>
        <h3 class="admin-event__nombre">${r.nombre}</h3>
        <p class="admin-event__meta">${formatearFecha(r.fecha)} · ${r.hora?.slice(0, 5) ?? ''}</p>
        <p class="admin-event__meta">${r.lugar ?? 'Sin lugar indicado'}</p>
        <div class="admin-event__aforo">
          <div class="admin-event__aforo-barra">
            <span style="width:${r.capacidad ? (r.plazas_libres / r.capacidad) * 100 : 0}%"></span>
          </div>
          <span class="admin-event__aforo-texto">${r.plazas_libres} / ${r.capacidad} plazas libres</span>
        </div>
      </article>
    `).join('')}</div>`;

    listaEventos.querySelectorAll('.admin-event__delete').forEach(btn => {
      btn.addEventListener('click', () => eliminarEvento(Number(btn.dataset.id)));
    });
  } catch (err) {
    listaEventos.innerHTML = '<p class="empty">No se pudieron cargar los eventos.</p>';
  }
}

async function eliminarEvento(id) {
  if (!confirm('¿Seguro que quieres eliminar este evento? También se borrarán todas sus reservas.')) {
    return;
  }

  try {
    const resp = await fetch(`db/recursos.php?id=${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await resp.json();

    if (!data.ok) {
      alert(data.error || 'No se pudo eliminar el evento.');
      return;
    }

    cargarEventos();
  } catch (err) {
    alert('Error de conexión con el servidor.');
  }
}

formEvento.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  eventoError.textContent = '';

  const datos = new FormData(formEvento);
  const boton = formEvento.querySelector('button[type="submit"]');
  boton.disabled = true;

  try {
    const resp = await fetch('db/recursos.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        nombre: datos.get('nombre').trim(),
        tipo: datos.get('tipo').trim(),
        descripcion: datos.get('descripcion').trim(),
        capacidad: Number(datos.get('capacidad')),
        fecha: datos.get('fecha'),
        hora: datos.get('hora'),
        lugar: datos.get('lugar').trim(),
      }),
    });
    const data = await resp.json();

    if (!data.ok) {
      eventoError.textContent = data.error || 'No se pudo crear el evento.';
      return;
    }

    formEvento.reset();
    cargarEventos();
  } catch (err) {
    eventoError.textContent = 'Error de conexión con el servidor.';
  } finally {
    boton.disabled = false;
  }
});

document.getElementById('btnLogout').addEventListener('click', async () => {
  await fetch('db/logout.php', { credentials: 'include' });
  window.location.href = 'login.html';
});

(async () => {
  const autorizado = await protegerPagina();
  if (autorizado) cargarEventos();
})();