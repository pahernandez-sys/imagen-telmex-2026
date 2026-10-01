// State Variables
let catalog = [];
let selectedAsset = null;
let currentGpsCoords = null;
let photoAntesBase64 = "";
let photoDespuesBase64 = "";
let dbEvidences = [];
let completedAssetIdsSet = new Set();
let selectedModelFilter = "";
let forceOfflineState = false;
let lastKnownOnlineState = null;
let pendingAsset = null;
let modalSelectedType = "CASETA";
let modalSelectedModel = "";

// Catálogo Visual de Modelos para Casetas y Cajas
const CASETA_MODELS = [
  { id: "NORMAL", title: "Normal", img: "assets/types/caseta_normal.jpg" },
  { id: "MINI", title: "Mini", img: "assets/types/caseta_mini.jpg" },
  { id: "DOBLE", title: "Doble", img: "assets/types/caseta_doble.jpg" },
  { id: "SEMICIRCULAR", title: "Semicircular", img: "assets/types/caseta_semicircular.jpg" }
];

const CAJA_MODELS = [
  { id: "Tradicional Sencilla", title: "Tradicional Sencilla", img: "assets/types/caja_tradicional_sencilla.jpg" },
  { id: "Tradicional Doble", title: "Tradicional Doble", img: "assets/types/caja_tradicional_doble.jpg" },
  { id: "Siecor Sencilla 1 Puerta", title: "Siecor 1 Puerta", img: "assets/types/caja_siecor_1p.jpg" },
  { id: "Siecor Doble", title: "Siecor Doble", img: "assets/types/caja_siecor_doble.jpg" },
  { id: "Siecor Sencilla 2 Puertas", title: "Siecor 2 Puertas", img: "assets/types/caja_siecor_2p.jpg" },
  { id: "Krone Sencilla", title: "Krone Sencilla", img: "assets/types/caja_krone.jpg" },
  { id: "Desplazamiento Sencilla", title: "Desplazamiento Sencilla", img: "assets/types/caja_desplazamiento_sencilla.jpg" },
  { id: "Desplazamiento Doble", title: "Desplazamiento Doble", img: "assets/types/caja_desplazamiento_doble.jpg" },
  { id: "Envolvente Sencilla", title: "Envolvente Sencilla", img: "assets/types/caja_envolvente_sencilla.jpg" },
  { id: "Envolvente Doble", title: "Envolvente Doble", img: "assets/types/caja_envolvente_doble.jpg" }
];

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
  initApp();
  initGeolocation();
});

let isCheckingNetwork = false;
let customAlertCallback = null;

function showCustomAlert(message, title = "Imagen Telmex 2026", callback = null) {
  customAlertCallback = callback;
  const modal = document.getElementById("customAlertModal");
  const msgEl = document.getElementById("customAlertMessage");
  const titleEl = document.getElementById("customAlertHeader");

  if (modal && msgEl) {
    if (titleEl) titleEl.innerHTML = `<span>${title}</span>`;
    msgEl.innerHTML = String(message).replace(/\n/g, "<br>");
    modal.style.display = "flex";
  } else {
    alert(message);
    if (callback) callback();
  }
}

function closeCustomAlert() {
  const modal = document.getElementById("customAlertModal");
  if (modal) modal.style.display = "none";
  if (customAlertCallback) {
    const cb = customAlertCallback;
    customAlertCallback = null;
    cb();
  }
}

// Override global alert to eliminate native browser/WebView "La página file:// indica:"
window.alert = function(msg) {
  showCustomAlert(msg);
};

function initApp() {
  loadEvidencesFromStorage();
  updateDailyGoalUI();
  
  checkNetworkConnectivity();
  
  window.addEventListener("online", () => checkNetworkConnectivity());
  window.addEventListener("offline", () => updateNetworkUI(false));
  setInterval(() => checkNetworkConnectivity(), 3000);

  fetchCatalogData();
}

function fetchCatalogData() {
  const badge = document.getElementById("catalogCountBadge");
  if (badge) badge.innerText = "⏳ Cargando base de datos...";

  const globalData = window.CATALOG_DATA || window.catalog;
  if (globalData && Array.isArray(globalData) && globalData.length > 0) {
    catalog = globalData;
    onCatalogLoaded();
    return;
  }

  // 1. Intentar cargar las partes divididas (catalog_part1.js y catalog_part2.js)
  loadCatalogViaParts()
    .then(() => {
      if (window.CATALOG_DATA && Array.isArray(window.CATALOG_DATA) && window.CATALOG_DATA.length > 0) {
        catalog = window.CATALOG_DATA;
        onCatalogLoaded();
      } else {
        throw new Error("Formato de partes inválido");
      }
    })
    .catch(partsErr => {
      console.warn("Carga de partes falló, intentando XHR/Fetch:", partsErr);
      // 2. Intentar XHR catalog_clean.json
      loadCatalogViaXHR()
        .then(data => {
          catalog = data;
          window.CATALOG_DATA = data;
          onCatalogLoaded();
        })
        .catch(xhrErr => {
          console.warn("Carga XHR falló, intentando script catalog_data.js:", xhrErr);
          // 3. Último fallback: Script Tag único
          loadCatalogViaScript();
        });
    });
}

function loadCatalogViaParts() {
  return new Promise((resolve, reject) => {
    const scripts = ["data/catalog_part1.js", "data/catalog_part2.js"];
    let loadedCount = 0;

    function loadNext(index) {
      if (index >= scripts.length) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = scripts[index];
      script.onload = () => loadNext(index + 1);
      script.onerror = (e) => reject(e);
      document.body.appendChild(script);
    }

    loadNext(0);
  });
}

function loadCatalogViaXHR() {
  return new Promise((resolve, reject) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", "data/catalog_clean.json", true);
      xhr.onload = function() {
        if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText && xhr.responseText.length > 0) {
          try {
            const data = JSON.parse(xhr.responseText);
            if (Array.isArray(data) && data.length > 0) {
              resolve(data);
            } else {
              reject(new Error("Catálogo vacío o formato no válido"));
            }
          } catch(e) {
            reject(e);
          }
        } else {
          reject(new Error("Respuesta XHR con status " + xhr.status));
        }
      };
      xhr.onerror = function(e) {
        reject(new Error("Error de red XHR"));
      };
      xhr.send();
    } catch(err) {
      reject(err);
    }
  });
}

