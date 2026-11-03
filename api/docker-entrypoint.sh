#!/bin/sh
# La API no corre como root: si alguien lograra ejecutar codigo en ella, no seria root del
# contenedor. Solo este paso va como root: el volumen de subidas (fotos de la carta, avatares,
# recibos) puede traer archivos de cuando la API corria como root, y "node" tiene que poder
# escribir y borrar en el. Despues, su-exec cambia a "node" para el resto.
set -e
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/uploads
  chown -R node:node /app/uploads
  exec su-exec node "$@"
fi
exec "$@"
