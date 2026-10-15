<?php
/**
 * correo.php
 * Envío de correos (SMTP con PHPMailer) y datos de pago.
 *
 * Correos que se envían (siempre al email del usuario que reservó):
 *   - Al reservar:            "Reserva recibida, pendiente de pago"
 *   - Al confirmar el admin:  "Reserva confirmada"
 *   - Al cancelar:            "Reserva cancelada" (la cancele el usuario o el admin)
 *
 * Regla de oro: un fallo al enviar el correo NUNCA debe deshacer la reserva
 * ni la cancelación. Por eso las funciones devuelven true/false y escriben el
 * motivo del fallo en el log de errores de PHP (en XAMPP:
 * C:\xampp\apache\logs\error.log), pero no lanzan excepciones.
 */

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

/** Escapa texto para meterlo en el HTML del correo. */
function esc_correo($texto): string {
    return htmlspecialchars((string)$texto, ENT_QUOTES, 'UTF-8');
}

/** Datos de pago (móvil, método) de db/config_pago.php. */
function configPago(): array {
    $porDefecto = ['telefono' => '', 'metodo' => 'Bizum o transferencia', 'titular' => ''];
    $archivo = __DIR__ . '/config_pago.php';
    if (!is_file($archivo)) {
        return $porDefecto;
    }
    $cfg = require $archivo;
    return is_array($cfg) ? array_merge($porDefecto, $cfg) : $porDefecto;
}

/** 15 -> "15,00 €" */
function formatoEuro($importe): string {
    return number_format((float)$importe, 2, ',', '.') . ' €';
}

/** "2026-10-14" -> "miércoles 14/10/2026" */
function fechaLarga(string $iso): string {
    $dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    $t = strtotime($iso . ' 12:00:00');
    return $dias[(int)date('w', $t)] . ' ' . date('d/m/Y', $t);
}

/**
 * Envía un correo. Devuelve true si el servidor SMTP lo ha aceptado.
 */
function enviarCorreo(string $paraEmail, string $paraNombre, string $asunto, string $html, string $texto): bool {
    $carpeta = __DIR__ . '/phpmailer/';
    $config  = __DIR__ . '/config_correo.php';

    if (!is_file($carpeta . 'PHPMailer.php')) {
        error_log('[correo] Falta la carpeta db/phpmailer (PHPMailer.php, SMTP.php, Exception.php).');
        return false;
    }
    if (!is_file($config)) {
        error_log('[correo] Falta db/config_correo.php.');
        return false;
    }

    $cfg = require $config;
    if (empty($cfg['usuario']) || strpos($cfg['usuario'], 'tu_correo') !== false) {
        error_log('[correo] db/config_correo.php todavía tiene los valores de ejemplo.');
        return false;
    }

    require_once $carpeta . 'Exception.php';
    require_once $carpeta . 'PHPMailer.php';
    require_once $carpeta . 'SMTP.php';

    $mail = new PHPMailer(true);
    try {
        $mail->isSMTP();
        $mail->Host       = $cfg['host'];
        $mail->SMTPAuth   = true;
        $mail->Username   = $cfg['usuario'];
        $mail->Password   = $cfg['clave'];
        $mail->SMTPSecure = ($cfg['cifrado'] === 'ssl')
            ? PHPMailer::ENCRYPTION_SMTPS
            : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = (int)$cfg['puerto'];
        $mail->Timeout    = 10; // segundos: que la reserva no se quede colgada

        $mail->CharSet = 'UTF-8';
        $mail->setFrom($cfg['remitente_email'], $cfg['remitente_nombre']);
        $mail->addAddress($paraEmail, $paraNombre);

        $mail->isHTML(true);
        $mail->Subject = $asunto;
        $mail->Body    = $html;
        $mail->AltBody = $texto;

        $mail->send();
        return true;
    } catch (PHPMailerException $e) {
        error_log('[correo] No se pudo enviar a ' . $paraEmail . ': ' . $mail->ErrorInfo);
        return false;
    } catch (\Throwable $e) {
        error_log('[correo] Error inesperado: ' . $e->getMessage());
        return false;
    }
}

/**
 * Convierte una fila de reserva (con los datos de la pista) en los datos del correo.
 * $fila: id_reserva, nombre, email, evento, tipo, lugar, fecha (AAAA-MM-DD),
 *        hora_inicio, hora_fin, precio
 */
function datosCorreo(array $fila): array {
    return [
        'id_reserva' => (int)$fila['id_reserva'],
        'nombre'     => $fila['nombre'],
        'email'      => $fila['email'],
        'evento'     => $fila['evento'],
        'tipo'       => $fila['tipo'],
        'fecha'      => fechaLarga($fila['fecha']),
        'hora'       => substr($fila['hora_inicio'], 0, 5) . ' – ' . substr($fila['hora_fin'], 0, 5),
        'lugar'      => $fila['lugar'] ?? '',
        'precio'     => formatoEuro($fila['precio']),
    ];
}

/** Filas de la tabla del correo (etiqueta => valor). */
function filasCorreo(array $d, string $estado): array {
    return [
        'Nº de reserva' => '#' . $d['id_reserva'],
        'Pista'         => $d['evento'],
        'Deporte'       => $d['tipo'],
        'Fecha'         => $d['fecha'],
        'Hora'          => $d['hora'],
        'Lugar'         => $d['lugar'] !== '' ? $d['lugar'] : '—',
        'Reserva'       => '1 pista',
        'Importe'       => $d['precio'],
        'Estado'        => $estado,
    ];
}

