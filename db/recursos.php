<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/conexion.php';
header('Content-Type: application/json; charset=utf-8');

$metodo = $_SERVER['REQUEST_METHOD'];

// ------------------------------------------------------------
// GET: listado público de eventos con plazas libres calculadas
// ------------------------------------------------------------
if ($metodo === 'GET') {
    try {
        $sql = "SELECT r.id_recurso, r.nombre, r.tipo, r.descripcion, r.capacidad,
                       r.fecha, r.hora, r.lugar,
                       (r.capacidad - COALESCE(SUM(res.plazas), 0)) AS plazas_libres
                FROM recursos r
                LEFT JOIN reservas res
                       ON res.id_recurso = r.id_recurso
                      AND res.estado = 'confirmada'
                WHERE r.activo = 1
                GROUP BY r.id_recurso
                ORDER BY r.fecha, r.hora";

        $stmt = $pdo->query($sql);
        $recursos = $stmt->fetchAll();

        foreach ($recursos as &$r) {
            $r['plazas_libres'] = max(0, (int)$r['plazas_libres']);
        }

        echo json_encode(['ok' => true, 'recursos' => $recursos]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudieron cargar los recursos.']);
    }
    exit;
}

// ------------------------------------------------------------
// POST: crear un nuevo evento (solo administradores)
// ------------------------------------------------------------
if ($metodo === 'POST') {
    requiereAdmin();
    $admin = usuarioActual();

    $datos       = json_decode(file_get_contents('php://input'), true);
    $nombre      = trim($datos['nombre'] ?? '');
    $tipo        = trim($datos['tipo'] ?? '');
    $descripcion = trim($datos['descripcion'] ?? '');
    $capacidad   = (int)($datos['capacidad'] ?? 0);
    $fecha       = $datos['fecha'] ?? '';
    $hora        = $datos['hora'] ?? '';
    $lugar       = trim($datos['lugar'] ?? '');

    if ($nombre === '' || $tipo === '' || $capacidad < 1 || $fecha === '' || $hora === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Completa nombre, deporte, capacidad, fecha y hora.']);
        exit;
    }

    try {
        // El admin de acceso fijo (admin@admin.com) tiene id=0, que no existe
        // en la tabla usuarios: si lo guardamos tal cual, rompe la relación
        // con creado_por (por eso daba error 500). En ese caso, no lo asociamos
        // a ningún usuario concreto.
        $creadoPor = $admin['id'] > 0 ? $admin['id'] : null;

        $stmt = $pdo->prepare(
            "INSERT INTO recursos (nombre, tipo, descripcion, capacidad, fecha, hora, lugar, creado_por)
             VALUES (:nombre, :tipo, :descripcion, :capacidad, :fecha, :hora, :lugar, :creado_por)"
        );
        $stmt->execute([
            'nombre'      => $nombre,
            'tipo'        => $tipo,
            'descripcion' => $descripcion !== '' ? $descripcion : null,
            'capacidad'   => $capacidad,
            'fecha'       => $fecha,
            'hora'        => $hora,
            'lugar'       => $lugar !== '' ? $lugar : null,
            'creado_por'  => $creadoPor,
        ]);

        echo json_encode(['ok' => true, 'id_recurso' => $pdo->lastInsertId()]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudo crear el evento.']);
    }
    exit;
}

// ------------------------------------------------------------
// DELETE: eliminar un evento definitivamente (solo administradores)
// Al borrar el recurso, sus reservas se borran en cascada (ON DELETE
// CASCADE en la tabla reservas), así que no quedan huérfanas.
// ------------------------------------------------------------
if ($metodo === 'DELETE') {
    requiereAdmin();

    $id = (int)($_GET['id'] ?? 0);
    if ($id < 1) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Falta el identificador del evento.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM recursos WHERE id_recurso = :id");
        $stmt->execute(['id' => $id]);

        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'El evento no existe o ya se había eliminado.']);
            exit;
        }

        echo json_encode(['ok' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudo eliminar el evento.']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);