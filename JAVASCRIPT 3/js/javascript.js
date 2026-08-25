function recogeDatos(evento) {
  evento.preventDefault();

  var nombre = document.querySelector("#nombre").value;
  var fecha = document.querySelector("#fecha").value;
  var bienvenida = document.querySelector("#bienvenida");

  var edad;
  var mensaje;
  var mensajeEdad;
  const d = new Date();
  let year = d.getFullYear();

}