<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/conexion.php';
require_once __DIR__ . '/correo.php';
header('Content-Type: application/json; charset=utf-8');

// Las fechas/horas de los eventos se guardan sin zona horaria: las
// interpretamos siempre en hora peninsular española.
date_default_timezone_set('Europe/Madrid');

// Con menos de estas horas de margen ya no se puede cancelar.
const HORAS_LIMITE_CANCELACION = 24;

/** ¿Faltan al menos 24 h para el evento? ($fecha 'Y-m-d', $hora 'H:i:s') */
function puedeCancelar(string $fecha, string $hora): bool {
    $momentoEvento = strtotime($fecha . ' ' . $hora);
    if ($momentoEvento === false) {
        return false;
    }
    return ($momentoEvento - time()) >= HORAS_LIMITE_CANCELACION * 3600;
}

$metodo = $_SERVER['REQUEST_METHOD'];

// ------------------------------------------------------------
// GET: reservas del usuario que ha iniciado sesión
// ------------------------------------------------------------
if ($metodo === 'GET') {
    requiereLogin();
    $usuario = usuarioActual();

    try {
        $sql = "SELECT res.id_reserva, res.plazas, res.estado, res.fecha_creacion,
                       r.nombre AS recurso, r.tipo, r.lugar,
                       r.fecha AS fecha_iso, r.hora AS hora_iso,
                       DATE_FORMAT(r.fecha, '%d/%m/%Y') AS fecha,
                       TIME_FORMAT(r.hora, '%H:%i') AS hora
                FROM reservas res
                JOIN recursos r ON r.id_recurso = res.id_recurso
                WHERE res.id_usuario = :id_usuario
                ORDER BY r.fecha DESC, r.hora DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id_usuario' => $usuario['id']]);
        $reservas = $stmt->fetchAll();

        foreach ($reservas as &$r) {
            // El navegador solo muestra el botón "Cancelar" si esto es true,
            // pero la regla de verdad se vuelve a comprobar en el DELETE.
            $r['puede_cancelar'] = $r['estado'] === 'confirmada'
                && puedeCancelar($r['fecha_iso'], $r['hora_iso']);
            unset($r['fecha_iso'], $r['hora_iso']);
        }
        unset($r);

        echo json_encode(['ok' => true, 'reservas' => $reservas]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudieron cargar tus reservas.']);
    }
    exit;
}

// ------------------------------------------------------------
// POST: crear una nueva reserva (usuario logueado)
// ------------------------------------------------------------
if ($metodo === 'POST') {
    requiereLogin();
    $usuario = usuarioActual();

    $datos      = json_decode(file_get_contents('php://input'), true);
    $plazas     = (int)($datos['plazas'] ?? 0);
    $id_recurso = (int)($datos['id_recurso'] ?? 0);

    if ($plazas < 1 || $id_recurso < 1) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Indica cuántas plazas quieres reservar.']);
        exit;
    }

    try {
        $pdo->beginTransaction();

        // Bloquea la fila del recurso mientras comprobamos el aforo
        $stmt = $pdo->prepare(
            "SELECT capacidad, nombre, tipo, fecha, hora, lugar
             FROM recursos WHERE id_recurso = :id AND activo = 1 FOR UPDATE"
        );
        $stmt->execute(['id' => $id_recurso]);
        $recurso = $stmt->fetch();

        if (!$recurso) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'El evento no existe o ya no está disponible.']);
            exit;
        }

        $stmt = $pdo->prepare(
            "SELECT COALESCE(SUM(plazas), 0) AS ocupadas
             FROM reservas
             WHERE id_recurso = :id AND estado = 'confirmada'"
        );
        $stmt->execute(['id' => $id_recurso]);
        $ocupadas = (int)$stmt->fetch()['ocupadas'];
        $libres   = $recurso['capacidad'] - $ocupadas;

        if ($plazas > $libres) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => "Solo quedan {$libres} plaza(s) disponibles."]);
            exit;
        }

        // Nombre y email vienen de la sesión, nunca de lo que mande el navegador
        $stmt = $pdo->prepare(
            "INSERT INTO reservas (id_recurso, id_usuario, nombre, email, plazas, estado)
             VALUES (:id_recurso, :id_usuario, :nombre, :email, :plazas, 'confirmada')"
        );
        $stmt->execute([
            'id_recurso' => $id_recurso,
            'id_usuario' => $usuario['id'],
            'nombre'     => $usuario['nombre'],
            'email'      => $usuario['email'],
            'plazas'     => $plazas,
        ]);
        $idReserva = (int)$pdo->lastInsertId();

        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudo guardar la reserva.']);
        exit;
    }

    // La reserva ya está guardada. El correo va DESPUÉS del commit: si falla,
    // la reserva sigue siendo válida y solo avisamos de que no llegó el email.
    $reserva = [
        'id_reserva' => $idReserva,
        'nombre'     => $usuario['nombre'],
        'email'      => $usuario['email'],
        'evento'     => $recurso['nombre'],
        'tipo'       => $recurso['tipo'],
        'fecha'      => date('d/m/Y', strtotime($recurso['fecha'])),
        'hora'       => substr($recurso['hora'], 0, 5),
        'lugar'      => $recurso['lugar'],
        'plazas'     => $plazas,
    ];
    $correoEnviado = enviarCorreoReserva($reserva);

    echo json_encode([
        'ok'             => true,
        'id_reserva'     => $idReserva,
        'correo_enviado' => $correoEnviado,
        'reserva'        => $reserva,
    ]);
    exit;
}

