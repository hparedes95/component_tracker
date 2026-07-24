# 👀 Ver la app en tiempo real (sin instalar el .exe)

Puedes ejecutar la app directamente desde el código, igual que en VSCode, y ver
los cambios al momento — sin generar ni instalar ningún instalador.

## 1. Instalar lo necesario (solo la primera vez)

1. **Node.js** (incluye `npm`): descárgalo de <https://nodejs.org> — botón **LTS** —
   e instálalo con las opciones por defecto.
2. **VSCode** (opcional pero recomendado): <https://code.visualstudio.com>
3. **Git** (opcional): <https://git-scm.com/downloads>. Si no quieres usar Git,
   puedes descargar el código como ZIP (ver más abajo).

## 2. Conseguir el código

**Opción A — con Git (recomendada, permite actualizar con un comando):**
```bash
git clone https://github.com/hparedes95/component_tracker
```

**Opción B — sin Git (ZIP):** en la página del repositorio, botón verde
**Code → Download ZIP**, y descomprime la carpeta.

## 3. Abrir y arrancar

1. Abre **VSCode** → *Archivo → Abrir carpeta* → elige la carpeta del proyecto.
2. Abre la terminal integrada: menú *Terminal → Nueva terminal*.
3. Instala las dependencias (solo la primera vez):
   ```bash
   npm install
   ```
4. Arranca la app:
   ```bash
   npm start
   ```
   Se abrirá la aplicación real (la misma que el .exe, con precios reales).

## 4. Ver los cambios al instante

- Mientras `npm start` está en marcha, **la ventana se recarga sola** cuando
  cambian los archivos de la interfaz (modo desarrollo).
- Para traer los cambios que yo haya subido:
  ```bash
  git pull
  ```
  (o vuelve a descargar el ZIP). La app se refresca sola con lo nuevo.
- Si cambian `main.js` o `preload.js` (el "motor"), cierra la ventana y vuelve a
  ejecutar `npm start`.
- También puedes recargar manualmente la ventana con **Ctrl + R**, o abrir las
  herramientas de desarrollo con **Ctrl + Shift + I**.

## Resumen del día a día

```bash
git pull        # traer los últimos cambios
npm start       # abrir la app (si no la tienes ya abierta)
```

Así revisas todo en el momento y solo generas el `.exe` cuando quieras la
versión final para usar sin depender del código.
