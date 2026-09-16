<?php
/**
 * GET  /api/reservas.php?email=correo@ejemplo.com
 *   -> Devuelve las reservas de ese usuario ("Mis reservas").
 *
 * POST /api/reservas.php
 *   Body JSON: { "nombre":"Laura Gómez", "email":"...", "id_recurso":1,
 *                "fecha":"2026-06-15", "hora":"18:00:00", "plazas":2 }
 *   -> Crea (o reutiliza) el usuario por email y crea una fila en
 *      "reservas" por cada plaza solicitada, si hay hueco disponible.
 */

require_once __DIR__ . '/../conexion.php';
header('Content-Type: application/json; charset=utf-8');

const MAX_PLAZAS_POR_RESERVA = 20;

$metodo = $_SERVER['REQUEST_METHOD'];

if ($metodo === 'GET') {
    listarReservas($pdo);
} elseif ($metodo === 'POST') {
    crearReserva($pdo);
} else {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);
}

function listarReservas(PDO $pdo): void
{
    $email = trim($_GET['email'] ?? '');
    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Email inválido o ausente.']);
        return;
    }

    $sql = "
        SELECT res.id_reserva, res.fecha, res.hora, res.estado,
               rec.nombre AS recurso, rec.tipo
        FROM reservas res
        JOIN usuarios u  ON u.id_usuario  = res.id_usuario
        JOIN recursos rec ON rec.id_recurso = res.id_recurso
        WHERE u.email = :email
        ORDER BY res.fecha DESC, res.hora DESC
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['email' => $email]);

    echo json_encode(['ok' => true, 'reservas' => $stmt->fetchAll()]);
}

function crearReserva(PDO $pdo): void
{
    $datos = json_decode(file_get_contents('php://input'), true);

    if (!is_array($datos)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'El cuerpo de la petición no es JSON válido.']);
        return;
    }

    $nombreCompleto = trim($datos['nombre'] ?? '');
    $email          = trim($datos['email'] ?? '');
    $idRecurso      = (int)($datos['id_recurso'] ?? 0);
    $fecha          = $datos['fecha'] ?? '';
    $hora           = $datos['hora'] ?? '';
    $plazas         = max(1, (int)($datos['plazas'] ?? 1));
    $plazas         = min($plazas, MAX_PLAZAS_POR_RESERVA);

    if ($nombreCompleto === '' || $email === '' || !$idRecurso || $fecha === '' || $hora === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Faltan datos obligatorios.']);
        return;
    }

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'El email indicado no es válido.']);
        return;
    }

    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Formato de fecha inválido. Usa AAAA-MM-DD.']);
        return;
    }

    if (!preg_match('/^\d{2}:\d{2}(:\d{2})?$/', $hora)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Formato de hora inválido. Usa HH:MM o HH:MM:SS.']);
        return;
    }

    // El formulario solo pide "nombre y apellidos" en un único campo;
    // la tabla usuarios separa nombre y apellidos, así que se divide aquí.
    $partes    = explode(' ', $nombreCompleto, 2);
    $nombre    = $partes[0];
    $apellidos = $partes[1] ?? '';

    try {
        $pdo->beginTransaction();

        // 1) Buscar o crear el usuario por email
        $stmt = $pdo->prepare('SELECT id_usuario FROM usuarios WHERE email = :email');
        $stmt->execute(['email' => $email]);
        $usuario = $stmt->fetch();

        if ($usuario) {
            $idUsuario = $usuario['id_usuario'];
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO usuarios (nombre, apellidos, email) VALUES (:nombre, :apellidos, :email)'
            );
            $stmt->execute(['nombre' => $nombre, 'apellidos' => $apellidos, 'email' => $email]);
            $idUsuario = $pdo->lastInsertId();
        }

        // 2) Comprobar que el recurso existe, bloqueando su fila para evitar
        //    que otra petición simultánea lea la capacidad al mismo tiempo.
        $stmt = $pdo->prepare('SELECT capacidad FROM recursos WHERE id_recurso = :id FOR UPDATE');
        $stmt->execute(['id' => $idRecurso]);
        $recurso = $stmt->fetch();

        if (!$recurso) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'El recurso indicado no existe.']);
            return;
        }

        // 3) Contar plazas ocupadas para ese recurso/fecha/hora.
        //    Al estar dentro de la misma transacción que el FOR UPDATE anterior,
        //    ninguna otra petición puede colarse entre esta comprobación y el INSERT.
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) AS ocupadas FROM reservas
             WHERE id_recurso = :id AND fecha = :fecha AND hora = :hora AND estado = 'Confirmada'"
        );
        $stmt->execute(['id' => $idRecurso, 'fecha' => $fecha, 'hora' => $hora]);
        $ocupadas = (int)$stmt->fetch()['ocupadas'];

        $libres = $recurso['capacidad'] - $ocupadas;
        if ($plazas > $libres) {
            $pdo->rollBack();
            http_response_code(409);
            echo json_encode([
                'ok' => false,
                'error' => "Solo quedan $libres plaza(s) libres para ese horario.",
            ]);
            return;
        }

        // 4) Insertar una fila de reserva por cada plaza solicitada
        $stmt = $pdo->prepare(
            'INSERT INTO reservas (id_usuario, id_recurso, fecha, hora, estado)
             VALUES (:id_usuario, :id_recurso, :fecha, :hora, \'Confirmada\')'
        );
        for ($i = 0; $i < $plazas; $i++) {
            $stmt->execute([
                'id_usuario' => $idUsuario,
                'id_recurso' => $idRecurso,
                'fecha'      => $fecha,
                'hora'       => $hora,
            ]);
        }

        $pdo->commit();
        echo json_encode(['ok' => true, 'mensaje' => 'Reserva confirmada.']);
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        error_log('[reservas.php] Error al crear reserva: ' . $e->getMessage());

        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Error al crear la reserva.']);
    }
}