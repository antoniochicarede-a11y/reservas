<?php
/**
 * admin_reservas.php  (solo administradores)
 *
 *  GET  ?estado=pendiente|confirmada|cancelada   -> reservas de todos los usuarios
 *       (sin "estado" devuelve todas) + un resumen con cuántas hay de cada estado.
 *  POST {id_reserva, accion: "confirmar"|"cancelar"}
 *       - confirmar: pendiente -> confirmada (el admin ha visto el pago). Avisa por correo.
 *       - cancelar:  pendiente/confirmada -> cancelada, sin límite de horas. Avisa por correo.
 */
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/conexion.php';
require_once __DIR__ . '/horarios.php';
require_once __DIR__ . '/correo.php';
header('Content-Type: application/json; charset=utf-8');

requiereAdmin();

$metodo = $_SERVER['REQUEST_METHOD'];

// ------------------------------------------------------------
// GET: listado de reservas
// ------------------------------------------------------------
if ($metodo === 'GET') {
    $estado = (string)($_GET['estado'] ?? '');
    $validos = ['pendiente', 'confirmada', 'cancelada'];

    try {
        $sql = "SELECT res.id_reserva, res.nombre, res.email, res.estado, res.precio,
                       res.fecha, TIME_FORMAT(res.hora_inicio, '%H:%i') AS hora_inicio,
                       TIME_FORMAT(res.hora_fin, '%H:%i') AS hora_fin,
                       res.fecha_creacion, r.nombre AS recurso, r.tipo
                FROM reservas res
                JOIN recursos r ON r.id_recurso = res.id_recurso";
        $params = [];
        if (in_array($estado, $validos, true)) {
            $sql .= " WHERE res.estado = :estado";
            $params['estado'] = $estado;
        }
        $sql .= " ORDER BY res.id_reserva DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $reservas = $stmt->fetchAll();
        foreach ($reservas as &$r) {
            $r['id_reserva'] = (int)$r['id_reserva'];
            $r['precio']     = (float)$r['precio'];
        }
        unset($r);

        $resumen = ['pendiente' => 0, 'confirmada' => 0, 'cancelada' => 0];
        foreach ($pdo->query("SELECT estado, COUNT(*) AS n FROM reservas GROUP BY estado")->fetchAll() as $fila) {
            $resumen[$fila['estado']] = (int)$fila['n'];
        }

        echo json_encode(['ok' => true, 'reservas' => $reservas, 'resumen' => $resumen]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudieron cargar las reservas.']);
    }
    exit;
}

// ------------------------------------------------------------
// POST: confirmar el pago o cancelar una reserva
// ------------------------------------------------------------
if ($metodo === 'POST') {
    $datos  = json_decode(file_get_contents('php://input'), true) ?: [];
    $id     = (int)($datos['id_reserva'] ?? 0);
    $accion = (string)($datos['accion'] ?? '');

    if ($id < 1 || !in_array($accion, ['confirmar', 'cancelar'], true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Petición no válida.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare(
            "SELECT res.id_reserva, res.estado, res.nombre, res.email, res.precio,
                    res.fecha, res.hora_inicio, res.hora_fin,
                    r.nombre AS evento, r.tipo, r.lugar
             FROM reservas res
             JOIN recursos r ON r.id_recurso = res.id_recurso
             WHERE res.id_reserva = :id"
        );
        $stmt->execute(['id' => $id]);
        $reserva = $stmt->fetch();

        if (!$reserva) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'La reserva no existe.']);
            exit;
        }

        if ($accion === 'confirmar') {
            if ($reserva['estado'] !== 'pendiente') {
                http_response_code(409);
                echo json_encode(['ok' => false, 'error' => 'Solo se pueden confirmar reservas pendientes de pago.']);
                exit;
            }
            // El estado en el WHERE evita pisar un cambio hecho a la vez (p. ej. el cliente cancelando)
            $stmt = $pdo->prepare("UPDATE reservas SET estado = 'confirmada' WHERE id_reserva = :id AND estado = 'pendiente'");
        } else {
            if ($reserva['estado'] === 'cancelada') {
                http_response_code(409);
                echo json_encode(['ok' => false, 'error' => 'Esta reserva ya estaba cancelada.']);
                exit;
            }
            $stmt = $pdo->prepare("UPDATE reservas SET estado = 'cancelada' WHERE id_reserva = :id AND estado IN (" . ESTADOS_OCUPAN . ")");
        }
        $stmt->execute(['id' => $id]);

        if ($stmt->rowCount() === 0) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'La reserva ha cambiado mientras tanto. Recarga la lista.']);
            exit;
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudo actualizar la reserva.']);
        exit;
    }

    $correoEnviado = $accion === 'confirmar'
        ? enviarCorreoConfirmacion($reserva)
        : enviarCorreoCancelacion($reserva, true);

    echo json_encode([
        'ok'             => true,
        'estado'         => $accion === 'confirmar' ? 'confirmada' : 'cancelada',
        'correo_enviado' => $correoEnviado,
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);