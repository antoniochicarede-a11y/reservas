<?php
/**
 * conexion.php
 * Conexión única a la base de datos usando PDO.
 * Todos los demás archivos PHP incluyen este fichero con require_once.
 *
 * IMPORTANTE: ajusta $host, $usuario y $contrasena a tu entorno
 * (por defecto se asume XAMPP/WAMP en local: usuario "root" sin contraseña).
 */

$host        = 'localhost';
$nombre_bd   = 'db_eventos_deportivos';
$usuario     = 'root';
$contrasena  = '';
$charset     = 'utf8mb4';

$dsn = "mysql:host=$host;dbname=$nombre_bd;charset=$charset";

$opciones = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION, // los errores lanzan excepciones
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,        // filas como arrays asociativos
    PDO::ATTR_EMULATE_PREPARES   => false,                   // usa prepared statements reales
];

try {
    $pdo = new PDO($dsn, $usuario, $contrasena, $opciones);
} catch (PDOException $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok' => false,
        'error' => 'No se pudo conectar a la base de datos.',
    ]);
    exit;
}