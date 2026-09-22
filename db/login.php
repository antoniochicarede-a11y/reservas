<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/conexion.php';
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);
    exit;
}

$datos = json_decode(file_get_contents('php://input'), true);
$email = trim($datos['email'] ?? '');
$contrasena = $datos['contrasena'] ?? '';

if ($email === '' || $contrasena === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Introduce tu correo y tu contraseña.']);
    exit;
}

// Acceso fijo de administrador para el prototipo (sin pasar por la BD).
// Cambia estos dos valores por lo que quieras usar.
if ($email === 'admin@admin.com' && $contrasena === 'admin') {
    session_regenerate_id(true);
    $_SESSION['usuario'] = [
        'id'     => 0,
        'nombre' => 'Administrador',
        'email'  => 'admin@admin.com',
        'rol'    => 'admin',
    ];
    echo json_encode(['ok' => true, 'usuario' => $_SESSION['usuario']]);
    exit;
}

try {
    $stmt = $pdo->prepare(
        "SELECT id_usuario, nombre, email, contrasena_hash, rol
         FROM usuarios WHERE email = :email"
    );
    $stmt->execute(['email' => $email]);
    $usuario = $stmt->fetch();

    // Mismo mensaje tanto si el email no existe como si la contraseña falla:
    // así no revelamos si un correo está o no registrado.
    if (!$usuario || !password_verify($contrasena, $usuario['contrasena_hash'])) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Correo o contraseña incorrectos.']);
        exit;
    }

    session_regenerate_id(true); // evita fijación de sesión
    $_SESSION['usuario'] = [
        'id'     => $usuario['id_usuario'],
        'nombre' => $usuario['nombre'],
        'email'  => $usuario['email'],
        'rol'    => $usuario['rol'],
    ];

    echo json_encode(['ok' => true, 'usuario' => $_SESSION['usuario']]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo iniciar sesión.']);
}