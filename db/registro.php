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
$nombre     = trim($datos['nombre'] ?? '');
$email      = trim($datos['email'] ?? '');
$contrasena = $datos['contrasena'] ?? '';

if ($nombre === '' || $email === '' || $contrasena === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Rellena todos los campos.']);
    exit;
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'El correo electrónico no es válido.']);
    exit;
}
if (strlen($contrasena) < 8) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'La contraseña debe tener al menos 8 caracteres.']);
    exit;
}

try {
    $stmt = $pdo->prepare("SELECT id_usuario FROM usuarios WHERE email = :email");
    $stmt->execute(['email' => $email]);
    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'Ya existe una cuenta con ese correo.']);
        exit;
    }

    $hash = password_hash($contrasena, PASSWORD_DEFAULT); // bcrypt

    $stmt = $pdo->prepare(
        "INSERT INTO usuarios (nombre, email, contrasena_hash, rol)
         VALUES (:nombre, :email, :hash, 'cliente')"
    );
    $stmt->execute(['nombre' => $nombre, 'email' => $email, 'hash' => $hash]);

    echo json_encode(['ok' => true]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo completar el registro.']);
}