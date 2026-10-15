<?php
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/conexion.php';
require_once __DIR__ . '/horarios.php';
header('Content-Type: application/json; charset=utf-8');

$metodo = $_SERVER['REQUEST_METHOD'];

/** Convierte una fila de la BD en lo que ve el navegador. */
function formatearRecurso(array $r): array {
    return [
        'id_recurso'    => (int)$r['id_recurso'],
        'nombre'        => $r['nombre'],
        'tipo'          => $r['tipo'],
        'descripcion'   => $r['descripcion'],
        'num_pistas'    => (int)$r['num_pistas'],
        'precio'        => (float)$r['precio'],
        'duracion_min'  => (int)$r['duracion_min'],
        'hora_apertura' => substr($r['hora_apertura'], 0, 5),
        'hora_cierre'   => substr($r['hora_cierre'], 0, 5),
        'dias'          => diasAbiertos($r),
        'lugar'         => $r['lugar'],
        'imagen_url'    => $r['imagen_url'],
    ];
}

// ------------------------------------------------------------
// GET: listado público de pistas
// ------------------------------------------------------------
if ($metodo === 'GET') {
    try {
        $stmt = $pdo->query("SELECT * FROM recursos WHERE activo = 1 ORDER BY tipo, nombre");
        $recursos = array_map('formatearRecurso', $stmt->fetchAll());
        echo json_encode(['ok' => true, 'recursos' => $recursos]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudieron cargar las pistas.']);
    }
    exit;
}

// ------------------------------------------------------------
// POST: crear una pista (solo administradores)
// ------------------------------------------------------------
if ($metodo === 'POST') {
    requiereAdmin();
    $admin = usuarioActual();

    $datos       = json_decode(file_get_contents('php://input'), true) ?: [];
    $nombre      = trim($datos['nombre'] ?? '');
    $tipo        = trim($datos['tipo'] ?? '');
    $descripcion = trim($datos['descripcion'] ?? '');
    $numPistas   = (int)($datos['num_pistas'] ?? 0);
    $precio      = is_numeric($datos['precio'] ?? null) ? round((float)$datos['precio'], 2) : -1;
    $duracion    = (int)($datos['duracion_min'] ?? 0);
    $apertura    = trim($datos['hora_apertura'] ?? '');
    $cierre      = trim($datos['hora_cierre'] ?? '');
    $dias        = array_values(array_unique(array_filter(
        array_map('intval', (array)($datos['dias'] ?? [])),
        fn($d) => $d >= 1 && $d <= 7
    )));
    sort($dias);
    $lugar       = trim($datos['lugar'] ?? '');
    $imagen      = trim($datos['imagen_url'] ?? '');

    $error = null;
    if ($nombre === '' || $tipo === '') {
        $error = 'Indica el nombre de la pista y el deporte.';
    } elseif (longitudTexto($nombre) > 120 || longitudTexto($tipo) > 60 || longitudTexto($descripcion) > 255 || longitudTexto($lugar) > 120) {
        $error = 'Alguno de los textos es demasiado largo.';
    } elseif ($numPistas < 1 || $numPistas > 50) {
        $error = 'El número de pistas debe estar entre 1 y 50.';
    } elseif ($precio < 0 || $precio > 9999) {
        $error = 'Indica un precio válido (0 o más).';
    } elseif ($duracion < 15 || $duracion > 480) {
        $error = 'La duración de cada reserva debe estar entre 15 y 480 minutos.';
    } elseif (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $apertura) || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $cierre)) {
        $error = 'Indica una hora de apertura y de cierre válidas.';
    } elseif (aMinutos($cierre) - aMinutos($apertura) < $duracion) {
        $error = 'Entre la apertura y el cierre tiene que caber al menos una reserva.';
    } elseif (count($dias) === 0) {
        $error = 'Marca al menos un día de la semana.';
    } elseif ($imagen !== '' && (longitudTexto($imagen) > 500 || (strpos($imagen, ':') !== false && !preg_match('#^https?://#i', $imagen)))) {
        $error = 'La imagen debe ser una ruta (img/foto.jpg) o un enlace que empiece por http:// o https://';
    }

    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => $error]);
        exit;
    }

    try {
        // El admin de acceso fijo (admin@admin.com) tiene id=0, que no existe en usuarios
        $creadoPor = $admin['id'] > 0 ? $admin['id'] : null;

        $stmt = $pdo->prepare(
            "INSERT INTO recursos
               (nombre, tipo, descripcion, num_pistas, precio, duracion_min,
                hora_apertura, hora_cierre, dias_semana, lugar, imagen_url, creado_por)
             VALUES
               (:nombre, :tipo, :descripcion, :num_pistas, :precio, :duracion,
                :apertura, :cierre, :dias, :lugar, :imagen, :creado_por)"
        );
        $stmt->execute([
            'nombre'      => $nombre,
            'tipo'        => $tipo,
            'descripcion' => $descripcion !== '' ? $descripcion : null,
            'num_pistas'  => $numPistas,
            'precio'      => $precio,
            'duracion'    => $duracion,
            'apertura'    => $apertura . ':00',
            'cierre'      => $cierre . ':00',
            'dias'        => implode(',', $dias),
            'lugar'       => $lugar !== '' ? $lugar : null,
            'imagen'      => $imagen !== '' ? $imagen : null,
            'creado_por'  => $creadoPor,
        ]);

        echo json_encode(['ok' => true, 'id_recurso' => (int)$pdo->lastInsertId()]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudo crear la pista.']);
    }
    exit;
}

// ------------------------------------------------------------
// DELETE ?id=X: eliminar una pista definitivamente (solo administradores).
// Sus reservas se borran en cascada (ON DELETE CASCADE).
// ------------------------------------------------------------
if ($metodo === 'DELETE') {
    requiereAdmin();

    $id = (int)($_GET['id'] ?? 0);
    if ($id < 1) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Falta el identificador de la pista.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM recursos WHERE id_recurso = :id");
        $stmt->execute(['id' => $id]);

        if ($stmt->rowCount() === 0) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'La pista no existe o ya se había eliminado.']);
            exit;
        }
        echo json_encode(['ok' => true]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'No se pudo eliminar la pista.']);
    }
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Método no permitido.']);