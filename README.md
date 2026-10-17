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
| `MONGODB_DB` | `TomaDeTiempos` (respeta las mayúsculas y conserva el valor de tu despliegue) |
| `ADMIN_PASSWORD` | tu contraseña de organizador |
| `SESSION_SECRET` | una frase larga y aleatoria, distinta de la contraseña |

3. **Deploy**. Vercel te da el enlace público para compartir.

Si cambias una variable después, hay que volver a desplegar (Deployments → ⋯ → Redeploy).

## Prueba antes del evento

1. Abre el enlace e inscribe a alguien de prueba con su PIN.
2. Cierra la pestaña, entra a **Mi inscripción** con ese nombre y PIN y cambia una prueba.
3. Entra a **Organizador**, anota un tiempo y mira que salga en **Resultados**.
4. Borra la inscripción de prueba.

## Excel por series (nuevo)

1. Entra a **Organizador → Tiempos → Descargar Excel por series**.
2. Recibirás un solo archivo `.xlsx`, con una pestaña para cada una de las diez pruebas. Los inscritos se ordenan por fecha de inscripción y se reparten en series de cuatro, carriles 1 a 4. El último grupo puede tener menos de cuatro nadadores. No hay siembra por tiempos, categoría ni sexo.
3. Puedes ajustar **Serie** y **Carril** dentro del archivo antes de imprimirlo o usarlo. No asignes dos nadadores al mismo carril de la misma serie. Las series son una organización del archivo; no cambian las inscripciones en la web.
4. Llena **Tiempo** como texto: `32.45`, `32,45` o `1:05.32`. Las celdas ya tienen formato Texto. No uses fórmulas, fechas ni formatos compactos como `3245`. El archivo incluye los tiempos que ya existen para que puedas corregirlos.
5. Dejar Tiempo y Acción vacíos **conserva el resultado existente**. Para borrar, vacía Tiempo y escribe `BORRAR` en Acción. Para registrar una ausencia, vacía Tiempo y elige `NO NADÓ`. Ese estado aparece en Resultados y en el CSV.
6. Guarda en formato `.xlsx`. En la web elige **Seleccionar archivo → Revisar archivo**. Se muestra cada cambio con el valor actual y el propuesto, más errores y avisos. Todavía no se escribe nada en la base.
7. Corrige todos los errores antes de confirmar. Si vuelves a editar el Excel, guárdalo y usa **Cambiar archivo** para seleccionar la versión actualizada. La revisión conserva una copia de lo seleccionado, no observa los cambios del archivo en tu computadora.
8. Presiona **Confirmar y publicar**. Puedes subir avances parciales o repetir una carga sin duplicar resultados. Después de confirmar, verifica **Resultados**.

### Precauciones que resuelve la importación

- Cada fila tiene identificadores ocultos y firmados. Los nombres se editan en la web, no en Excel. Un nombre cambiado en Excel, un identificador alterado o una ordenación parcial que cambie nombres se rechazan. Si ordenas, selecciona siempre las filas completas, incluyendo las columnas ocultas; el filtro abarca todas las columnas.
- Una copia vieja no sobrescribe silenciosamente resultados que cambiaron después de descargarla. Las filas intactas se omiten y los conflictos se muestran como errores. Para una nueva corrección después de publicar, descarga un Excel actualizado. El mismo archivo sigue sirviendo para cargar las filas que aún están pendientes.
- Las filas duplicadas, carriles repetidos, formatos inválidos y tiempos para nadadores retirados o pruebas que ya no nadan bloquean todo el lote. Nadadores nuevos que no aparecen generan un aviso y sus datos se conservan.
- Puedes cargar solo algunas pestañas si conservan su estructura original. No agregues columnas, encabezados, hojas de notas ni filas manuales. Para incluir un nuevo nadador, inscríbelo en la web y descarga otro archivo.
- Se permiten archivos de hasta **2 MB**, diez hojas y 1.000 filas de nadadores por hoja. Los archivos cifrados, macros, vínculos externos, objetos incrustados y contenidos descomprimidos excesivos se rechazan.
- Las revisiones vencen a los **15 minutos** y se comprueban nuevamente al confirmar. El servidor usa una transacción de MongoDB para que un error no deje la mitad del lote guardada. Esto requiere MongoDB Atlas o un replica set, no un MongoDB local independiente.
- Si pierdes conexión al confirmar, el resultado puede haberse guardado. Vuelve a revisar el mismo archivo: los datos ya aplicados se omiten y no se duplican.
- Los archivos están vinculados al secreto de este despliegue. Si cambias `SESSION_SECRET` (o la contraseña cuando se usa como secreto), descarga archivos nuevos.

### Mantener las series durante el evento

Descarga cuando la lista esté lista y conserva el mismo archivo durante la jornada. Una nueva descarga se genera con la lista actual: si alguien se retira o se inscribe, las series pueden cambiar. Esta versión no cierra automáticamente las inscripciones ni almacena series en la base. Coordina el cierre con los participantes y revisa los avisos si trabajas con una lista anterior.

## Actualizar una web ya desplegada

Sube los archivos de esta carpeta al mismo repositorio conectado con Vercel. Incluye `package.json` y `package-lock.json`: agregan las bibliotecas para Excel. No subas `node_modules`, archivos `.env` ni el ZIP dentro del repositorio.

Conserva tus variables de entorno existentes, especialmente `MONGODB_DB=TomaDeTiempos`. No hacen falta variables nuevas ni borrar colecciones. Vercel instalará las dependencias y redesplegará. Si configuraste manualmente un Install Command, debe instalar las dependencias del `package.json` actualizado. `vercel.json` permite hasta 60 segundos para la función de Excel.

Después del despliegue haz primero una prueba con una inscripción de prueba: descarga, anota un tiempo, revisa, confirma y verifica Resultados. Comprueba también una segunda carga del mismo archivo, una corrección con un archivo nuevo y la opción NO NADÓ. Guarda una copia de tus resultados antes de una importación importante.

## Verificación del cambio

`npm install` y `npm test` ejecutan las pruebas automatizadas de generación, lectura e importación. Las pruebas usan una base simulada para validar los contratos y las rutas; no sustituyen una prueba contra tu Atlas real. Se verificó también la interfaz en navegador con datos ficticios y la generación/lectura de 10.000 filas (1.000 inscritos en diez pruebas). No se validó el guardado desde una instalación real de Microsoft Excel.

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
