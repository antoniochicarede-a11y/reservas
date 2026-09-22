<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/conexion.php';
header('Content-Type: application/json; charset=utf-8');

$metodo = $_SERVER['REQUEST_METHOD'];

// ------------------------------------------------------------
// GET: reservas del usuario que ha iniciado sesión
// ------------------------------------------------------------
if ($metodo === 'GET') {
    requiereLogin();
    $usuario = usuarioActual();

    try {
        $sql = "SELECT res.id_reserva, res.plazas, res.estado, res.fecha_creacion,
                       r.nombre AS recurso, r.tipo,
                       DATE_FORMAT(r.fecha, '%d/%m/%Y') AS fecha,
                       TIME_FORMAT(r.hora, '%H:%i') AS hora
                FROM reservas res
                JOIN recursos r ON r.id_recurso = res.id_recurso
                WHERE res.id_usuario = :id_usuario
                ORDER BY r.fecha DESC, r.hora DESC";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(['id_usuario' => $usuario['id']]);

        echo json_encode(['ok' => true, 'reservas' => $stmt->fetchAll()]);
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
            "SELECT capacidad FROM recursos WHERE id_recurso = :id AND activo = 1 FOR UPDATE"
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

        $pdo->commit();
        echo json_encode(['ok' => true, 'id_reserva' => $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudo guardar la reserva.']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);