/** HTML del correo con la misma paleta que la web (azul y ámbar). */
function plantillaCorreo(string $titulo, string $intro, array $filas, string $pie, string $colorAcento): string {
    $filasHtml = '';
    foreach ($filas as $etiqueta => $valor) {
        $filasHtml .= '<tr>'
            . '<td style="padding:9px 0;color:#666666;font-size:14px;border-bottom:1px solid #eeeeee;">' . esc_correo($etiqueta) . '</td>'
            . '<td style="padding:9px 0;font-weight:bold;font-size:14px;text-align:right;border-bottom:1px solid #eeeeee;">' . esc_correo($valor) . '</td>'
            . '</tr>';
    }

    return '<!DOCTYPE html><html lang="es"><body style="margin:0;padding:24px;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#16171A;">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;">'
        . '<tr><td style="background:#1e4d92;padding:18px 24px;color:#ffffff;font-size:20px;letter-spacing:1px;">'
        . '<span style="color:#e2a83a;">&#9679;</span> RESERVAS<span style="color:#e2a83a;">DEPORTIVAS</span></td></tr>'
        . '<tr><td style="height:5px;background:' . $colorAcento . ';font-size:0;line-height:0;">&nbsp;</td></tr>'
        . '<tr><td style="padding:26px 24px;">'
        . '<h2 style="margin:0 0 10px;color:#1e4d92;font-size:22px;">' . esc_correo($titulo) . '</h2>'
        . '<p style="margin:0 0 18px;font-size:15px;line-height:1.5;">' . esc_correo($intro) . '</p>'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">' . $filasHtml . '</table>'
        . '<p style="margin:22px 0 0;font-size:13px;color:#444444;line-height:1.5;">' . esc_correo($pie) . '</p>'
        . '</td></tr></table></body></html>';
}

/** Versión en texto plano (para clientes de correo sin HTML). */
function textoCorreo(string $titulo, string $intro, array $filas, string $pie): string {
    $lineas = [$titulo, '', $intro, ''];
    foreach ($filas as $etiqueta => $valor) {
        $lineas[] = $etiqueta . ': ' . $valor;
    }
    $lineas[] = '';
    $lineas[] = $pie;
    return implode("\n", $lineas);
}

/** Correo al reservar: la reserva queda PENDIENTE hasta que se confirme el pago. */
function enviarCorreoPendiente(array $fila): bool {
    $d = datosCorreo($fila);
    $pago = configPago();

    $titulo = 'Reserva recibida: pendiente de pago';
    $intro  = 'Hola ' . $d['nombre'] . ', hemos recibido tu reserva. Todavía no está confirmada: queda pendiente de tu pago.';
    $pie    = 'Para confirmarla, haz un pago de ' . $d['precio'] . ' por ' . $pago['metodo']
            . ($pago['telefono'] !== '' ? ' al móvil ' . $pago['telefono'] : '')
            . ' indicando «Reserva #' . $d['id_reserva'] . '». Cuando el administrador compruebe el pago, te enviaremos otro correo '
            . 'confirmando tu reserva. La pista queda reservada para ti mientras tanto.';
    $filas  = filasCorreo($d, 'Pendiente de pago');

    return enviarCorreo(
        $d['email'],
        $d['nombre'],
        'Reserva recibida (pendiente de pago) · ' . $d['evento'],
        plantillaCorreo($titulo, $intro, $filas, $pie, '#e2a83a'),
        textoCorreo($titulo, $intro, $filas, $pie)
    );
}

/** Correo cuando el administrador confirma el pago. */
function enviarCorreoConfirmacion(array $fila): bool {
    $d = datosCorreo($fila);

    $titulo = '¡Reserva confirmada!';
    $intro  = 'Hola ' . $d['nombre'] . ', hemos recibido tu pago y tu reserva está confirmada. Estos son los detalles:';
    $pie    = 'Puedes cancelar tu reserva hasta 24 horas antes desde la sección «Mis reservas» de la web.';
    $filas  = filasCorreo($d, 'Confirmada');

    return enviarCorreo(
        $d['email'],
        $d['nombre'],
        'Reserva confirmada · ' . $d['evento'],
        plantillaCorreo($titulo, $intro, $filas, $pie, '#1e4d92'),
        textoCorreo($titulo, $intro, $filas, $pie)
    );
}

/** Correo de reserva cancelada. $porAdmin cambia el texto si la cancela el administrador. */
function enviarCorreoCancelacion(array $fila, bool $porAdmin = false): bool {
    $d = datosCorreo($fila);

    $titulo = 'Reserva cancelada';
    $intro  = $porAdmin
        ? 'Hola ' . $d['nombre'] . ', el administrador ha cancelado tu reserva. La pista ha quedado libre de nuevo.'
        : 'Hola ' . $d['nombre'] . ', hemos cancelado tu reserva. La pista ha quedado libre de nuevo.';
    $pie    = 'Si ha sido un error, puedes volver a reservar desde la web mientras queden pistas libres.';
    $filas  = filasCorreo($d, 'Cancelada');

    return enviarCorreo(
        $d['email'],
        $d['nombre'],
        'Reserva cancelada · ' . $d['evento'],
        plantillaCorreo($titulo, $intro, $filas, $pie, '#C1502E'),
        textoCorreo($titulo, $intro, $filas, $pie)
    );
}