# Despliegue en Linux (nginx + webpack + app.jar)

| Pieza | Qué es | Puerto |
|---|---|---|
| Front | `deploy/release/dist/` (build de webpack: `index.html` + `assets/`) servido por nginx | 80 |
| Back | `deploy/release/app.jar` (servidor Ice) corriendo con `nohup` | 10000 (TCP, JavaFX) y 10002 (WebSocket, web) |

Los archivos ya compilados están en `deploy/release/`, así que en el Linux solo se necesitan **Java 17+** y **nginx**.

El front se conecta solo al mismo host desde el que se cargó la página, en el puerto `10002`. Por eso nginx y `app.jar` van en el mismo computador.

---

## 0. Revisar el computador Linux

```bash
java -version      # debe ser 17 o superior
nginx -v           # nginx instalado
sudo -v            # ¿tienes sudo? (si no, usa la opción B del paso 3)
hostname -I        # IP del computador, la necesitas para conectarte desde otros equipos
```

Si falta Java o nginx y tienes sudo: `sudo apt install openjdk-17-jre nginx`.

---

## 1. Clonar el repositorio

```bash
cd ~
git clone -b despliegue https://github.com/Compu-1/Taller_Ajedrez_Michelle_Elias.git ajedrez
cd ~/ajedrez/deploy/release
ls                 # debe mostrar: app.jar  dist
```

---

## 2. Desplegar el back (Ice)

```bash
cd ~/ajedrez/deploy/release
nohup java -jar app.jar > server.log 2>&1 &
```

Verificar:

```bash
cat server.log                       # debe decir: [OK] Servidor escuchando en: default -p 10000:ws -h 0.0.0.0 -p 10002
ss -tlnp | grep -E '10000|10002'     # los dos puertos en LISTEN
```

`nohup` hace que siga corriendo aunque cierres la terminal. El ranking se guarda en `deploy/release/data/player_tiers.csv`.

---

## 3. Configurar nginx y desplegar el front

### Opción A: con sudo (puerto 80)

```bash
cd ~/ajedrez/deploy
sudo mkdir -p /var/www/ajedrez
sudo cp -r release/dist/* /var/www/ajedrez/
sudo cp nginx/ajedrez.conf /etc/nginx/sites-available/ajedrez
sudo ln -s /etc/nginx/sites-available/ajedrez /etc/nginx/sites-enabled/ajedrez
sudo rm -f /etc/nginx/sites-enabled/default    # si no, sale la página "Welcome to nginx"
sudo nginx -t                                   # debe decir "syntax is ok" y "test is successful"
sudo systemctl reload nginx                     # o: sudo systemctl restart nginx
```

> En Fedora/CentOS no existe `sites-available`: copia el archivo a `/etc/nginx/conf.d/ajedrez.conf`.

### Opción B: sin sudo (puerto 8080)

Crea `~/ajedrez/deploy/release/nginx.conf` con este contenido (cambia `TU_USUARIO`; lo ves con `whoami`):

```nginx
worker_processes 1;
pid /home/TU_USUARIO/ajedrez/deploy/release/nginx.pid;
error_log /home/TU_USUARIO/ajedrez/deploy/release/nginx-error.log;

events { worker_connections 256; }

http {
    include /etc/nginx/mime.types;
    access_log /home/TU_USUARIO/ajedrez/deploy/release/nginx-access.log;
    client_body_temp_path /tmp/ajedrez-nginx-body;
    proxy_temp_path /tmp/ajedrez-nginx-proxy;

    server {
        listen 8080;
        root /home/TU_USUARIO/ajedrez/deploy/release/dist;
        index index.html;
        location / { try_files $uri $uri/ /index.html; }
    }
}
```

```bash
cd ~/ajedrez/deploy/release
nginx -p "$PWD" -c "$PWD/nginx.conf" -t    # probar la configuración
nginx -p "$PWD" -c "$PWD/nginx.conf"       # arrancar
```

---

## 4. Verificar el funcionamiento

1. En el Linux: `curl -I http://localhost/` (o `http://localhost:8080/` con la opción B) → `HTTP/1.1 200 OK`.
2. Desde otro computador: abre `http://IP_DEL_LINUX/` (o `:8080`).
3. El campo **Servidor** ya trae la IP y el puerto es `10002` → **Conectar** → debe pasar a "Conectado".
4. Crea una sala, únete desde otra pestaña o equipo y haz una jugada: debe aparecer en ambos.
5. JavaFX: `.\gradlew.bat runClient` en otro equipo, conectando a `IP_DEL_LINUX` puerto `10000`.

Si el firewall está activo (`sudo ufw status`), abre los puertos:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 10000/tcp
sudo ufw allow 10002/tcp
```

---

## Detener todo

```bash
pkill -f app.jar
sudo systemctl stop nginx                                         # opción A
cd ~/ajedrez/deploy/release && nginx -p "$PWD" -c "$PWD/nginx.conf" -s stop   # opción B
```

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| Sale "Welcome to nginx" | El sitio `default` sigue activo (paso 3A) |
| La página carga pero no conecta | `app.jar` no está corriendo, o el puerto 10002 está bloqueado |
| `UnsupportedClassVersionError` al correr el jar | Java del Linux es menor que 17 |
| `403 Forbidden` | nginx no puede leer la carpeta: `chmod -R o+rX ~/ajedrez/deploy/release/dist` y `chmod o+x ~ ~/ajedrez ~/ajedrez/deploy ~/ajedrez/deploy/release` |
| `Address already in use` | Ya hay otro `app.jar` corriendo: `pkill -f app.jar` |

---

## Regenerar `deploy/release/` (si cambia el código)

En Windows, desde la raíz del proyecto:

```bash
.\gradlew.bat :server:fatJar
cd client-js
npm run build
cd ..
```

Luego reemplaza `deploy/release/app.jar` por `server/build/libs/app.jar` y `deploy/release/dist/` por `client-js/dist/`, y haz commit.