function loadCatalogViaScript() {
  const script = document.createElement("script");
  script.src = "data/catalog_data.js";
  script.onload = () => {
    if (window.CATALOG_DATA && Array.isArray(window.CATALOG_DATA)) {
      catalog = window.CATALOG_DATA;
      onCatalogLoaded();
    } else {
      const badge = document.getElementById("catalogCountBadge");
      if (badge) badge.innerText = "Error al cargar catálogo";
    }
  };
  script.onerror = () => {
    const badge = document.getElementById("catalogCountBadge");
    if (badge) badge.innerText = "Error al cargar catálogo";
  };
  document.body.appendChild(script);
}

function onCatalogLoaded() {
  const badge = document.getElementById("catalogCountBadge");
  if (badge) badge.innerText = `${catalog.length.toLocaleString()} registros`;
  applyHierarchyFilter();
}

function checkNetworkConnectivity() {
  if (isCheckingNetwork) return;
  isCheckingNetwork = true;

  if (!navigator.onLine) {
    isCheckingNetwork = false;
    updateNetworkUI(false);
    return;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2500);

  fetch("https://app.linkaform.com/favicon.ico?_=" + Date.now(), {
    method: "HEAD",
    mode: "no-cors",
    cache: "no-store",
    signal: controller.signal
  })
  .then(() => {
    clearTimeout(timeoutId);
    isCheckingNetwork = false;
    forceOfflineState = false; // Restablecer estado cuando hay red activa
    updateNetworkUI(true);
  })
  .catch(() => {
    clearTimeout(timeoutId);
    isCheckingNetwork = false;
    updateNetworkUI(false);
  });
}

function updateOfflineStatus(forceOffline) {
  if (forceOffline !== undefined) {
    forceOfflineState = Boolean(forceOffline);
  }

  if (forceOfflineState) {
    updateNetworkUI(false);
  } else {
    checkNetworkConnectivity();
  }
}

function updateNetworkUI(isCurrentlyOnline) {
  const badge = document.getElementById("networkStatus");

  if (badge) {
    if (isCurrentlyOnline) {
      badge.innerText = "Conectado";
      badge.classList.remove("offline");
    } else {
      badge.innerText = "Modo Offline";
      badge.classList.add("offline");
    }
  }

  // Notificar al usuario automáticamente si hubo un cambio de estado en la red
  if (lastKnownOnlineState !== null && lastKnownOnlineState !== isCurrentlyOnline) {
    showNetworkToast(isCurrentlyOnline);
  }
  lastKnownOnlineState = isCurrentlyOnline;
}

function showNetworkToast(isOnline) {
  let toast = document.getElementById("networkToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "networkToast";
    toast.className = "network-toast";
    document.body.appendChild(toast);
  }

  if (isOnline) {
    toast.className = "network-toast online";
    toast.innerText = "🟢 Conexión a internet restablecida (En línea)";
  } else {
    toast.className = "network-toast offline";
    toast.innerText = "🔴 Se perdió la conexión a internet (Modo Offline)";
  }

  toast.style.display = "block";
  toast.style.opacity = "1";

  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => {
      toast.style.display = "none";
    }, 350);
  }, 3000);
}

// ---------------------------------------------------------
// VISTA Y NAVEGACIÓN
// ---------------------------------------------------------
function switchView(viewName) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  if (viewName === 'search') {
    document.getElementById("viewSearch").classList.add("active");
    document.querySelectorAll(".nav-item")[0].classList.add("active");
  } else if (viewName === 'form') {
    if (!selectedAsset) {
      alert("Por favor selecciona primero una caja o caseta en la pestaña de Búsqueda.");
      switchView('search');
      return;
    }
    if (!selectedModelFilter) {
      alert("⚠️ Error: Debes seleccionar y confirmar un modelo de Caseta o Caja en el modal antes de ir a Evidencia.");
      switchView('search');
      return;
    }
    document.getElementById("viewForm").classList.add("active");
    document.querySelectorAll(".nav-item")[1].classList.add("active");
  } else if (viewName === 'sync') {
    document.getElementById("viewSync").classList.add("active");
    document.querySelectorAll(".nav-item")[2].classList.add("active");
    renderSavedEvidences();
  }
}

function switchSearchMode(mode) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".search-mode-content").forEach(c => c.style.display = "none");

  if (mode === 'gps') {
    document.querySelectorAll(".tab-btn")[0].classList.add("active");
    document.getElementById("modeGps").style.display = "block";
  } else if (mode === 'filter') {
    document.querySelectorAll(".tab-btn")[1].classList.add("active");
    document.getElementById("modeFilter").style.display = "block";
  } else if (mode === 'direct') {
    document.querySelectorAll(".tab-btn")[2].classList.add("active");
    document.getElementById("modeDirect").style.display = "block";
  }
}

// ---------------------------------------------------------
// ALGORITMO HAVERSINE (DISTANCIA EN METROS)
// ---------------------------------------------------------
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // metros
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------------------------------------------------------
// GENERADOR DE ID ÚNICA (CAS_AGU_0001 / CAJ_AGU_0001)
// ---------------------------------------------------------
function generateUniqueId(tipo, areaTrabajo) {
  const prefix = (tipo === "CAJA") ? "CAJ" : "CAS";
  let cleanArea = (areaTrabajo || "GEN")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z]/gi, "")
    .toUpperCase();
  
  if (cleanArea.length < 3) {
    cleanArea = (cleanArea + "XXX").substring(0, 3);
  } else {
    cleanArea = cleanArea.substring(0, 3);
  }

  const matchPattern = `${prefix}_${cleanArea}_`;
  let maxSeq = 0;

  dbEvidences.forEach(ev => {
    const uid = ev.unique_id || "";
    if (uid.startsWith(matchPattern)) {
      const parts = uid.split("_");
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });

  const nextSeq = String(maxSeq + 1).padStart(4, "0");
  return `${prefix}_${cleanArea}_${nextSeq}`;
}

