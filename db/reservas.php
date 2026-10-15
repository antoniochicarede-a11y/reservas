<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/conexion.php';
require_once __DIR__ . '/horarios.php';
require_once __DIR__ . '/correo.php';
header('Content-Type: application/json; charset=utf-8');

// Una reserva confirmada solo se puede cancelar con al menos estas horas de margen.
const HORAS_LIMITE_CANCELACION = 24;

/**
 * ¿Puede el usuario cancelar esta reserva ahora?
 *  - cancelada: no.
 *  - pendiente (aún sin pagar): sí, mientras no haya empezado.
 *  - confirmada (ya pagada): solo hasta 24 h antes.
 */
function puedeCancelarReserva(string $estado, string $fecha, string $horaInicio): bool {
    if ($estado === 'cancelada') {
        return false;
    }
    $inicio = strtotime($fecha . ' ' . $horaInicio);
    if ($inicio === false) {
        return false;
    }
    $falta = $inicio - time();
    return $estado === 'pendiente' ? $falta > 0 : $falta >= HORAS_LIMITE_CANCELACION * 3600;
}

$metodo = $_SERVER['REQUEST_METHOD'];

// ------------------------------------------------------------
// GET: reservas del usuario que ha iniciado sesión (las más recientes primero)
// ------------------------------------------------------------
if ($metodo === 'GET') {
    requiereLogin();
    $usuario = usuarioActual();

    try {
        $sql = "SELECT res.id_reserva, res.estado, res.precio, res.fecha_creacion,
                       res.fecha, TIME_FORMAT(res.hora_inicio, '%H:%i') AS hora_inicio,
                       TIME_FORMAT(res.hora_fin, '%H:%i') AS hora_fin,
                       r.nombre AS recurso, r.tipo, r.lugar
                FROM reservas res
                JOIN recursos r ON r.id_recurso = res.id_recurso
                WHERE res.id_usuario = :id_usuario
                ORDER BY res.id_reserva DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id_usuario' => $usuario['id']]);
        $reservas = $stmt->fetchAll();

        foreach ($reservas as &$r) {
            $r['id_reserva']     = (int)$r['id_reserva'];
            $r['precio']         = (float)$r['precio'];
            // El navegador solo muestra el botón "Cancelar" si esto es true,
            // pero la regla de verdad se vuelve a comprobar en el DELETE.
            $r['puede_cancelar'] = puedeCancelarReserva($r['estado'], $r['fecha'], $r['hora_inicio']);
            // Reservas cuyo horario ya ha terminado (para no pedir pago ni ofrecer cancelar)
            $r['ya_paso']        = strtotime($r['fecha'] . ' ' . $r['hora_fin']) < time();
        }
        unset($r);

        echo json_encode(['ok' => true, 'reservas' => $reservas, 'pago' => configPago()]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudieron cargar tus reservas.']);
    }
    exit;
}

// ------------------------------------------------------------
// POST: reservar UNA pista en un día y una hora (usuario logueado).
// La reserva nace PENDIENTE: no se confirma hasta que el admin vea el pago.
// ------------------------------------------------------------
if ($metodo === 'POST') {
    requiereLogin();
    $usuario = usuarioActual();

    if ((int)$usuario['id'] === 0) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Con la cuenta de administrador no se pueden hacer reservas. Usa una cuenta de cliente.']);
        exit;
    }

    $datos      = json_decode(file_get_contents('php://input'), true) ?: [];
    $idRecurso  = (int)($datos['id_recurso'] ?? 0);
    $fecha      = (string)($datos['fecha'] ?? '');
    $hora       = (string)($datos['hora'] ?? '');

    if ($idRecurso < 1 || !fechaValida($fecha) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $hora)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Elige un día y una hora para tu reserva.']);
        exit;
    }

    $hoy = date('Y-m-d');
    if ($fecha < $hoy || ($fecha === $hoy && aMinutos($hora) <= minutosAhora())) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'No se pueden reservar días ni horas que ya han pasado.']);
        exit;
    }
    if ($fecha > date('Y-m-d', strtotime('+2 years'))) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Esa fecha queda demasiado lejos.']);
        exit;
    }

    try {
        $pdo->beginTransaction();

        // Bloquea la fila de la pista mientras comprobamos cuántas quedan libres
        $stmt = $pdo->prepare("SELECT * FROM recursos WHERE id_recurso = :id AND activo = 1 FOR UPDATE");
        $stmt->execute(['id' => $idRecurso]);
        $recurso = $stmt->fetch();

        if (!$recurso) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'Esta pista ya no está disponible.']);
            exit;
        }
        if (!diaAbierto($recurso, $fecha)) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'Ese día la pista está cerrada.']);
            exit;
        }

        // La hora tiene que ser exactamente el inicio de una franja de esa pista
        $horaFin = null;
        foreach (generarFranjas($recurso) as $f) {
            if ($f['inicio'] === $hora) {
                $horaFin = $f['fin'];
                break;
            }
        }
        if ($horaFin === null) {
            $pdo->rollBack();
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Esa hora no es un horario válido de esta pista.']);
            exit;
        }

        // ¿Quedan pistas libres en ese día y hora?
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM reservas
             WHERE id_recurso = :id AND fecha = :fecha AND hora_inicio = :hora
               AND estado IN (" . ESTADOS_OCUPAN . ")"
        );
        $stmt->execute(['id' => $idRecurso, 'fecha' => $fecha, 'hora' => $hora . ':00']);
        if ((int)$stmt->fetchColumn() >= (int)$recurso['num_pistas']) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'Ya no quedan pistas libres en ese horario. Elige otra hora u otro día.']);
            exit;
        }

        // Evita reservar dos veces lo mismo por error (doble clic, etc.)
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM reservas
             WHERE id_usuario = :u AND id_recurso = :id AND fecha = :fecha AND hora_inicio = :hora
               AND estado IN (" . ESTADOS_OCUPAN . ")"
        );
        $stmt->execute(['u' => $usuario['id'], 'id' => $idRecurso, 'fecha' => $fecha, 'hora' => $hora . ':00']);
        if ((int)$stmt->fetchColumn() > 0) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'Ya tienes una reserva para esa pista en ese horario.']);
            exit;
        }

        // Nombre y email vienen de la sesión, nunca de lo que mande el navegador
        $stmt = $pdo->prepare(
            "INSERT INTO reservas (id_recurso, id_usuario, nombre, email, fecha, hora_inicio, hora_fin, precio, estado)
             VALUES (:id_recurso, :id_usuario, :nombre, :email, :fecha, :inicio, :fin, :precio, 'pendiente')"
        );
        $stmt->execute([
            'id_recurso' => $idRecurso,
            'id_usuario' => $usuario['id'],
            'nombre'     => $usuario['nombre'],
            'email'      => $usuario['email'],
            'fecha'      => $fecha,
            'inicio'     => $hora . ':00',
            'fin'        => $horaFin . ':00',
            'precio'     => $recurso['precio'],
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
    $fila = [
        'id_reserva'  => $idReserva,
        'nombre'      => $usuario['nombre'],
        'email'       => $usuario['email'],
        'evento'      => $recurso['nombre'],
        'tipo'        => $recurso['tipo'],
        'lugar'       => $recurso['lugar'],
        'fecha'       => $fecha,
        'hora_inicio' => $hora,
        'hora_fin'    => $horaFin,
        'precio'      => $recurso['precio'],
    ];
    $correoEnviado = enviarCorreoPendiente($fila);

    echo json_encode([
        'ok'             => true,
        'id_reserva'     => $idReserva,
        'correo_enviado' => $correoEnviado,
        'reserva'        => [
            'id_reserva'  => $idReserva,
            'recurso'     => $recurso['nombre'],
            'tipo'        => $recurso['tipo'],
            'lugar'       => $recurso['lugar'],
            'fecha'       => $fecha,
            'hora_inicio' => $hora,
            'hora_fin'    => $horaFin,
            'precio'      => (float)$recurso['precio'],
            'estado'      => 'pendiente',
        ],
        'pago'           => configPago(),
    ]);
    exit;
}

// ------------------------------------------------------------
// DELETE ?id=X: cancelar una reserva propia.
// No se borra la fila: pasa a 'cancelada' para conservar el historial, y la
// pista queda libre porque solo ocupan pista las reservas pendientes/confirmadas.
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
            "SELECT res.id_reserva, res.estado, res.nombre, res.email, res.precio,
                    res.fecha, res.hora_inicio, res.hora_fin,
                    r.nombre AS evento, r.tipo, r.lugar
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
        if ($reserva['estado'] === 'cancelada') {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'Esta reserva ya estaba cancelada.']);
            exit;
        }
        if (!puedeCancelarReserva($reserva['estado'], $reserva['fecha'], $reserva['hora_inicio'])) {
            http_response_code(403);
            $msg = $reserva['estado'] === 'confirmada'
                ? 'Solo puedes cancelar una reserva confirmada hasta 24 horas antes de la hora de juego.'
                : 'Esta reserva ya ha empezado y no se puede cancelar.';
            echo json_encode(['ok' => false, 'error' => $msg]);
            exit;
        }

        // La condición del estado evita cancelar dos veces si llegan dos peticiones a la vez
        $stmt = $pdo->prepare(
            "UPDATE reservas SET estado = 'cancelada'
             WHERE id_reserva = :id AND id_usuario = :id_usuario AND estado IN (" . ESTADOS_OCUPAN . ")"
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

    $correoEnviado = enviarCorreoCancelacion($reserva, false);

    echo json_encode(['ok' => true, 'correo_enviado' => $correoEnviado]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);