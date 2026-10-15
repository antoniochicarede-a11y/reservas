<?php
/**
 * config_pago.php
 * Datos para que el cliente haga el pago de su reserva.
 * Se muestran en la web (al reservar y en "Mis reservas") y en el correo.
 *
 * Esto NO es una contraseña: es un número de teléfono público, así que este
 * archivo sí se puede subir a Git. Cambia el número por el tuyo.
 */
return [
    'telefono' => '600 123 456',         
    'metodo'   => 'Bizum o transferencia',
    'titular'  => 'Reservas Deportivas',
];