// ---------------------------------------------------------
// BÚSQUEDA POR GPS (PROXIMIDAD)
// ---------------------------------------------------------
function locateTechnician() {
  const statusDiv = document.getElementById("gpsStatusText");
  statusDiv.innerText = "Obteniendo coordenadas GPS del teléfono...";

  if (!navigator.geolocation) {
    statusDiv.innerText = "El navegador no soporta Geolocalización.";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      currentGpsCoords = { lat, lon, accuracy: pos.coords.accuracy };
      
      statusDiv.innerText = `GPS OK: (${lat.toFixed(5)}, ${lon.toFixed(5)}) ±${Math.round(pos.coords.accuracy)}m`;
      updateFormGpsDisplay();

      const completedAssetIds = getCompletedAssetIdsSet();

      // Calcular distancia Haversine a todos los registros del catálogo no completados
      const results = [];
      for (let i = 0; i < catalog.length; i++) {
        const item = catalog[i];
        if (completedAssetIds.has(String(item.id)) || (item.unique_id && completedAssetIds.has(String(item.unique_id)))) continue;
        if (item.lat && item.lon) {
          const dist = haversineDistance(lat, lon, item.lat, item.lon);
          results.push({ ...item, dist_m: dist });
        }
      }

      // Ordenar de la más cercana a la más lejana y tomar ÚNICAMENTE las 35 más cercanas
      results.sort((a, b) => a.dist_m - b.dist_m);
      const topNearby = results.slice(0, 35);

      renderSearchResults(topNearby, true, getCompletedAssetCount());
    },
    (err) => {
      statusDiv.innerText = `Error al obtener GPS: ${err.message}. Verifica que la ubicación esté encendida.`;
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );
}

function initGeolocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentGpsCoords = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
        updateFormGpsDisplay();
        applyHierarchyFilter();
      },
      (err) => console.log("GPS no disponible aún"),
      { enableHighAccuracy: true }
    );
  }
}

function updateFormGpsDisplay() {
  const el = document.getElementById("formGpsCoords");
  if (currentGpsCoords) {
    el.innerText = `Lat: ${currentGpsCoords.lat.toFixed(6)}, Lon: ${currentGpsCoords.lon.toFixed(6)} (Precisión: ±${Math.round(currentGpsCoords.accuracy)}m)`;
  } else {
    el.innerText = "Buscando señal GPS del teléfono...";
  }
}

// ---------------------------------------------------------
// FILTROS JERÁRQUICOS Y BÚSQUEDA DIRECTA
// ---------------------------------------------------------

function onElementTypeChange() {
  selectedModelFilter = "";
  applyHierarchyFilter();
}

function onSearchModeToggle() {
  const mode = document.querySelector('input[name="searchSelectionMode"]:checked')?.value || "AUTO";
  const container = document.getElementById("manualFilterContainer");
  const titleEl = document.getElementById("searchResultsTitle");

  if (mode === "MANUAL") {
    if (container) container.style.display = "block";
    if (titleEl) titleEl.innerText = "🔍 Activos Filtrados por Estado y Área";
    populateEstadosFilter();
  } else {
    if (container) container.style.display = "none";
    if (titleEl) titleEl.innerText = "📍 35 Opciones Más Cercanas a tu Ubicación";
  }

  applyHierarchyFilter();
}

