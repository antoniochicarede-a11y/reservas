<?php
header('Content-Type: application/json; charset=utf-8');
require_once __DIR__ . '/conexion.php';

try {
    $eventos_activos = (int)$pdo->query(
        "SELECT COUNT(*) FROM recursos WHERE activo = 1"
    )->fetchColumn();

    $plazas_libres = (int)$pdo->query(
        "SELECT COALESCE(SUM(GREATEST(r.capacidad - COALESCE(res.ocupadas, 0), 0)), 0)
         FROM recursos r
         LEFT JOIN (
             SELECT id_recurso, SUM(plazas) AS ocupadas
             FROM reservas
             WHERE estado = 'confirmada'
             GROUP BY id_recurso
         ) res ON res.id_recurso = r.id_recurso
         WHERE r.activo = 1"
    )->fetchColumn();

    $reservas_hoy = (int)$pdo->query(
        "SELECT COUNT(*) FROM reservas WHERE DATE(fecha_creacion) = CURDATE()"
    )->fetchColumn();

    echo json_encode([
        'ok' => true,
        'eventos_activos' => $eventos_activos,
        'plazas_libres'   => $plazas_libres,
        'reservas_hoy'    => $reservas_hoy,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudieron calcular las estadísticas.']);
}