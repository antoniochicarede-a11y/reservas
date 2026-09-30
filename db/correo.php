<?php
/**
 * correo.php
 * Envío de correos (SMTP con PHPMailer) para reservas y cancelaciones.
 *
 * Regla de oro: un fallo al enviar el correo NUNCA debe deshacer la reserva
 * ni la cancelación. Por eso todas las funciones devuelven true/false y
 * escriben el motivo del fallo en el log de errores de PHP (en XAMPP:
 * C:\xampp\apache\logs\error.log), pero no lanzan excepciones.
 */

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

/** Escapa texto para meterlo en el HTML del correo. */
function esc_correo($texto): string {
    return htmlspecialchars((string)$texto, ENT_QUOTES, 'UTF-8');
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

/** Datos que aparecen en la tabla del correo (etiqueta => valor). */
function filasCorreo(array $r): array {
    return [
        'Nº de reserva' => '#' . $r['id_reserva'],
        'Evento'        => $r['evento'],
        'Deporte'       => $r['tipo'],
        'Fecha'         => $r['fecha'],
        'Hora'          => $r['hora'],
        'Lugar'         => !empty($r['lugar']) ? $r['lugar'] : '—',
        'Plazas'        => $r['plazas'],
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
        . '<p style="margin:22px 0 0;font-size:13px;color:#666666;line-height:1.5;">' . esc_correo($pie) . '</p>'
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

/**
 * Correo de reserva confirmada.
 * $r: id_reserva, nombre, email, evento, tipo, fecha, hora, lugar, plazas
 */
function enviarCorreoReserva(array $r): bool {
    $titulo = '¡Reserva confirmada!';
    $intro  = 'Hola ' . $r['nombre'] . ', tu reserva está confirmada. Estos son los detalles:';
    $pie    = 'Puedes cancelar tu reserva gratis hasta 24 horas antes del evento desde la sección «Mis reservas» de la web.';
    $filas  = filasCorreo($r);

    return enviarCorreo(
        $r['email'],
        $r['nombre'],
        'Reserva confirmada · ' . $r['evento'],
        plantillaCorreo($titulo, $intro, $filas, $pie, '#e2a83a'),
        textoCorreo($titulo, $intro, $filas, $pie)
    );
}

/** Correo de reserva cancelada (mismos campos que enviarCorreoReserva). */
function enviarCorreoCancelacion(array $r): bool {
    $titulo = 'Reserva cancelada';
    $intro  = 'Hola ' . $r['nombre'] . ', hemos cancelado tu reserva. Las plazas han quedado libres de nuevo.';
    $pie    = 'Si ha sido un error, puedes volver a reservar desde la web mientras queden plazas.';
    $filas  = filasCorreo($r);

    return enviarCorreo(
        $r['email'],
        $r['nombre'],
        'Reserva cancelada · ' . $r['evento'],
        plantillaCorreo($titulo, $intro, $filas, $pie, '#C1502E'),
        textoCorreo($titulo, $intro, $filas, $pie)
    );
}