function populateEstadosFilter() {
  const select = document.getElementById("filterEstado");
  if (!select) return;
  
  const currentVal = select.value;
  const estadosSet = new Set();
  catalog.forEach(item => {
    if (item.estado) estadosSet.add(item.estado);
  });

  select.innerHTML = '<option value="">-- Seleccionar Estado --</option>';
  Array.from(estadosSet).sort().forEach(est => {
    const opt = document.createElement("option");
    opt.value = est;
    opt.innerText = est;
    if (est === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function onEstadoChange() {
  const selectedEstado = document.getElementById("filterEstado")?.value || "";
  const areaSelect = document.getElementById("filterArea");
  if (!areaSelect) return;

  areaSelect.innerHTML = '<option value="">-- Seleccionar Área de Trabajo --</option>';

  if (selectedEstado) {
    const areasSet = new Set();
    catalog.filter(i => i.estado === selectedEstado).forEach(i => {
      if (i.area_trabajo) areasSet.add(i.area_trabajo);
    });
    Array.from(areasSet).sort().forEach(area => {
      const opt = document.createElement("option");
      opt.value = area;
      opt.innerText = area;
      areaSelect.appendChild(opt);
    });
  }

  applyHierarchyFilter();
}

function applyHierarchyFilter() {
  const mode = document.querySelector('input[name="searchSelectionMode"]:checked')?.value || "AUTO";
  const proceso = document.querySelector('input[name="filterProceso"]:checked')?.value || "IMAGEN";
  
  const isTodos = document.getElementById("elemento_todos")?.checked;
  const isCaseta = document.getElementById("elemento_caseta")?.checked;
  const tipoFilter = isTodos ? "TODOS" : (isCaseta ? "CASETA" : "CAJA");

  // Set de IDs ya capturados para evitar duplicados
  const completedAssetIds = getCompletedAssetIdsSet();

  let estadoVal = "";
  let areaVal = "";
  if (mode === "MANUAL") {
    estadoVal = document.getElementById("filterEstado")?.value || "";
    areaVal = document.getElementById("filterArea")?.value || "";

    if (!estadoVal && !areaVal) {
      document.getElementById("searchResultsList").innerHTML = 
        '<p style="text-align:center; color:var(--text-muted); padding:20px;">Por favor selecciona Estado y Área de Trabajo en los desplegables de arriba.</p>';
      document.getElementById("resultCount").innerText = '0 activos';
      return;
    }
  }

  let filtered = catalog.filter(item => {
    if (completedAssetIds.has(String(item.id)) || (item.unique_id && completedAssetIds.has(String(item.unique_id)))) return false; // Excluir activos ya capturados
    if (tipoFilter !== "TODOS" && item.tipo !== tipoFilter) return false;
    if (mode === "MANUAL") {
      if (estadoVal && item.estado !== estadoVal) return false;
      if (areaVal && item.area_trabajo !== areaVal) return false;
    }
    return true;
  });

  // Si se dispone de GPS del dispositivo, calcular distancia y ordenar por cercanía
  if (currentGpsCoords && currentGpsCoords.lat && currentGpsCoords.lon) {
    filtered = filtered.map(item => {
      let dist = 99999999;
      if (item.lat && item.lon) {
        dist = haversineDistance(currentGpsCoords.lat, currentGpsCoords.lon, item.lat, item.lon);
      }
      return { ...item, dist_m: dist };
    });

    filtered.sort((a, b) => a.dist_m - b.dist_m);
  }

  // Tomar las 35 más cercanas (o hasta 50 en búsqueda manual)
  const maxResults = (mode === "MANUAL" && (estadoVal || areaVal)) ? 50 : 35;
  renderSearchResults(filtered.slice(0, maxResults), Boolean(currentGpsCoords && currentGpsCoords.lat), getTodayCompletedCount());
}

function onQueryInput() {
  const q = document.getElementById("inputQuery").value.trim().toUpperCase();
  if (q.length < 2) {
    applyHierarchyFilter();
    return;
  }

  const completedAssetIds = getCompletedAssetIdsSet();

  let matches = catalog.filter(item => {
    if (completedAssetIds.has(String(item.id)) || (item.unique_id && completedAssetIds.has(String(item.unique_id)))) return false; // Excluir activos ya capturados
    return (item.id && item.id.toUpperCase().includes(q)) || 
           (item.calle && item.calle.toUpperCase().includes(q)) ||
           (item.municipio && item.municipio.toUpperCase().includes(q)) ||
           (item.area_trabajo && item.area_trabajo.toUpperCase().includes(q));
  });

  if (currentGpsCoords && currentGpsCoords.lat && currentGpsCoords.lon) {
    matches = matches.map(item => {
      let dist = 99999999;
      if (item.lat && item.lon) {
        dist = haversineDistance(currentGpsCoords.lat, currentGpsCoords.lon, item.lat, item.lon);
      }
      return { ...item, dist_m: dist };
    });
    matches.sort((a, b) => a.dist_m - b.dist_m);
  }

  renderSearchResults(matches.slice(0, 35), Boolean(currentGpsCoords && currentGpsCoords.lat), getTodayCompletedCount());
}

// ---------------------------------------------------------
// RENDERIZADO DE RESULTADOS DE BÚSQUEDA
// ---------------------------------------------------------
function renderSearchResults(items, isGpsSearch, completedCount = 0) {
  const listDiv = document.getElementById("searchResultsList");
  const countSpan = document.getElementById("resultCount");
  
  const completedBadge = completedCount > 0 ? ` (${completedCount} capturados hoy)` : '';
  countSpan.innerText = `${items.length} opciones más cercanas${completedBadge}`;
  listDiv.innerHTML = "";

  if (items.length === 0) {
    listDiv.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No se encontraron activos para los criterios seleccionados.</p>';
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = `asset-item ${selectedAsset && selectedAsset.id === item.id ? 'selected' : ''}`;
    
    let distBadge = '';
    if (item.dist_m && item.dist_m < 99999900) {
      const metersVal = Math.round(item.dist_m);
      const metersFormatted = metersVal.toLocaleString();
      const distLabel = metersVal >= 1000 
        ? `📍 A ${metersFormatted} m (${(item.dist_m / 1000).toFixed(1)} km)` 
        : `📍 A ${metersFormatted} metros`;
      distBadge = `<span class="asset-badge" style="background:#15803d; color:white; font-weight:bold; font-size:0.75rem; padding:3px 8px; border-radius:6px; margin-left:4px;">${distLabel}</span>`;
    }

    const badgeColor = item.tipo === 'CASETA' ? '#0055a5' : '#00a8cc';
    const displayModel = item.modelo_tipo || (item.tipo === 'CASETA' ? 'NORMAL' : 'Sencilla');

    card.innerHTML = `
      <div class="asset-header" style="align-items:center;">
        <span style="font-size:1rem; font-weight:bold; color:var(--primary);">${item.id}</span>
        <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; justify-content:flex-end;">
          <span class="asset-badge" style="background:${badgeColor}; color:white; font-weight:bold;">${item.tipo} (${displayModel})</span>
          ${distBadge}
        </div>
      </div>
      <div class="asset-detail" style="margin-top:6px; font-size:0.85rem; color:#334155;">
        📍 <strong>Estado:</strong> ${item.estado} | 🏢 <strong>Área:</strong> ${item.area_trabajo || item.municipio}
      </div>
      <div class="asset-detail" style="font-size:0.8rem; color:#64748b;">
        🛣️ Calle: ${item.calle || 'S/N'} ${item.colonia ? '| Colonia/Distrito: ' + item.colonia : ''}
      </div>
    `;

    card.onclick = () => selectAsset(item);
    listDiv.appendChild(card);
  });
}

function selectAsset(item) {
  pendingAsset = item;
  modalSelectedType = (item.tipo === "CAJA") ? "CAJA" : "CASETA";
  
  const isCaja = (modalSelectedType === "CAJA");
  const radioCaja = document.getElementById("modal_tipo_caja");
  const radioCaseta = document.getElementById("modal_tipo_caseta");
  if (isCaja && radioCaja) radioCaja.checked = true;
  if (!isCaja && radioCaseta) radioCaseta.checked = true;

  const models = isCaja ? CAJA_MODELS : CASETA_MODELS;
  if (item.modelo_tipo && models.some(m => m.id === item.modelo_tipo)) {
    modalSelectedModel = item.modelo_tipo;
  } else {
    modalSelectedModel = models[0].id;
  }

  const idEl = document.getElementById("modalAssetId");
  const infoEl = document.getElementById("modalAssetInfo");
  if (idEl) idEl.innerText = `Activo: ${item.id} (${modalSelectedType})`;
  if (infoEl) infoEl.innerText = `📍 Estado: ${item.estado || 'N/A'} | Área: ${item.area_trabajo || item.municipio || 'N/A'} | Calle: ${item.calle || 'S/N'}`;

  renderModalTypeGrid();

  const modal = document.getElementById("assetConfirmModal");
  if (modal) modal.style.display = "flex";
}

function closeAssetConfirmModal() {
  const modal = document.getElementById("assetConfirmModal");
  if (modal) modal.style.display = "none";
}

function onModalTypeChange() {
  const isCaja = document.getElementById("modal_tipo_caja")?.checked;
  modalSelectedType = isCaja ? "CAJA" : "CASETA";

  const models = isCaja ? CAJA_MODELS : CASETA_MODELS;
  if (!models.some(m => m.id === modalSelectedModel)) {
    modalSelectedModel = models[0].id;
  }

  if (pendingAsset) {
    const idEl = document.getElementById("modalAssetId");
    if (idEl) idEl.innerText = `Activo: ${pendingAsset.id} (${modalSelectedType})`;
  }

  renderModalTypeGrid();
}

function renderModalTypeGrid() {
  const isCaja = (modalSelectedType === "CAJA");
  const models = isCaja ? CAJA_MODELS : CASETA_MODELS;
  const grid = document.getElementById("modalTypeGrid");
  if (!grid) return;

  grid.innerHTML = "";
  models.forEach(m => {
    const card = document.createElement("div");
    const isSel = (modalSelectedModel === m.id);
    card.className = `type-card ${isSel ? 'selected' : ''}`;
    card.onclick = () => selectModalModelType(m.id);

    card.innerHTML = `
      <img src="${m.img}" class="type-card-img" alt="${m.title}" onerror="this.style.display='none'">
      <div class="type-card-title">${m.title}</div>
    `;
    grid.appendChild(card);
  });
}

function selectModalModelType(modelId) {
  modalSelectedModel = modelId;
  renderModalTypeGrid();
}

function confirmAssetSelection() {
  if (!pendingAsset) {
    alert("⚠️ Error: No hay ningún activo seleccionado.");
    closeAssetConfirmModal();
    return;
  }
  if (!modalSelectedModel) {
    alert("⚠️ Por favor selecciona un modelo en el muestrario visual.");
    return;
  }

  selectedAsset = { ...pendingAsset };
  selectedAsset.tipo = modalSelectedType;
  selectedAsset.modelo_tipo = modalSelectedModel;
  selectedModelFilter = modalSelectedModel;

  const proceso = document.querySelector('input[name="filterProceso"]:checked')?.value || "IMAGEN";
  const uniqueId = generateUniqueId(selectedAsset.tipo, selectedAsset.area_trabajo);
  selectedAsset.unique_id = uniqueId;

  // Actualizar alerta general de activo seleccionado
  document.getElementById("activeAssetAlert").style.display = "block";
  document.getElementById("activeAssetTitle").innerText = `${uniqueId} (Ref: ${selectedAsset.id}) [${proceso}] (${selectedAsset.tipo} - ${modalSelectedModel}) - ${selectedAsset.area_trabajo}, ${selectedAsset.estado}`;

  // Llenar campos del formulario automáticamente
  document.getElementById("formAssetId").value = `${uniqueId} (Ref: ${selectedAsset.id})`;
  document.getElementById("formAssetEstado").value = selectedAsset.estado || "DESCONOCIDO";
  document.getElementById("formAssetArea").value = selectedAsset.area_trabajo || selectedAsset.municipio || "GENERAL";
  document.getElementById("formAssetDetails").value = `Proceso: ${proceso} | Tipo: ${selectedAsset.tipo} | Modelo: ${modalSelectedModel}`;
  document.getElementById("formAssetInfo").value = `Colonia/Distrito: ${selectedAsset.colonia || selectedAsset.municipio || 'N/A'} | Calle: ${selectedAsset.calle || 'S/N'}`;

  if (selectedAsset.oferta_sugerida) {
    document.getElementById("ofertaColocada").value = selectedAsset.oferta_sugerida;
  }

  closeAssetConfirmModal();
  switchView('form');
}

// ---------------------------------------------------------
// COMPRESIÓN Y MANEJO DE FOTOGRAFÍAS (SOLO FOTO DESPUÉS)
// ---------------------------------------------------------
function handlePhotoSelect(event, type) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 1280;
      const MAX_HEIGHT = 1280;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.75);

      photoDespuesBase64 = compressedDataUrl;
      document.getElementById("previewDespues").src = compressedDataUrl;
      document.getElementById("previewDespues").style.display = "block";
      document.getElementById("iconDespues").style.display = "none";
      document.getElementById("labelDespues").innerText = "✔ Foto DESPUÉS OK";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ---------------------------------------------------------
// GUARDAR EVIDENCIA OFFLINE
// ---------------------------------------------------------
function saveEvidence(event) {
  event.preventDefault();

  if (!selectedAsset) {
    alert("Error: No hay ningún activo seleccionado.");
    return;
  }

  if (!photoDespuesBase64) {
    alert("⚠️ Por favor toma o selecciona la Foto DESPUÉS para continuar.");
    return;
  }

  if (!selectedModelFilter) {
    alert("⚠️ Error: Debes seleccionar el Modelo de " + (selectedAsset.tipo === "CASETA" ? "Caseta" : "Caja") + " en el Paso 3 antes de guardar el registro.");
    return;
  }

  const proceso = document.querySelector('input[name="filterProceso"]:checked')?.value || "IMAGEN";
  const existencia = document.querySelector('input[name="existencia"]:checked').value;
  const numViniles = parseInt(document.getElementById("numViniles").value) || 0;
  const oferta = document.getElementById("ofertaColocada").value;
  const comentarios = document.getElementById("comentarios").value;

  const timestamp = new Date().toISOString();
  const uniqueId = selectedAsset.unique_id || generateUniqueId(selectedAsset.tipo, selectedAsset.area_trabajo);

  const evidenceRecord = {
    id_registro_local: "EV_" + Date.now(),
    unique_id: uniqueId,
    asset_id: selectedAsset.id,
    proceso: proceso,
    tipo_elemento: selectedAsset.tipo,
    modelo_tipo: selectedModelFilter,
    estado: selectedAsset.estado,
    area_trabajo: selectedAsset.area_trabajo,
    municipio: selectedAsset.municipio,
    calle: selectedAsset.calle,
    lat_original: selectedAsset.lat,
    lon_original: selectedAsset.lon,
    
    // Captura en Campo
    existencia: existencia,
    num_viniles: numViniles,
    oferta_colocada: oferta,
    comentarios: comentarios,
    
    // Fotos (Únicamente Foto DESPUÉS)
    foto_despues: photoDespuesBase64,
    
    // GPS Foto Real
    gps_captura_lat: currentGpsCoords ? currentGpsCoords.lat : null,
    gps_captura_lon: currentGpsCoords ? currentGpsCoords.lon : null,
    gps_precision_m: currentGpsCoords ? currentGpsCoords.accuracy : null,
    
    fecha_captura: timestamp
  };

  dbEvidences.push(evidenceRecord);
  markAssetCompletedPermanently(evidenceRecord.asset_id, evidenceRecord.unique_id);
  saveEvidencesToStorage();

  alert(`✅ Evidencia guardada exitosamente (${uniqueId}).`);

  // Reset Form y Activo Seleccionado
  selectedAsset = null;
  document.getElementById("activeAssetAlert").style.display = "none";
  document.getElementById("formAssetId").value = "";
  document.getElementById("formAssetEstado").value = "";
  document.getElementById("formAssetArea").value = "";
  document.getElementById("formAssetInfo").value = "";
  document.getElementById("evidenceForm").reset();
  photoDespuesBase64 = "";
  document.getElementById("previewDespues").style.display = "none";
  document.getElementById("iconDespues").style.display = "block";
  document.getElementById("labelDespues").innerText = "Sin foto";

  // Refrescar lista de búsqueda para ocultar automáticamente el activo capturado
  applyHierarchyFilter();

  switchView('sync');
}

// ---------------------------------------------------------
// ALMACENAMIENTO Y EXPORTACIÓN
// ---------------------------------------------------------
function getCompletedAssetIdsSet() {
  const set = new Set();
  const permSaved = localStorage.getItem("TELMEX_COMPLETED_ASSETS");
  if (permSaved) {
    try {
      const arr = JSON.parse(permSaved);
      if (Array.isArray(arr)) {
        arr.forEach(id => { if (id) set.add(String(id)); });
      }
    } catch(e) {}
  }
  if (Array.isArray(dbEvidences)) {
    dbEvidences.forEach(ev => {
      if (ev.asset_id) set.add(String(ev.asset_id));
      if (ev.unique_id) set.add(String(ev.unique_id));
    });
  }
  completedAssetIdsSet = set;
  return set;
}

function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayCompletedCount() {
  const todayStr = getTodayDateString();
  let countFromEvidences = 0;
  
  if (Array.isArray(dbEvidences)) {
    dbEvidences.forEach(ev => {
      if (ev.fecha_captura && ev.fecha_captura.startsWith(todayStr)) {
        countFromEvidences++;
      }
    });
  }

  const storedTodayCount = parseInt(localStorage.getItem(`TELMEX_DAILY_COUNT_${todayStr}`) || "0", 10);
  return Math.max(countFromEvidences, storedTodayCount);
}

function updateDailyGoalUI() {
  const count = getTodayCompletedCount();
  const goal = 35;
  const pct = Math.min(100, Math.round((count / goal) * 100));

  const badge = document.getElementById("dailyGoalBadge");
  const bar = document.getElementById("dailyGoalProgressBar");
  const text = document.getElementById("dailyGoalText");

  if (badge) badge.innerText = `${count} / ${goal}`;
  if (bar) bar.style.width = `${pct}%`;
  if (text) {
    if (count >= goal) {
      text.innerText = `${pct}% completado hoy (¡Meta alcanzada de ${goal}! 🎉)`;
    } else {
      const remaining = goal - count;
      text.innerText = `${pct}% completado hoy (Faltan ${remaining} de la meta)`;
    }
  }
}

function getCompletedAssetCount() {
  const set = getCompletedAssetIdsSet();
  let primaryCount = 0;
  set.forEach(id => {
    if (!id.startsWith("CAS_") && !id.startsWith("CAJ_")) {
      primaryCount++;
    }
  });
  return primaryCount > 0 ? primaryCount : Math.ceil(set.size / 2);
}

function markAssetCompletedPermanently(assetId, uniqueId) {
  const set = getCompletedAssetIdsSet();
  if (assetId) set.add(String(assetId));
  if (uniqueId) set.add(String(uniqueId));
  localStorage.setItem("TELMEX_COMPLETED_ASSETS", JSON.stringify(Array.from(set)));
  completedAssetIdsSet = set;

  // Actualizar meta diaria para la fecha de hoy
  const todayStr = getTodayDateString();
  const currentTodayCount = getTodayCompletedCount();
  localStorage.setItem(`TELMEX_DAILY_COUNT_${todayStr}`, String(currentTodayCount + 1));

  updateDailyGoalUI();
}

function loadEvidencesFromStorage() {
  const saved = localStorage.getItem("TELMEX_EVIDENCES_2026");
  if (saved) {
    try {
      dbEvidences = JSON.parse(saved);
    } catch(e) {
      dbEvidences = [];
    }
  }
  getCompletedAssetIdsSet();
  updateSyncBadges();
}

function saveEvidencesToStorage() {
  localStorage.setItem("TELMEX_EVIDENCES_2026", JSON.stringify(dbEvidences));
  updateSyncBadges();
}

function updateSyncBadges() {
  const count = dbEvidences.length;
  document.getElementById("syncBadge").innerText = count;
  document.getElementById("navCount").innerText = count;
}

function renderSavedEvidences() {
  const container = document.getElementById("savedEvidencesList");
  container.innerHTML = "";

  if (dbEvidences.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:20px;">No hay evidencias guardadas pendientes.</p>';
    return;
  }

  dbEvidences.forEach((ev, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "10px";
    card.style.borderLeft = "4px solid var(--primary)";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:0.9rem;">
        <span>${ev.asset_id} (${ev.tipo_elemento})</span>
        <span style="color:var(--text-muted); font-size:0.75rem;">${new Date(ev.fecha_captura).toLocaleTimeString()}</span>
      </div>
      <div style="font-size:0.8rem; color:var(--text-dark); margin-top:4px;">
        📌 Estado: <strong>${ev.existencia}</strong> | Trabajo: <strong>${ev.proceso || 'IMAGEN'}</strong> | Viniles: <strong>${ev.num_viniles}</strong> | Oferta: <strong>${ev.oferta_colocada}</strong>
      </div>
      <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
        📍 GPS Foto: ${ev.gps_captura_lat ? `${ev.gps_captura_lat.toFixed(5)}, ${ev.gps_captura_lon.toFixed(5)}` : 'Sin GPS'}
      </div>
    `;

    container.appendChild(card);
  });
}

async function uploadImageToLinkaformCloud(b64DataUrl, fieldId, filename) {
  try {
    const fetchRes = await fetch(b64DataUrl);
    const blob = await fetchRes.blob();

    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("field_id", fieldId);
    formData.append("form_id", "142786");
    formData.append("is_image", "true");

    const uploadRes = await fetch("https://app.linkaform.com/api/infosync/cloud_upload/", {
      method: "POST",
      body: formData
    });

    if (uploadRes.ok) {
      const json = await uploadRes.json();
      return json.file;
    }
  } catch (e) {
    console.log("Error al subir foto a cloud_upload", e);
  }
  return null;
}

async function syncAllToLinkaform() {
  if (dbEvidences.length === 0) {
    alert("No hay evidencias pendientes en el teléfono.");
    return;
  }

  if (!navigator.onLine) {
    updateOfflineStatus();
    alert("⚠️ No se puede enviar porque el dispositivo está en Modo Offline. Intenta cuando tengas red de datos o Wi-Fi.");
    return;
  }

  const btn = document.getElementById("btnSyncLinkaform");
  if (btn) btn.innerText = "⏳ Subiendo fotos y enviando...";

  const LINKAFORM_API_URL = "https://app.linkaform.com/api/infosync/form_answer/";
  const LINKAFORM_FIELDS = {
    tipo: "69e7b9e52916bf387aa43313",
    distrito_telefono: "69e7b9e52916bf387aa43314",
    id_unico: "6ab6f3a4c472baf119e176e7",
    latitud: "6ab6f3a4c472baf119e176e8",
    longitud: "6ab6f3a4c472baf119e176e9",
    hay_caja_caseta: "6a99eb60a20e4f1d25581b71",
    num_viniles: "6a99eb60a20e4f1d25581b72",
    oferta_colocada: "6a99eb8af9c750d6db214c5d",
    foto_despues: "6a99e764f9c750d6db214c54",
    tipo_trabajo: "6ab9cdfec4fc804d8c8e088c",
    modelo_caja_caseta: "6ab9d647dba7a0c191e6a0f6"
  };

  let successCount = 0;
  let sentFolios = [];
  let remainingEvidences = [];
  let lastErrorMessage = "";
  let isNetworkFailure = false;

  for (let ev of dbEvidences) {
    const exist_str = (ev.existencia || "EXISTE").toLowerCase();
    const existencia_val = (exist_str.includes("existe") || exist_str.includes("si")) ? "sí" : "no";
    const oferta_val = (ev.oferta_colocada || "120 MB").includes("250") ? "250_mb" : "120_mb";
    const proc_str = (ev.proceso || "IMAGEN").toLowerCase();
    const tipo_trabajo_val = proc_str.includes("limpieza") ? "limpieza" : "imagen";
    const num_viniles_val = String(ev.num_viniles !== undefined && ev.num_viniles !== null ? ev.num_viniles : 1);
    const asset_id = String(ev.asset_id || "S/N");
    const unique_id = String(ev.unique_id || asset_id);
    const lat_val = ev.gps_captura_lat !== null && ev.gps_captura_lat !== undefined ? ev.gps_captura_lat : (ev.lat_original || 0);
    const lon_val = ev.gps_captura_lon !== null && ev.gps_captura_lon !== undefined ? ev.gps_captura_lon : (ev.lon_original || 0);
    const modelo_val = String(ev.modelo_tipo || "NORMAL");

    const answers = {
      [LINKAFORM_FIELDS.tipo]: (ev.tipo_elemento || "CASETA").toUpperCase(),
      [LINKAFORM_FIELDS.distrito_telefono]: asset_id,
      [LINKAFORM_FIELDS.id_unico]: unique_id,
      [LINKAFORM_FIELDS.latitud]: lat_val,
      [LINKAFORM_FIELDS.longitud]: lon_val,
      [LINKAFORM_FIELDS.hay_caja_caseta]: existencia_val,
      [LINKAFORM_FIELDS.num_viniles]: num_viniles_val,
      [LINKAFORM_FIELDS.oferta_colocada]: oferta_val,
      [LINKAFORM_FIELDS.tipo_trabajo]: tipo_trabajo_val,
      [LINKAFORM_FIELDS.modelo_caja_caseta]: modelo_val
    };

    // Subir Foto DESPUÉS (Campo ID: 6a99e764f9c750d6db214c54)
    if (ev.foto_despues) {
      const urlDespues = await uploadImageToLinkaformCloud(ev.foto_despues, LINKAFORM_FIELDS.foto_despues, `despues_${asset_id}.jpg`);
      if (urlDespues) {
        answers[LINKAFORM_FIELDS.foto_despues] = [{
          file_name: `despues_${asset_id}.jpg`,
          file_url: urlDespues
        }];
      }
    }

    const payload = {
      form_id: 142786,
      answers: answers
    };

    try {
      console.log("[POST Linkaform Payload]", payload);
      const response = await fetch(LINKAFORM_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const resText = await response.text();
      console.log(`[Linkaform Status ${response.status}]`, resText);

      if (response.ok) {
        let resData = {};
        try { resData = JSON.parse(resText); } catch(e) {}
        const folio = resData.folio || resData.id || resData.answers_id || "OK";
        sentFolios.push(folio);
        markAssetCompletedPermanently(ev.asset_id, ev.unique_id);
        successCount++;
      } else {
        remainingEvidences.push(ev);
        lastErrorMessage = `Respuesta Linkaform (HTTP ${response.status}): ${resText.substring(0, 100)}`;
      }
    } catch (e) {
      console.error("Error al sincronizar con Linkaform", e);
      remainingEvidences.push(ev);
      isNetworkFailure = true;
      forceOfflineState = true;
      updateOfflineStatus(true);
      lastErrorMessage = e.message || "Failed to fetch";
    }
  }

  dbEvidences = remainingEvidences;
  saveEvidencesToStorage();
  renderSavedEvidences();

  if (btn) btn.innerText = "🚀 Enviar Todo a Linkaform";

  if (successCount === 0) {
    if (isNetworkFailure || !navigator.onLine || forceOfflineState) {
      updateOfflineStatus(true);
      alert("⚠️ No se pudo enviar ningún registro porque estás en Modo Offline. Intenta nuevamente cuando tengas red de datos o Wi-Fi.");
    } else {
      alert("❌ No se pudo enviar ningún registro a Linkaform (" + (lastErrorMessage || "Error desconocido") + ").");
    }
  } else {
    const foliosStr = sentFolios.join(", ");
    const regLabel = successCount === 1 ? "1 registro exitosamente" : `${successCount} registros exitosamente`;
    alert(`✅ Se envió ${regLabel} Folio: ${foliosStr}`);
  }
}

async function exportEvidencesWhatsApp() {
  if (dbEvidences.length === 0) {
    alert("No hay evidencias registradas para enviar por WhatsApp.");
    return;
  }

  const filename = `lote_evidencias_telmex_${new Date().toISOString().slice(0,10)}_${Date.now()}.json`;
  const jsonContent = JSON.stringify(dbEvidences, null, 2);
  const file = new File([jsonContent], filename, { type: "application/json" });

  // 1. Web Share API (Permite adjuntar el archivo JSON directo a WhatsApp en Android)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: "Lote Evidencias Imagen Telmex 2026",
        text: `Comparto lote de ${dbEvidences.length} evidencias de la campaña Imagen Telmex 2026.`
      });
      return;
    } catch (e) {
      console.log("Compartir cancelado o no soportado:", e);
    }
  }

  // 2. Fallback a WhatsApp Deep Link + Descarga del archivo
  const assetsList = dbEvidences.map(e => e.asset_id).slice(0, 5).join(", ");
  const summaryText = `📦 *Lote Evidencias Imagen Telmex 2026*\n\n` +
    `• Total registros: ${dbEvidences.length}\n` +
    `• Fecha: ${new Date().toLocaleString()}\n` +
    `• Casetas/Cajas: ${assetsList}${dbEvidences.length > 5 ? "..." : ""}\n\n` +
    `📎 Se ha descargado el archivo JSON en tu teléfono para adjuntarlo a este chat.`;

  exportEvidencesJSON();
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(summaryText)}`;
  window.open(whatsappUrl, "_system");
}

function exportEvidencesJSON() {
  if (dbEvidences.length === 0) {
    alert("No hay evidencias para exportar.");
    return;
  }

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dbEvidences, null, 2));
  const downloadAnchor = document.createElement('a');
  const filename = `lote_evidencias_telmex_${new Date().toISOString().slice(0,10)}_${Date.now()}.json`;
  
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function clearEvidencesPrompt() {
  if (confirm("¿Estás seguro de borrar todas las evidencias guardadas en este teléfono?")) {
    dbEvidences = [];
    localStorage.removeItem("TELMEX_COMPLETED_ASSETS");
    if (completedAssetIdsSet) completedAssetIdsSet.clear();
    saveEvidencesToStorage();
    renderSavedEvidences();
    applyHierarchyFilter();
  }
}

// ---------------------------------------------------------
// MODAL DE CÁMARA EN TIEMPO REAL (WEBRTC STREAM)
// ---------------------------------------------------------
let currentStream = null;
let currentTargetPhotoType = null;
let currentFacingMode = 'environment';

function openCameraModal(type) {
  currentTargetPhotoType = type;
  document.getElementById("cameraModalTitle").innerText = `📷 Capturar Foto ${type.toUpperCase()}`;
  document.getElementById("cameraModal").style.display = "flex";
  startCameraStream();
}

function startCameraStream() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  const constraints = {
    video: {
      facingMode: { ideal: currentFacingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      currentStream = stream;
      const video = document.getElementById("cameraVideo");
      video.srcObject = stream;
    })
    .catch(err => {
      console.warn("getUserMedia no disponible o sin permiso, ejecutando fallback nativo:", err);
      closeCameraModal();
      const inputId = (currentTargetPhotoType === 'Antes') ? 'inputCamAntes' : 'inputCamDespues';
      const inputEl = document.getElementById(inputId);
      if (inputEl) inputEl.click();
    });
}

function flipCamera() {
  currentFacingMode = (currentFacingMode === 'environment') ? 'user' : 'environment';
  startCameraStream();
}

function closeCameraModal() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  document.getElementById("cameraModal").style.display = "none";
}

function takeSnapshot() {
  const video = document.getElementById("cameraVideo");
  if (!video || !video.videoWidth) {
    alert("Esperando señal de la cámara...");
    return;
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.75);

  if (currentTargetPhotoType === 'Antes') {
    photoAntesBase64 = compressedDataUrl;
    document.getElementById("previewAntes").src = compressedDataUrl;
    document.getElementById("previewAntes").style.display = "block";
    document.getElementById("iconAntes").style.display = "none";
    document.getElementById("labelAntes").innerText = "✔ Foto ANTES OK";
  } else {
    photoDespuesBase64 = compressedDataUrl;
    document.getElementById("previewDespues").src = compressedDataUrl;
    document.getElementById("previewDespues").style.display = "block";
    document.getElementById("iconDespues").style.display = "none";
    document.getElementById("labelDespues").innerText = "✔ Foto DESPUÉS OK";
  }

  closeCameraModal();
}