// ------------------------------------------------------------
// DELETE ?id=X: cancelar una reserva propia (hasta 24 h antes)
// No se borra la fila: pasa a estado 'cancelada' para conservar el
// historial. Las plazas se liberan solas porque el aforo solo cuenta
// las reservas 'confirmada'.
// ------------------------------------------------------------
if ($metodo === 'DELETE') {
    requiereLogin();
    $usuario = usuarioActual();

    $id = (int)($_GET['id'] ?? 0);
    if ($id < 1) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Falta el identificador de la reserva.']);
        exit;
    }

    try {
        // Solo se puede cancelar una reserva que sea del propio usuario
        $stmt = $pdo->prepare(
            "SELECT res.id_reserva, res.plazas, res.estado, res.nombre, res.email,
                    r.nombre AS evento, r.tipo, r.lugar, r.fecha, r.hora
             FROM reservas res
             JOIN recursos r ON r.id_recurso = res.id_recurso
             WHERE res.id_reserva = :id AND res.id_usuario = :id_usuario"
        );
        $stmt->execute(['id' => $id, 'id_usuario' => $usuario['id']]);
        $reserva = $stmt->fetch();

        if (!$reserva) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'La reserva no existe.']);
            exit;
        }
        if ($reserva['estado'] !== 'confirmada') {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'Esta reserva ya estaba cancelada.']);
            exit;
        }
        if (!puedeCancelar($reserva['fecha'], $reserva['hora'])) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'Solo puedes cancelar una reserva hasta 24 horas antes del evento.']);
            exit;
        }

        // La condición estado='confirmada' evita cancelar dos veces
        // si llegan dos peticiones a la vez.
        $stmt = $pdo->prepare(
            "UPDATE reservas SET estado = 'cancelada'
             WHERE id_reserva = :id AND id_usuario = :id_usuario AND estado = 'confirmada'"
        );
        $stmt->execute(['id' => $id, 'id_usuario' => $usuario['id']]);

        if ($stmt->rowCount() === 0) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'Esta reserva ya estaba cancelada.']);
            exit;
        }
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudo cancelar la reserva.']);
        exit;
    }

    $correoEnviado = enviarCorreoCancelacion([
        'id_reserva' => (int)$reserva['id_reserva'],
        'nombre'     => $reserva['nombre'],
        'email'      => $reserva['email'],
        'evento'     => $reserva['evento'],
        'tipo'       => $reserva['tipo'],
        'fecha'      => date('d/m/Y', strtotime($reserva['fecha'])),
        'hora'       => substr($reserva['hora'], 0, 5),
        'lugar'      => $reserva['lugar'],
        'plazas'     => (int)$reserva['plazas'],
    ]);

    echo json_encode(['ok' => true, 'correo_enviado' => $correoEnviado]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);