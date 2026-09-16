<?php
/**
 * conexion.php
 * Conexión única a la base de datos usando PDO.
 * Todos los demás archivos PHP incluyen este fichero con require_once.
 *
 * En local (XAMPP/WAMP) funciona con los valores por defecto.
 * En producción, define las variables de entorno DB_HOST, DB_NAME,
 * DB_USER y DB_PASS en tu servidor en lugar de dejarlas aquí.
 */

$host        = getenv('DB_HOST') ?: 'localhost';
$nombre_bd   = getenv('DB_NAME') ?: 'db_eventos_deportivos';
$usuario     = getenv('DB_USER') ?: 'root';
$contrasena  = getenv('DB_PASS') ?: '';
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
    // Guardamos el error real en el log del servidor para poder depurarlo,
    // pero NUNCA lo mostramos al usuario final (evita filtrar datos sensibles).
    error_log('[conexion.php] Error de conexión BD: ' . $e->getMessage());

    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'ok' => false,
        'error' => 'No se pudo conectar a la base de datos.',
    ]);
    exit;
}