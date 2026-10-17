# Tiempos de Natación

Web para inscribir nadadores por prueba y anotar tiempos. Hecha para Vercel con MongoDB Atlas.

## Cómo funciona

- **Inscribirse:** cada persona escribe su nombre, elige un **PIN de 4 números** y marca sus pruebas. No necesita cuenta.
- **Un nombre, una inscripción:** el mismo nombre no se puede inscribir dos veces (no importan mayúsculas ni tildes). Además, desde un mismo dispositivo solo se puede inscribir una persona.
- **Editar o quitarse:** en **Mi inscripción** se entra con nombre + PIN, desde cualquier dispositivo. Cada quien solo puede tocar la suya.
- **Resultados:** públicos, se actualizan solos cada 8 segundos.
- **Organizador:** con tu contraseña entras a **Tiempos** para anotar y corregir tiempos, y puedes editar, quitar o inscribir a cualquiera (también ponerle o cambiarle el PIN si lo olvidó).

## 1. Base de datos (MongoDB Atlas, plan gratis)

1. Crea una cuenta en https://www.mongodb.com/cloud/atlas y un clúster gratis (**M0**).
2. **Database Access** → *Add New Database User* → usuario y contraseña (guárdala; evita símbolos raros como `@` o `/`).
3. **Network Access** → *Add IP Address* → **Allow access from anywhere** (`0.0.0.0/0`). Vercel usa direcciones que cambian.
4. **Database → Connect → Drivers** → copia la cadena `mongodb+srv://...` y reemplaza `<password>` por la contraseña del usuario.

Las colecciones (`swimmers`, `times`) y sus índices se crean solos.

## 2. Subir a GitHub

```bash
git init
git add .
git commit -m "Tiempos de natación"
# crea un repositorio vacío en GitHub y sigue sus instrucciones: git remote add origin ... && git push -u origin main
```

## 3. Desplegar en Vercel

1. En https://vercel.com → **Add New → Project** → importa el repositorio.
2. En **Environment Variables** agrega:

| Variable | Valor |
|---|---|
| `MONGODB_URI` | la cadena de Atlas del paso 1 |
| `MONGODB_DB` | `natacion` (o el nombre que quieras) |
| `ADMIN_PASSWORD` | tu contraseña de organizador |
| `SESSION_SECRET` | una frase larga y aleatoria, distinta de la contraseña |

3. **Deploy**. Vercel te da el enlace público para compartir.

Si cambias una variable después, hay que volver a desplegar (Deployments → ⋯ → Redeploy).

## Prueba antes del evento

1. Abre el enlace e inscribe a alguien de prueba con su PIN.
2. Cierra la pestaña, entra a **Mi inscripción** con ese nombre y PIN y cambia una prueba.
3. Entra a **Organizador**, anota un tiempo y mira que salga en **Resultados**.
4. Borra la inscripción de prueba.

## Probar en tu computadora (opcional)

```bash
cp .env.example .env.local   # y llena los valores
npm install
npx vercel dev
```

## Seguridad

- La contraseña de organizador y la conexión a la base de datos viven solo en el servidor (variables de entorno), nunca en la página.
- Los PIN se guardan cifrados (scrypt). La lista pública nunca los incluye.
- Tras 5 PIN incorrectos seguidos, ese nombre queda bloqueado 5 minutos. La contraseña de organizador tiene un freno parecido (1 minuto).
- Las sesiones duran 12 horas y se borran al cerrar la pestaña.
- El CSV exportado neutraliza nombres que empiecen con `=`, `+`, `-` o `@` para que Excel no los ejecute como fórmulas.
- No subas `.env.local` a GitHub (ya está en `.gitignore`).

## Límites

- Un PIN de 4 números es cómodo, no una cerradura fuerte: el bloqueo por intentos evita que lo adivinen, pero no es protección bancaria. Para esto es suficiente.
- «Una persona por dispositivo» es una ayuda, no un candado: quien use otro teléfono o borre los datos del navegador puede inscribirse otra vez (con otro nombre). Revisa la lista si te importa.
