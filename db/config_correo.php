<?php
/**
 * config_correo.php
 * Credenciales del correo que ENVÍA los avisos de reserva/cancelación.
 *
 * ¡NO SUBIR A GIT! Este archivo está en .gitignore. Rellénalo SOLO en tu
 * copia local, y no pegues la contraseña en ningún archivo que se suba.
 *
 * Con Gmail:
 *   1) Activa la verificación en dos pasos en tu cuenta de Google.
 *   2) Crea una "contraseña de aplicación" en
 *      https://myaccount.google.com/apppasswords
 *   3) Pega aquí esa contraseña de 16 caracteres (sin espacios) en 'clave'.
 *   (La contraseña normal de tu cuenta NO funciona por SMTP.)
 */
return [
    'host'             => 'smtp.gmail.com',
    'puerto'           => 587,
    'cifrado'          => 'tls',                       // 'tls' (587) o 'ssl' (465)
    'usuario'          => '',       // cuenta que envía
    'clave'            => '',
    'remitente_email'  => '',       // normalmente el mismo
    'remitente_nombre' => 'Reservas Deportivas',
];