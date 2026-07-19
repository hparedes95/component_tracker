# ⚡ PC Price Tracker

Aplicación de escritorio para **rastrear precios de componentes de PC y PCs gaming completas** en tiempo real. Añades la URL del producto en tu tienda favorita, la app detecta el precio automáticamente y lo **actualiza cada día**, guardando el historial completo con gráficas y alertas de precio objetivo.

![Electron](https://img.shields.io/badge/Electron-app%20de%20escritorio-7c6cf0) ![Plataformas](https://img.shields.io/badge/Windows%20%7C%20Linux%20%7C%20macOS-multiplataforma-5a8bf0)

## ✨ Características

- **Catálogo top integrado**: ~45 productos destacados (RTX 5090/5080/5070, Ryzen 9800X3D, SSDs, RAM...) y PCs gaming por gama, listos para seguir con un clic — la app localiza sola el producto en las tiendas, sin pegar enlaces. Incluye un botón "⭐ Añadir selección top" que puebla la app automáticamente.
- **Rastrea cualquier componente**: procesadores, gráficas, RAM, placas base, almacenamiento, fuentes, cajas, refrigeración, monitores y periféricos.
- **PCs gaming completas** por niveles: gama de entrada, media, alta y entusiasta.
- **Compara varias tiendas** para el mismo producto: añade varias URLs y la app te muestra siempre el mejor precio.
- **Actualización automática diaria** mientras la app está abierta, y también al abrirla si los datos tienen más de 12 horas. Botón de actualización manual cuando quieras.
- **Historial de precios con gráficas** interactivas y mini-gráficas en cada tarjeta.
- **Alertas de precio objetivo**: recibe una notificación de escritorio cuando el producto baje del precio que tú marques.
- **Funciona con la mayoría de tiendas**: PcComponentes, Coolmod, Neobyte, Izarmicro, LDLC, Newegg, MediaMarkt y, en general, cualquier tienda moderna (detecta el precio mediante datos estructurados schema.org, metaetiquetas y patrones comunes).
- **Interfaz oscura, moderna y en español**, con buscador y filtros por categoría.
- **Tus datos son tuyos**: todo se guarda en local, sin cuentas ni servidores.

## 📥 Instalación (usuarios)

1. Ve a la sección [**Releases**](../../releases) de este repositorio.
2. Descarga el instalador de tu sistema:
   - **Windows**: `PC-Price-Tracker-Setup-x.x.x.exe`
   - **Linux**: `.AppImage` (ejecutable directo) o `.deb`
   - **macOS**: `.dmg`
3. Instálalo y ábrelo. ¡Listo! No necesita configuración.

> **Nota (Windows)**: al ser un instalador sin firma digital, SmartScreen puede mostrar un aviso. Pulsa "Más información" → "Ejecutar de todas formas".

## 🚀 Cómo se usa

1. Pulsa **"+ Añadir producto"**.
2. Ponle nombre, elige la categoría (o *PCs Gaming completas* + nivel) y, si quieres, un **precio objetivo**.
3. Pega la **URL del producto** de la tienda (puedes pegar varias, una por línea, para comparar tiendas).
4. La app obtiene el precio al momento y lo revisa cada día automáticamente.
5. Haz clic en cualquier tarjeta para ver la **gráfica de historial** y los precios por tienda.

## 🛠️ Desarrollo

```bash
npm install          # instala dependencias
npm test             # tests del extractor de precios
node scripts/make-icon.js   # genera los iconos
npm start            # arranca la app en modo desarrollo
npm run dist         # genera el instalador para tu sistema
```

### Publicar una nueva versión

Crea y sube un tag `v*` y GitHub Actions construye e adjunta automáticamente los instaladores de Windows, Linux y macOS a la Release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## 📁 Estructura

```
main.js                  # Proceso principal de Electron (ventana, IPC, actualización diaria)
preload.js               # Puente seguro renderer <-> main
src/pricefetcher.js      # Extractor de precios (JSON-LD, meta tags, microdatos, patrones)
src/renderer/            # Interfaz (HTML/CSS/JS)
scripts/make-icon.js     # Generador de iconos sin dependencias
test/parser.test.js      # Tests del extractor
.github/workflows/       # Build automático de instaladores en cada tag
```

## ⚖️ Aviso

Esta app consulta las páginas públicas de producto que tú añades, con una petición al día por tienda (como abrir la página en el navegador). Úsala de forma responsable y respeta los términos de servicio de cada tienda.
