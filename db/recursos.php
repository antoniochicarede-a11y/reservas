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

require_once __DIR__ . '/../conexion.php';
header('Content-Type: application/json; charset=utf-8');

$fecha = $_GET['fecha'] ?? null;
$hora  = $_GET['hora'] ?? null;

try {
    if ($fecha && $hora) {
        // Resta las reservas confirmadas de esa fecha/hora a la capacidad total
        $sql = "
            SELECT
                r.id_recurso,
                r.nombre,
                r.descripción AS descripcion,
                r.tipo,
                r.capacidad,
                (r.capacidad - COALESCE(res.ocupadas, 0)) AS plazas_libres
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
            SELECT id_recurso, nombre, descripción AS descripcion, tipo,
                   capacidad, capacidad AS plazas_libres
            FROM recursos
            ORDER BY nombre
        ";
        $stmt = $pdo->query($sql);
    }

    $recursos = $stmt->fetchAll();

    echo json_encode(['ok' => true, 'recursos' => $recursos]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error al obtener los recursos.']);
}