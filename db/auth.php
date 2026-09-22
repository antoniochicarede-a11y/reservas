<?php
/**
 * auth.php
 * Gestión de sesión segura (cookie httpOnly, SameSite) y helpers
 * de control de acceso. Se incluye en cada endpoint que necesite
 * saber quién ha iniciado sesión o proteger una acción.
 */

if (session_status() === PHP_SESSION_NONE) {
    session_set_cookie_params([
        'lifetime' => 0,      // expira al cerrar el navegador
        'path'     => '/',
        'httponly' => true,   // JavaScript no puede leer la cookie
        'samesite' => 'Lax',
    ]);
    session_start();
}

/** Devuelve el usuario logueado (array) o null si no hay sesión. */
function usuarioActual() {
    return $_SESSION['usuario'] ?? null;
}

/** Corta la petición con 401 si no hay sesión activa. */
function requiereLogin() {
    if (!isset($_SESSION['usuario'])) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'Debes iniciar sesión para continuar.']);
        exit;
    }
}

/** Corta la petición con 403 si el usuario no es admin. */
function requiereAdmin() {
    requiereLogin();
    if ($_SESSION['usuario']['rol'] !== 'admin') {
        http_response_code(403);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => 'No tienes permisos de administrador.']);
        exit;
    }
}