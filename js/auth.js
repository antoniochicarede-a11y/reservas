// ============================================================
// auth.js
// Actúa como "guardián" de index.html: comprueba la sesión antes
// de mostrar nada. Si no hay sesión, redirige a login.html sin
// llegar a pintar el contenido (el body empieza oculto por CSS
// con la clase "verificando-sesion").
// Si hay sesión, rellena el topbar con el nombre del usuario
// (y un enlace al panel admin si su rol lo permite) y muestra la página.
// ============================================================

window.sesionActual = null;

async function inicializarTopbar() {
  const acciones = document.getElementById('topbarAcciones');

  try {
    const resp = await fetch('db/sesion.php', { credentials: 'include' });
    const data = await resp.json();
    window.sesionActual = data.ok ? data.usuario : null;
  } catch (err) {
    window.sesionActual = null;
  }

  if (!window.sesionActual) {
    // Sin sesión: no se enseña nada de esta página, directo a login
    window.location.href = 'login.html';
    return;
  }

  if (acciones) {
    const nombreCorto = window.sesionActual.nombre.split(' ')[0];
    acciones.innerHTML = `
      ${window.sesionActual.rol === 'admin' ? '<a href="admin.html" class="nav__link">Panel admin</a>' : ''}
      <span class="nav__user">Hola, ${nombreCorto}</span>
      <button class="btn btn--ghost" id="btnLogout">Salir</button>
    `;
    document.getElementById('btnLogout').addEventListener('click', cerrarSesionGlobal);
  }

  // Ya hay sesión confirmada: mostramos el contenido de la página
  document.body.classList.remove('verificando-sesion');

  // Avisa a script.js de que la sesión ya se ha comprobado
  document.dispatchEvent(new CustomEvent('sesion-lista'));
}

async function cerrarSesionGlobal() {
  await fetch('db/logout.php', { credentials: 'include' });
  window.location.href = 'login.html';
}

document.addEventListener('DOMContentLoaded', inicializarTopbar);