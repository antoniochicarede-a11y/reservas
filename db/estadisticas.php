<?php
/**
 * GET /api/estadisticas.php
 *
 * Devuelve los tres contadores que se muestran en el hero:
 * - eventos_activos: número de recursos/pistas dados de alta
 * - plazas_libres: capacidad total menos reservas confirmadas de HOY
 * - reservas_hoy: número de reservas confirmadas con fecha = hoy
 *
 * NOTA: "plazas_libres" asume que cada reserva ocupa 1 plaza.
 * Si una reserva puede ocupar varias plazas (ej. reservas grupales),
 * cambia la resta para usar SUM(plazas) en vez de COUNT(*) de reservas.
 *
 * Respuesta:
 * { "ok": true, "eventos_activos": 4, "plazas_libres": 18, "reservas_hoy": 2 }
 */

require_once __DIR__ . '/conexion.php';
header('Content-Type: application/json; charset=utf-8');

try {
    $eventosActivos = (int)$pdo->query('SELECT COUNT(*) FROM recursos')->fetchColumn();

    $capacidadTotal = (int)$pdo->query('SELECT COALESCE(SUM(capacidad), 0) FROM recursos')->fetchColumn();

    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM reservas WHERE fecha = CURDATE() AND estado = 'Confirmada'"
    );
    $stmt->execute();
    $reservasHoy = (int)$stmt->fetchColumn();

    echo json_encode([
        'ok' => true,
        'eventos_activos' => $eventosActivos,
        'plazas_libres'   => max(0, $capacidadTotal - $reservasHoy),
        'reservas_hoy'    => $reservasHoy,
    ]);
} catch (PDOException $e) {
    // Guardamos el error real en el log del servidor para poder depurarlo.
    error_log('[estadisticas.php] Error al calcular estadísticas: ' . $e->getMessage());

    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Error al calcular las estadísticas.']);
}