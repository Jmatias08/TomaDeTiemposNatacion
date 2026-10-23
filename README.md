# Tiempos de Natación

Web para inscribir nadadores por prueba y anotar tiempos. Hecha para Vercel con MongoDB Atlas.

## Cómo funciona

Pruebas disponibles: **25, 50, 100 y 400 m libre; 25 y 50 m mariposa; 25 y 50 m dorso; 25 y 50 m pecho; 100 m combinado** (11 pruebas).

- **Inscribirse:** cada persona escribe su nombre y marca sus pruebas. No necesita cuenta ni clave.
- **Un nombre, una inscripción:** el mismo nombre no se puede inscribir dos veces (no importan mayúsculas ni tildes). Además, desde un mismo dispositivo solo se puede inscribir una persona.
- **Corregir o quitar una inscripción:** solo el organizador puede hacerlo. Si alguien se equivoca, debe comunicarse con él. La página muestra ese aviso al inscribirse y si intenta repetir un nombre.
- **Resultados:** públicos, se actualizan solos cada 8 segundos.
- **Organizador:** con tu contraseña entras a **Tiempos** para anotar y corregir tiempos. En **Inscripción** puedes editar, quitar o inscribir a cualquiera. Se conservan la descarga e importación por Excel.

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
| `MONGODB_DB` | `TomaDeTiempos` (respeta las mayúsculas y conserva el valor de tu despliegue) |
| `ADMIN_PASSWORD` | tu contraseña de organizador |
| `SESSION_SECRET` | una frase larga y aleatoria, distinta de la contraseña |

3. **Deploy**. Vercel te da el enlace público para compartir.

Si cambias una variable después, hay que volver a desplegar (Deployments → ⋯ → Redeploy).

## Prueba antes del evento

1. Abre el enlace e inscribe a alguien de prueba con su nombre y sus pruebas.
2. Verifica que el público no tenga botones para editar o quitar. Entra como organizador y corrige su inscripción desde **Inscripción**.
3. Entra a **Organizador**, anota un tiempo y mira que salga en **Resultados**.
4. Borra la inscripción de prueba.

## Cargar tiempos directamente

1. Entrá a **Organizador → Tiempos**.
2. Elegí la prueba. Se muestran sus inscritos por nombre, sin asignar series ni orden de salida.
3. Buscá al nadador y escribí su tiempo. La vista previa distingue minutos de segundos.
4. Presioná **Guardar** o **Enter**. El resultado guardado aparece en su tarjeta y en Resultados.
5. Podés cambiar de prueba y volver: los borradores se conservan en la pestaña y no se pierden al actualizar la lista. Si falla la conexión, no se confirma el guardado y podés volver a intentar.
6. Si no hay un tiempo registrado, queda **sin tiempo**. Para quitar uno existente, usá **Borrar resultado** y confirmá. Vaciar el campo nunca borra por sí solo un resultado.
7. El filtro **Solo pendientes** sirve para encontrar a quienes todavía no tienen resultado.

Formatos de entrada:
- `32.5` o `32,5` = 32.50 segundos.
- `100.00` = 1:00.00, un minuto.
- `105.32` = 1:05.32.
- `1:05.32` también funciona.
- En el formato compacto, las últimas dos cifras antes del punto son segundos. `160.00` es inválido porque tiene 60 segundos; usá `200.00` para dos minutos.
- Un tiempo debe ser mayor que cero y menor de una hora.

## Descargar Excel

Solo hay descarga: **Descargar Excel** genera una hoja por prueba con inscritos, tiempos y estados actuales. El archivo incluye grupos de **tres** como referencia para imprimir; no impone un orden de nado en la página. No se acepta subir archivos y el servidor rechaza la antigua ruta de importación.

Las pruebas vigentes son las once indicadas arriba. Los identificadores de dorso conservan la palabra interna `espalda` para mantener asociados los datos existentes. No se reasignan registros de distancias anteriores.

## Punto de regreso

Antes de este rediseño se guardó una copia completa del código en **natacion-base-2026-10-22.zip**. El archivo se entregó en esta conversación; conservá una copia. Para volver, extraelo en una carpeta aparte y restaurá el código del proyecto desde allí. No hace falta modificar la base de datos para cambiar de versión. El respaldo de código no revierte ni contiene los tiempos de MongoDB.

## Actualizar Vercel

Subí los cambios al mismo repositorio conectado a Vercel. Incluí el archivo nuevo `public/capture.js`, `package.json` y `package-lock.json`. No hacen falta variables nuevas: conservá `MONGODB_DB=TomaDeTiempos` y las demás variables existentes.

## Verificación

`npm test` comprueba la descarga de Excel, los permisos de inscripción, el guardado directo y la interpretación de minutos y segundos con datos simulados. Antes del evento comprobá un guardado en tu despliegue real. No se accedió a Atlas para este rediseño.

## Probar en tu computadora (opcional)

```bash
cp .env.example .env.local   # y llena los valores
npm install
npx vercel dev
```

## Seguridad

- La contraseña de organizador y la conexión a la base de datos viven solo en el servidor (variables de entorno), nunca en la página.
- No hay acceso de nadadores. El servidor rechaza toda modificación o baja sin una sesión válida de organizador, incluso si alguien conserva un acceso de la versión anterior.
- La contraseña de organizador tiene un freno básico tras cinco intentos fallidos (1 minuto).
- La sesión de organizador dura 12 horas y se borra al cerrar la pestaña.
- El CSV exportado neutraliza nombres que empiecen con `=`, `+`, `-` o `@` para que Excel no los ejecute como fórmulas.
- No subas `.env.local` a GitHub (ya está en `.gitignore`).

## Límites

- Las inscripciones siguen abiertas al público: el nombre no demuestra la identidad de quien lo escribe. Si alguien registra un nombre ajeno, el organizador debe resolverlo.
- «Una persona por dispositivo» es una ayuda, no un candado: quien use otro teléfono o borre los datos del navegador puede inscribirse otra vez (con otro nombre). Revisa la lista si te importa.
