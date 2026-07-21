// Catálogo curado: lo más destacado de cada categoría y de cada gama.
// "query" es lo que la app busca automáticamente en las tiendas.
// "starter: true" marca los productos del pack inicial de un clic.
// "rank" es un índice de rendimiento/calidad (0-100) usado por el motor de
//   recomendaciones para proponer productos que superen a los que ya sigues.
// Este archivo es el catálogo incorporado (respaldo). La app intenta además
// cargar una versión actualizada desde el repositorio (catalog.json), de modo
// que se pueden añadir novedades sin reinstalar.
window.CATALOG = [
  // --- Tarjetas gráficas ---
  { id: 'gpu-5090', label: 'NVIDIA GeForce RTX 5090', category: 'gpu', query: 'GeForce RTX 5090 32GB', rank: 100, starter: true },
  { id: 'gpu-5080', label: 'NVIDIA GeForce RTX 5080', category: 'gpu', query: 'GeForce RTX 5080 16GB', rank: 82 },
  { id: 'gpu-5070ti', label: 'NVIDIA GeForce RTX 5070 Ti', category: 'gpu', query: 'GeForce RTX 5070 Ti 16GB', rank: 72, starter: true },
  { id: 'gpu-5070', label: 'NVIDIA GeForce RTX 5070', category: 'gpu', query: 'GeForce RTX 5070 12GB', rank: 62 },
  { id: 'gpu-5060ti', label: 'NVIDIA GeForce RTX 5060 Ti', category: 'gpu', query: 'GeForce RTX 5060 Ti 16GB', rank: 52 },
  { id: 'gpu-5060', label: 'NVIDIA GeForce RTX 5060', category: 'gpu', query: 'GeForce RTX 5060 8GB', rank: 45, starter: true },
  { id: 'gpu-9070xt', label: 'AMD Radeon RX 9070 XT', category: 'gpu', query: 'Radeon RX 9070 XT 16GB', rank: 74 },
  { id: 'gpu-9060xt', label: 'AMD Radeon RX 9060 XT', category: 'gpu', query: 'Radeon RX 9060 XT', rank: 55 },
  { id: 'gpu-b580', label: 'Intel Arc B580', category: 'gpu', query: 'Intel Arc B580 12GB', rank: 42 },

  // --- Procesadores ---
  { id: 'cpu-9800x3d', label: 'AMD Ryzen 7 9800X3D', category: 'cpu', query: 'AMD Ryzen 7 9800X3D', rank: 92, starter: true },
  { id: 'cpu-9950x3d', label: 'AMD Ryzen 9 9950X3D', category: 'cpu', query: 'AMD Ryzen 9 9950X3D', rank: 100 },
  { id: 'cpu-7800x3d', label: 'AMD Ryzen 7 7800X3D', category: 'cpu', query: 'AMD Ryzen 7 7800X3D', rank: 82 },
  { id: 'cpu-9700x', label: 'AMD Ryzen 7 9700X', category: 'cpu', query: 'AMD Ryzen 7 9700X', rank: 70 },
  { id: 'cpu-9600x', label: 'AMD Ryzen 5 9600X', category: 'cpu', query: 'AMD Ryzen 5 9600X', rank: 60 },
  { id: 'cpu-7600', label: 'AMD Ryzen 5 7600', category: 'cpu', query: 'AMD Ryzen 5 7600', rank: 50 },
  { id: 'cpu-285k', label: 'Intel Core Ultra 9 285K', category: 'cpu', query: 'Intel Core Ultra 9 285K', rank: 88 },
  { id: 'cpu-265k', label: 'Intel Core Ultra 7 265K', category: 'cpu', query: 'Intel Core Ultra 7 265K', rank: 78 },
  { id: 'cpu-245k', label: 'Intel Core Ultra 5 245K', category: 'cpu', query: 'Intel Core Ultra 5 245K', rank: 66 },

  // --- Memoria RAM ---
  { id: 'ram-corsair32', label: 'Corsair Vengeance 32GB DDR5 6000MHz', category: 'ram', query: 'Corsair Vengeance DDR5 32GB 6000MHz CL30', rank: 70, starter: true },
  { id: 'ram-fury32', label: 'Kingston Fury Beast 32GB DDR5 6000MHz', category: 'ram', query: 'Kingston Fury Beast DDR5 32GB 6000MHz', rank: 68 },
  { id: 'ram-trident64', label: 'G.Skill Trident Z5 Neo 64GB DDR5', category: 'ram', query: 'G.Skill Trident Z5 Neo DDR5 64GB 6000MHz', rank: 85 },

  // --- Placas base ---
  { id: 'mobo-b650', label: 'MSI MAG B650 Tomahawk WiFi', category: 'mobo', query: 'MSI MAG B650 Tomahawk WiFi', rank: 60 },
  { id: 'mobo-b850', label: 'ASUS TUF Gaming B850-Plus WiFi', category: 'mobo', query: 'ASUS TUF Gaming B850-Plus WiFi', rank: 70 },
  { id: 'mobo-z890', label: 'Gigabyte Z890 Aorus Elite WiFi7', category: 'mobo', query: 'Gigabyte Z890 Aorus Elite WiFi7', rank: 85 },

  // --- Almacenamiento ---
  { id: 'ssd-990pro', label: 'Samsung 990 Pro 2TB NVMe', category: 'storage', query: 'Samsung 990 Pro 2TB NVMe', rank: 82, starter: true },
  { id: 'ssd-sn850x', label: 'WD Black SN850X 2TB NVMe', category: 'storage', query: 'WD Black SN850X 2TB NVMe', rank: 80 },
  { id: 'ssd-t500', label: 'Crucial T500 2TB NVMe', category: 'storage', query: 'Crucial T500 2TB NVMe', rank: 72 },
  { id: 'ssd-nv3', label: 'Kingston NV3 1TB NVMe', category: 'storage', query: 'Kingston NV3 1TB NVMe', rank: 50 },

  // --- Fuentes ---
  { id: 'psu-rm850e', label: 'Corsair RM850e 850W 80+ Gold', category: 'psu', query: 'Corsair RM850e 850W Gold', rank: 75 },
  { id: 'psu-a750gl', label: 'MSI MAG A750GL 750W 80+ Gold', category: 'psu', query: 'MSI MAG A750GL 750W Gold', rank: 65 },
  { id: 'psu-focusgx', label: 'Seasonic Focus GX-850 ATX 3.0', category: 'psu', query: 'Seasonic Focus GX-850 ATX 3.0', rank: 80 },

  // --- Cajas ---
  { id: 'case-4000d', label: 'Corsair 4000D Airflow', category: 'case', query: 'Corsair 4000D Airflow', rank: 70 },
  { id: 'case-o11', label: 'Lian Li O11 Dynamic Evo', category: 'case', query: 'Lian Li O11 Dynamic Evo', rank: 80 },
  { id: 'case-h5', label: 'NZXT H5 Flow', category: 'case', query: 'NZXT H5 Flow', rank: 65 },

  // --- Refrigeración ---
  { id: 'cool-lf3', label: 'Arctic Liquid Freezer III 360', category: 'cooling', query: 'Arctic Liquid Freezer III 360', rank: 90 },
  { id: 'cool-pa120', label: 'Thermalright Peerless Assassin 120 SE', category: 'cooling', query: 'Thermalright Peerless Assassin 120 SE', rank: 70 },
  { id: 'cool-kraken', label: 'NZXT Kraken Elite 240', category: 'cooling', query: 'NZXT Kraken Elite 240', rank: 82 },

  // --- Monitores ---
  { id: 'mon-27gp850', label: 'LG UltraGear 27" QHD 165Hz', category: 'monitor', query: 'LG UltraGear 27GP850 QHD', rank: 70 },
  { id: 'mon-274qrf', label: 'MSI MAG 274QRF QD 27" QHD 180Hz', category: 'monitor', query: 'MSI MAG 274QRF QD QHD 180Hz', rank: 80 },
  { id: 'mon-g5', label: 'Samsung Odyssey G5 27" QHD', category: 'monitor', query: 'Samsung Odyssey G5 27 QHD 165Hz', rank: 65 },

  // --- PCs Gaming completas por gama ---
  { id: 'pc-entry-1', label: 'PC Gaming gama entrada · Ryzen 5 + RTX 5060', category: 'fullpc', tier: 'entrada', query: 'PC gaming Ryzen 5 RTX 5060 16GB', rank: 40, starter: true },
  { id: 'pc-entry-2', label: 'PC Gaming gama entrada · Intel + RTX 5060', category: 'fullpc', tier: 'entrada', query: 'PC gaming Intel Core i5 RTX 5060', rank: 42 },
  { id: 'pc-mid-1', label: 'PC Gaming gama media · Ryzen 7 + RTX 5070', category: 'fullpc', tier: 'media', query: 'PC gaming Ryzen 7 RTX 5070 32GB', rank: 62, starter: true },
  { id: 'pc-mid-2', label: 'PC Gaming gama media · Ryzen 7 + RX 9070 XT', category: 'fullpc', tier: 'media', query: 'PC gaming Ryzen 7 Radeon RX 9070 XT', rank: 64 },
  { id: 'pc-high-1', label: 'PC Gaming gama alta · 9800X3D + RTX 5080', category: 'fullpc', tier: 'alta', query: 'PC gaming Ryzen 7 9800X3D RTX 5080', rank: 82, starter: true },
  { id: 'pc-enthusiast-1', label: 'PC Gaming entusiasta · Ryzen 9 + RTX 5090', category: 'fullpc', tier: 'entusiasta', query: 'PC gaming Ryzen 9 RTX 5090 64GB', rank: 100, starter: true }
];
