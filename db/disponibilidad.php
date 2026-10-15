<?php
/**
 * disponibilidad.php?id_recurso=1&mes=2026-10
 * Devuelve, para cada día del mes, su estado y sus franjas con las pistas
 * libres de cada una. Con esto el navegador dibuja el calendario sin tener
 * que calcular nada (ni siquiera la hora actual: la decide el servidor).
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/conexion.php';
require_once __DIR__ . '/horarios.php';
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);
    exit;
}

$id  = (int)($_GET['id_recurso'] ?? 0);
$mes = (string)($_GET['mes'] ?? date('Y-m'));

if ($id < 1 || !preg_match('/^(\d{4})-(\d{2})$/', $mes, $m) || !checkdate((int)$m[2], 1, (int)$m[1])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Petición no válida.']);
    exit;
}
$anio = (int)$m[1];
$numMes = (int)$m[2];

try {
    $stmt = $pdo->prepare("SELECT * FROM recursos WHERE id_recurso = :id AND activo = 1");
    $stmt->execute(['id' => $id]);
    $recurso = $stmt->fetch();

    if (!$recurso) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Esta pista ya no está disponible.']);
        exit;
    }

    $diasMes = (int)date('t', mktime(12, 0, 0, $numMes, 1, $anio));
    $primero = sprintf('%04d-%02d-01', $anio, $numMes);
    $ultimo  = sprintf('%04d-%02d-%02d', $anio, $numMes, $diasMes);

    $ocupadas = pistasOcupadas($pdo, $id, $primero, $ultimo);
    $hoy      = date('Y-m-d');
    $ahora    = minutosAhora();

    $dias = [];
    for ($d = 1; $d <= $diasMes; $d++) {
        $fecha = sprintf('%04d-%02d-%02d', $anio, $numMes, $d);
        $dias[$fecha] = estadoDia($recurso, $fecha, $ocupadas, $hoy, $ahora);
    }

    echo json_encode([
        'ok'      => true,
        'hoy'     => $hoy,
        'mes'     => $mes,
        'recurso' => [
            'id_recurso'   => (int)$recurso['id_recurso'],
            'nombre'       => $recurso['nombre'],
            'num_pistas'   => (int)$recurso['num_pistas'],
            'precio'       => (float)$recurso['precio'],
            'duracion_min' => (int)$recurso['duracion_min'],
        ],
        'dias'    => $dias,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudo consultar la disponibilidad.']);
}
