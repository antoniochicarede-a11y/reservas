<?php
/**
 * GET /api/estadisticas.php
 *
 * Devuelve los tres contadores que se muestran en el hero:
 * - eventos_activos: número de recursos/pistas dados de alta
 * - plazas_libres: suma, por cada recurso, de (capacidad - reservas
 *   confirmadas de HOY para ese recurso), sin bajar de 0 por recurso.
 * - reservas_hoy: número de reservas confirmadas con fecha = hoy
 *
 * NOTA: "plazas_libres" sigue asumiendo que cada reserva ocupa 1 plaza
 * y que todas las reservas de hoy compiten por la misma capacidad del
 * recurso (no distingue por hora). Si necesitas plazas libres para un
 * horario concreto, usa recursos.php?fecha=...&hora=...
 *
 * Respuesta:
 * { "ok": true, "eventos_activos": 4, "plazas_libres": 18, "reservas_hoy": 2 }
 */

require_once __DIR__ . '/conexion.php';
header('Content-Type: application/json; charset=utf-8');

try {
    $eventosActivos = (int)$pdo->query('SELECT COUNT(*) FROM recursos')->fetchColumn();

    // Plazas libres por recurso: capacidad menos reservas confirmadas de
    // hoy para ESE recurso, sin bajar de 0 (un recurso lleno no debe
    // "prestar" plazas negativas a la suma total).
    $sql = "
        SELECT
            COALESCE(SUM(GREATEST(0, r.capacidad - COALESCE(res.ocupadas, 0))), 0) AS plazas_libres
        FROM recursos r
        LEFT JOIN (
            SELECT id_recurso, COUNT(*) AS ocupadas
            FROM reservas
            WHERE fecha = CURDATE() AND estado = 'Confirmada'
            GROUP BY id_recurso
        ) res ON res.id_recurso = r.id_recurso
    ";
    $plazasLibres = (int)$pdo->query($sql)->fetchColumn();

    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM reservas WHERE fecha = CURDATE() AND estado = 'Confirmada'"
    );
    $stmt->execute();
    $reservasHoy = (int)$stmt->fetchColumn();

    echo json_encode([
        'ok' => true,
        'eventos_activos' => $eventosActivos,
        'plazas_libres'   => $plazasLibres,
        'reservas_hoy'    => $reservasHoy,
    ]);
} catch (PDOException $e) {
    error_log('[estadisticas.php] Error al calcular estadísticas: ' . $e->getMessage());

    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error al calcular las estadísticas.']);
}
