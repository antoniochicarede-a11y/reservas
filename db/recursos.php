<?php
/**
 * GET /api/recursos.php
 * GET /api/recursos.php?fecha=2026-06-15&hora=18:00:00
 *
 * Devuelve la lista de recursos (pistas). Si se pasan fecha y hora,
 * calcula cuántas plazas quedan libres restando las reservas
 * "Confirmada" que ya existan para ese recurso en ese momento.
 *
 * Respuesta:
 * { "ok": true, "recursos": [
 *     { "id_recurso":1, "nombre":"...", "descripcion":"...",
 *       "tipo":"Pádel", "capacidad":4, "plazas_libres":3 }
 * ]}
 */

require_once __DIR__ . '/conexion.php';
header('Content-Type: application/json; charset=utf-8');

$fecha = $_GET['fecha'] ?? null;
$hora  = $_GET['hora'] ?? null;

// Validamos el formato antes de usarlos en la consulta.
if ($fecha !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Formato de fecha inválido. Usa AAAA-MM-DD.']);
    exit;
}
if ($hora !== null && !preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $hora)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Formato de hora inválido. Usa HH:MM o HH:MM:SS.']);
    exit;
}

try {
    if ($fecha && $hora) {
        // Resta las reservas confirmadas de esa fecha/hora a la capacidad total
        $sql = "
            SELECT
                r.id_recurso,
                r.nombre,
                r.descripcion,
                r.tipo,
                r.capacidad,
                GREATEST(0, r.capacidad - COALESCE(res.ocupadas, 0)) AS plazas_libres
            FROM recursos r
            LEFT JOIN (
                SELECT id_recurso, COUNT(*) AS ocupadas
                FROM reservas
                WHERE fecha = :fecha AND hora = :hora AND estado = 'Confirmada'
                GROUP BY id_recurso
            ) res ON res.id_recurso = r.id_recurso
            ORDER BY r.nombre
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['fecha' => $fecha, 'hora' => $hora]);
    } else {
        // Sin fecha/hora: se devuelve la capacidad total como plazas_libres
        $sql = "
            SELECT id_recurso, nombre, descripcion, tipo,
                   capacidad, capacidad AS plazas_libres
            FROM recursos
            ORDER BY nombre
        ";
        $stmt = $pdo->query($sql);
    }

    $recursos = $stmt->fetchAll();

    echo json_encode(['ok' => true, 'recursos' => $recursos]);
} catch (PDOException $e) {
    error_log('[recursos.php] Error al obtener recursos: ' . $e->getMessage());

    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error al obtener los recursos.']);
}