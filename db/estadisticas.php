<?php
/**
 * estadisticas.php
 * Cifras de la portada:
 *   - pistas_totales:        pistas disponibles en total (suma de todas las pistas activas)
 *   - horarios_libres_hoy:   franjas de hoy que aún no han pasado y tienen alguna pista libre
 *   - reservas_hoy:          reservas hechas hoy (sin contar las canceladas)
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/conexion.php';
require_once __DIR__ . '/horarios.php';
header('Content-Type: application/json; charset=utf-8');

try {
    $recursos = $pdo->query("SELECT * FROM recursos WHERE activo = 1")->fetchAll();

    $pistasTotales = 0;
    $libresHoy     = 0;
    $hoy           = date('Y-m-d');
    $ahora         = minutosAhora();

    foreach ($recursos as $r) {
        $pistasTotales += (int)$r['num_pistas'];

        $ocupadas = pistasOcupadas($pdo, (int)$r['id_recurso'], $hoy, $hoy);
        $dia = estadoDia($r, $hoy, $ocupadas, $hoy, $ahora);
        foreach ($dia['slots'] as $slot) {
            if ($slot['estado'] === 'libre') {
                $libresHoy++;
            }
        }
    }

    $reservasHoy = (int)$pdo->query(
        "SELECT COUNT(*) FROM reservas WHERE DATE(fecha_creacion) = CURDATE() AND estado <> 'cancelada'"
    )->fetchColumn();

    echo json_encode([
        'ok'                  => true,
        'pistas_totales'      => $pistasTotales,
        'horarios_libres_hoy' => $libresHoy,
        'reservas_hoy'        => $reservasHoy,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'No se pudieron calcular las estadísticas.']);
}
