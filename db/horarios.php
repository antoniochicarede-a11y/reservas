<?php
/**
 * horarios.php
 * Lógica común de horarios y disponibilidad. La usan disponibilidad.php,
 * reservas.php y estadisticas.php.
 *
 * Una pista (recurso) tiene: hora de apertura, hora de cierre, duración de
 * cada reserva (franja) y los días de la semana en que abre. A partir de eso
 * se generan las franjas de cada día (p. ej. 09:00-10:00, 10:00-11:00...).
 * Cada reserva ocupa UNA pista en una franja; si hay 3 pistas y una está
 * reservada, quedan 2 libres en esa franja.
 */

// Fechas y horas siempre en hora peninsular española
date_default_timezone_set('Europe/Madrid');

// Estados que ocupan pista (una reserva cancelada la libera)
const ESTADOS_OCUPAN = "'pendiente','confirmada'";

/** Número de caracteres de un texto UTF-8 (sin depender de la extensión mbstring). */
function longitudTexto(string $texto): int {
    return (int)preg_match_all('/./us', $texto);
}

/** "09:30" o "09:30:00" -> minutos desde las 00:00 (570). */
function aMinutos(string $hora): int {
    $partes = explode(':', $hora);
    return ((int)$partes[0]) * 60 + (int)($partes[1] ?? 0);
}

/** 570 -> "09:30". */
function deMinutos(int $min): string {
    return sprintf('%02d:%02d', intdiv($min, 60), $min % 60);
}

/** ¿Es una fecha real con formato AAAA-MM-DD? */
function fechaValida(string $fecha): bool {
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $fecha, $m)) {
        return false;
    }
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]);
}

/** Días de la semana en que abre la pista, como array de enteros (1=lunes ... 7=domingo). */
function diasAbiertos(array $recurso): array {
    $dias = array_filter(array_map('intval', explode(',', (string)$recurso['dias_semana'])));
    return array_values(array_unique($dias));
}

/** ¿La pista abre ese día? */
function diaAbierto(array $recurso, string $fecha): bool {
    $diaSemana = (int)date('N', strtotime($fecha . ' 12:00:00')); // 1..7
    return in_array($diaSemana, diasAbiertos($recurso), true);
}

/**
 * Franjas de un día: [['inicio' => '09:00', 'fin' => '10:00'], ...]
 * La última franja es la que termina como muy tarde a la hora de cierre.
 */
function generarFranjas(array $recurso): array {
    $inicio   = aMinutos($recurso['hora_apertura']);
    $cierre   = aMinutos($recurso['hora_cierre']);
    $duracion = max(5, (int)$recurso['duracion_min']);

    $franjas = [];
    for ($t = $inicio; $t + $duracion <= $cierre; $t += $duracion) {
        $franjas[] = ['inicio' => deMinutos($t), 'fin' => deMinutos($t + $duracion)];
    }
    return $franjas;
}

/**
 * Reservas que ocupan pista entre dos fechas (ambas incluidas).
 * Devuelve un mapa "AAAA-MM-DD|HH:MM" => número de pistas ocupadas.
 */
function pistasOcupadas(PDO $pdo, int $idRecurso, string $desde, string $hasta): array {
    $stmt = $pdo->prepare(
        "SELECT fecha, TIME_FORMAT(hora_inicio, '%H:%i') AS hora, COUNT(*) AS ocupadas
         FROM reservas
         WHERE id_recurso = :id AND fecha BETWEEN :desde AND :hasta
           AND estado IN (" . ESTADOS_OCUPAN . ")
         GROUP BY fecha, hora_inicio"
    );
    $stmt->execute(['id' => $idRecurso, 'desde' => $desde, 'hasta' => $hasta]);

    $mapa = [];
    foreach ($stmt->fetchAll() as $fila) {
        $mapa[$fila['fecha'] . '|' . $fila['hora']] = (int)$fila['ocupadas'];
    }
    return $mapa;
}

/**
 * Estado de un día concreto con sus franjas.
 * Devuelve ['estado' => 'disponible'|'completo'|'cerrado'|'pasado', 'slots' => [...]]
 * y cada slot: ['hora', 'fin', 'libres', 'estado' => 'libre'|'completo'|'pasado'].
 */
function estadoDia(array $recurso, string $fecha, array $ocupadas, string $hoy, int $minutosAhora): array {
    if (!diaAbierto($recurso, $fecha)) {
        return ['estado' => 'cerrado', 'slots' => []];
    }

    $slots = [];
    $hayLibre = false;
    $hayFuturo = false;

    foreach (generarFranjas($recurso) as $f) {
        $ocupadasAqui = $ocupadas[$fecha . '|' . $f['inicio']] ?? 0;
        $libres = max(0, (int)$recurso['num_pistas'] - $ocupadasAqui);

        $pasado = $fecha < $hoy || ($fecha === $hoy && aMinutos($f['inicio']) <= $minutosAhora);
        if ($pasado) {
            $estado = 'pasado';
        } else {
            $hayFuturo = true;
            $estado = $libres > 0 ? 'libre' : 'completo';
            if ($libres > 0) {
                $hayLibre = true;
            }
        }

        $slots[] = [
            'hora'   => $f['inicio'],
            'fin'    => $f['fin'],
            'libres' => $libres,
            'estado' => $estado,
        ];
    }

    if ($hayLibre) {
        $estadoDia = 'disponible';
    } elseif ($hayFuturo) {
        $estadoDia = 'completo';
    } else {
        $estadoDia = 'pasado';
    }
    return ['estado' => $estadoDia, 'slots' => $slots];
}

/** Hora actual en minutos (hora de Madrid). */
function minutosAhora(): int {
    return ((int)date('G')) * 60 + (int)date('i');
}