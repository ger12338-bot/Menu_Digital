const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

let datosFilas = [];            
let filasFiltradasGlobal = [];  
let listaProductosMenu = [];    
let filtroCanalActual = 'todos';
let filtroFechaActual = 'hoy';
let estadoTiendaActual = "ABIERTO";

document.addEventListener("DOMContentLoaded", () => {
    sincronizarDatosGrid();
    consultarEstadoTiendaActual();
    setInterval(() => { sincronizarDatosGrid(true); }, 30000);
});

function sincronizarDatosGrid(esSilencioso = false) {
    const tbody = document.getElementById("tableBodyContainer");
    const indicator = document.getElementById("tableSyncStatus");
    
    if (!esSilencioso) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:50px; color:#ff5500;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando renglones del Google Sheet...</td></tr>`;
    }

    indicator.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> Leyendo...`;
    indicator.style.color = "#ff8c00";

    fetch(`${GOOGLE_SCRIPT_URL}?action=getPedidos`, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            datosFilas = data.reverse();
            filtrarTabla();
            const clock = new Date();
            indicator.innerHTML = `✅ ${clock.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
            indicator.style.color = "#25D366";
        } else {
            if (!esSilencioso) errorTabla("El formato del Google Sheet no es compatible.");
        }
    })
    .catch(err => {
        console.error(err);
        indicator.innerHTML = `⚠️ Error`;
        indicator.style.color = "#ff3344";
        if (!esSilencioso) errorTabla("No se pudo conectar a la base de datos.");
    });
}

function consultarEstadoTiendaActual() {
    fetch(GOOGLE_SCRIPT_URL, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        if(data.estado) {
            estadoTiendaActual = data.estado;
            actualizarBotonInterfazAdmin();
        }
    }).catch(e => console.error(e));
}

function actualizarBotonInterfazAdmin() {
    const btn = document.getElementById("btnToggleTienda");
    if(!btn) return;
    if (estadoTiendaActual === "ABIERTO") {
        btn.style.background = "rgba(37, 211, 102, 0.15)";
        btn.style.borderColor = "#25D366";
        btn.style.color = "#25D366";
        btn.innerHTML = `<i class="fa-solid fa-door-open"></i> ABIERTA`;
    } else {
        btn.style.background = "rgba(255, 51, 68, 0.15)";
        btn.style.borderColor = "#ff3344";
        btn.style.color = "#ff3344";
        btn.innerHTML = `<i class="fa-solid fa-door-closed"></i> CERRADA`;
    }
}

function toggleEstadoTiendaInternet() {
    const btn = document.getElementById("btnToggleTienda");
    const proximoEstado = (estadoTiendaActual === "ABIERTO") ? "CERRADO" : "ABIERTO";
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors", cache: "no-cache", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cambiarEstadoTienda", estado: proximoEstado })
    })
    .then(() => {
        estadoTiendaActual = proximoEstado;
        actualizarBotonInterfazAdmin();
        btn.disabled = false;
    })
    .catch(err => {
        console.error(err);
        alert("Error de conexión al cambiar estado.");
        actualizarBotonInterfazAdmin();
        btn.disabled = false;
    });
}

// GESTIÓN DE MENÚ CON FILTRO
function abrirModalGestionMenu() {
    const modal = document.getElementById("menuMgmtModal");
    const container = document.getElementById("menuMgmtList");
    const searchInput = document.getElementById("menuMgmtSearch");
    
    if(searchInput) searchInput.value = "";
    modal.classList.add("show");
    container.innerHTML = `<p style="text-align:center; padding:30px; color:#ff5500;"><i class="fa-solid fa-spinner fa-spin"></i> Sincronizando catálogo...</p>`;

    fetch(GOOGLE_SCRIPT_URL, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        listaProductosMenu = data.productos || [];
        renderizarListaGestionMenu(listaProductosMenu);
    })
    .catch(err => {
        console.error(err);
        container.innerHTML = `<p style="text-align:center; color:#ff3344;">❌ No se pudo cargar el menú.</p>`;
    });
}

function cerrarModalGestionMenu() { document.getElementById("menuMgmtModal").classList.remove("show"); }

function filtrarListaGestionMenu() {
    const query = document.getElementById("menuMgmtSearch").value.toLowerCase().trim();
    const productosFiltrados = listaProductosMenu.filter(p => {
        const nombre = (p.nombre || "").toLowerCase();
        const cat = (p.categoria || "").toLowerCase();
        return nombre.includes(query) || cat.includes(query);
    });
    renderizarListaGestionMenu(productosFiltrados);
}

function renderizarListaGestionMenu(arrProductos) {
    const container = document.getElementById("menuMgmtList");
    container.innerHTML = "";

    if (!arrProductos || arrProductos.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:#666; padding:20px;">No se encontraron platillos.</p>`;
        return;
    }

    arrProductos.forEach(p => {
        const prodId = p.id.toString().trim();
        const estaAgotado = p.agotado && p.agotado.toString().trim().toUpperCase() === "SI";
        let precioNum = parseFloat(p.precio ? p.precio.toString().replace(/[^0-9.]/g, '') : "0") || 0;

        const row = document.createElement("div");
        row.className = "menu-mgmt-row";
        row.innerHTML = `
            <div class="menu-mgmt-info">
                <span class="menu-mgmt-title">${p.nombre}</span>
                <span class="menu-mgmt-category">${p.categoria || 'General'}</span>
            </div>
            
            <div class="menu-mgmt-controls">
                <span style="font-size:0.8rem; color:#888;">$</span>
                <input type="number" step="any" id="input-price-${prodId}" class="price-edit-input" value="${precioNum.toFixed(2)}">
                <button class="btn-save-price" onclick="guardarNuevoPrecioExpress('${prodId}')" title="Guardar Precio">
                    <i class="fa-solid fa-floppy-disk"></i>
                </button>

                <div style="display:flex; flex-direction:column; align-items:center; margin-left:10px;">
                    <label class="switch-toggle">
                        <input type="checkbox" id="switch-${prodId}" ${estaAgotado ? 'checked' : ''} onchange="toggleAgotadoExpress('${prodId}', this.checked)">
                        <span class="slider-round"></span>
                    </label>
                    <span id="label-state-${prodId}" style="font-size:0.65rem; font-weight:800; margin-top:3px; color:${estaAgotado ? '#ff3344' : '#25D366'};">
                        ${estaAgotado ? 'AGOTADO' : 'DISPONIBLE'}
                    </span>
                </div>
            </div>
        `;
        container.appendChild(row);
    });
}

function toggleAgotadoExpress(productId, estaAgotadoChecked) {
    const valorAgotado = estaAgotadoChecked ? "SI" : "NO";
    const labelState = document.getElementById(`label-state-${productId}`);
    if (labelState) labelState.innerText = "GUARDANDO...";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors", cache: "no-cache", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "actualizarProducto", id: productId, agotado: valorAgotado })
    })
    .then(() => {
        const prod = listaProductosMenu.find(item => item.id.toString().trim() === productId);
        if(prod) prod.agotado = valorAgotado;
        if (labelState) {
            labelState.innerText = estaAgotadoChecked ? "AGOTADO" : "DISPONIBLE";
            labelState.style.color = estaAgotadoChecked ? "#ff3344" : "#25D366";
        }
    })
    .catch(() => alert("❌ Error de red al guardar estado."));
}

function guardarNuevoPrecioExpress(productId) {
    const inputPrice = document.getElementById(`input-price-${productId}`);
    const nuevoPrecio = parseFloat(inputPrice.value) || 0;
    inputPrice.style.borderColor = "#ff8c00";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors", cache: "no-cache", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "actualizarProducto", id: productId, precio: nuevoPrecio })
    })
    .then(() => {
        const prod = listaProductosMenu.find(item => item.id.toString().trim() === productId);
        if(prod) prod.precio = nuevoPrecio;
        inputPrice.style.borderColor = "#25D366";
        setTimeout(() => { inputPrice.style.borderColor = "rgba(255, 255, 255, 0.1)"; }, 1500);
    })
    .catch(() => { inputPrice.style.borderColor = "#ff3344"; alert("❌ Error al guardar precio."); });
}

// FILTROS DE TABLA DE PEDIDOS
function cambiarFiltroGrid(canal) {
    filtroCanalActual = canal;
    document.getElementById("fTodos").classList.remove("active");
    document.getElementById("fWhatsApp").classList.remove("active");
    document.getElementById("fLocal").classList.remove("active");
    if (canal === 'todos') document.getElementById("fTodos").classList.add("active");
    if (canal === 'WhatsApp') document.getElementById("fWhatsApp").classList.add("active");
    if (canal === 'Local') document.getElementById("fLocal").classList.add("active");
    filtrarTabla();
}

function cambiarFiltroFecha(rango) {
    filtroFechaActual = rango;
    document.getElementById("fdHoy").classList.remove("active");
    document.getElementById("fdAyer").classList.remove("active");
    document.getElementById("fdSemana").classList.remove("active");
    document.getElementById("fdTodo").classList.remove("active");
    if (rango === 'hoy') document.getElementById("fdHoy").classList.add("active");
    if (rango === 'ayer') document.getElementById("fdAyer").classList.add("active");
    if (rango === 'semana') document.getElementById("fdSemana").classList.add("active");
    if (rango === 'todo') document.getElementById("fdTodo").classList.add("active");
    filtrarTabla();
}

function interpretarFecha(fechaStr) {
    if (!fechaStr) return null;
    let d = new Date(fechaStr);
    if (!isNaN(d.getTime())) return d;
    try {
        let partesEspacio = fechaStr.toString().split(" ");
        let partesFecha = partesEspacio[0].split("/");
        let dia = parseInt(partesFecha[0], 10);
        let mes = parseInt(partesFecha[1], 10) - 1; 
        let anio = parseInt(partesFecha[2], 10);
        let hora = 0, min = 0, seg = 0;
        if (partesEspacio[1]) {
            let partesHora = partesEspacio[1].split(":");
            hora = parseInt(partesHora[0], 10);
            min = parseInt(partesHora[1], 10);
            seg = parseInt(partesHora[2], 10) || 0;
        }
        return new Date(anio, mes, dia, hora, min, seg);
    } catch(e) { return null; }
}

function filtrarTabla() {
    const query = document.getElementById("tableSearch").value.toLowerCase().trim();
    const tbody = document.getElementById("tableBodyContainer");
    tbody.innerHTML = "";

    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
    const hace7Dias = new Date(hoy); hace7Dias.setDate(hace7Dias.getDate() - 7);

    filasFiltradasGlobal = datosFilas.filter(f => {
        let metodo = (f['método de pago'] || f.metodo_pago || 'Mostrador Local').toString().toLowerCase();
        let pasaCanal = true;
        if (filtroCanalActual === 'WhatsApp' && !metodo.includes('whatsapp')) pasaCanal = false;
        if (filtroCanalActual === 'Local' && metodo.includes('whatsapp')) pasaCanal = false;

        let pasaFecha = true;
        let fechaObj = interpretarFecha(f.fecha);
        if (fechaObj) {
            let tiempoPedido = new Date(fechaObj); tiempoPedido.setHours(0,0,0,0);
            if (filtroFechaActual === 'hoy' && tiempoPedido.getTime() !== hoy.getTime()) pasaFecha = false;
            if (filtroFechaActual === 'ayer' && tiempoPedido.getTime() !== ayer.getTime()) pasaFecha = false;
            if (filtroFechaActual === 'semana' && (fechaObj < hace7Dias)) pasaFecha = false;
        } else if (filtroFechaActual !== 'todo') { pasaFecha = false; }

        let cliente = (f.cliente || '').toLowerCase();
        let direccion = (f.direccion || '').toLowerCase();
        let productos = (f.productos || '').toLowerCase();
        let pasaQuery = cliente.includes(query) || direccion.includes(query) || productos.includes(query);

        return pasaCanal && pasaFecha && pasaQuery;
    });

    if (filasFiltradasGlobal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#555;">Ninguna fila coincide con los filtros aplicados.</td></tr>`;
        return;
    }

    filasFiltradasGlobal.forEach((f, index) => {
        const tr = document.createElement("tr");
        let campoFecha = f.fecha || "Reciente";
        let canalOriginal = f['método de pago'] || 'Mostrador Local';
        let badgeHTML = canalOriginal.toString().toLowerCase().includes('whatsapp') 
            ? `<span class="cell-badge badge-whatsapp"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>`
            : `<span class="cell-badge badge-local"><i class="fa-solid fa-cash-register"></i> Mostrador</span>`;

        let stringProductos = f.productos ? f.productos.toString().replace(/\|/g, ", ") : "Sin especificar";
        let linkGPS = f.gps && f.gps.toString().startsWith("http");
        let botonGpsHTML = linkGPS 
            ? `<a href="${f.gps}" target="_blank" class="btn-table-action"><i class="fa-solid fa-location-arrow"></i> GPS</a>`
            : `<span style="color:#444; font-size:0.8rem; font-weight:600;">N/A</span>`;

        let totalNumerico = parseFloat(f.total) || 0;

        // Se agregan data-label a cada td para la vista responsive móvil
        tr.innerHTML = `
            <td data-label="Fecha/Hora" class="cell-date">${campoFecha}</td>
            <td data-label="Cliente" class="cell-bold">${f.cliente || 'General'}</td>
            <td data-label="Canal">${badgeHTML}</td>
            <td data-label="Platillos"><div class="cell-products-list" title="${stringProductos}">${stringProductos}</div></td>
            <td data-label="Total" class="cell-price">$${totalNumerico.toFixed(2)}</td>
            <td data-label="Dirección" style="color:#aaa;" title="${f.direccion || ''}">${f.direccion || 'Entrega Local'}</td>
            <td data-label="Acción" style="text-align: center;">
                <button class="btn-table-action" onclick="abrirModalDetalle(${index})" style="color:#25D366; background:rgba(37,211,102,0.05);"><i class="fa-solid fa-eye"></i> Ver Todo</button>
            </td>
            <td data-label="Mapa" style="text-align: center;">${botonGpsHTML}</td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirModalDetalle(index) {
    const pedido = filasFiltradasGlobal[index];
    if (!pedido) return;

    document.getElementById("lblCliente").innerText = pedido.cliente || 'General / Local';
    document.getElementById("lblFecha").innerText = pedido.fecha || 'Reciente';
    document.getElementById("lblMetodo").innerText = pedido['método de pago'] || 'Mostrador Local';
    document.getElementById("lblTotal").innerText = `$${(parseFloat(pedido.total) || 0).toFixed(2)}`;
    document.getElementById("lblDireccion").innerText = pedido.direccion || 'Entrega Directa en Sucursal';
    document.getElementById("lblReferencias").innerText = pedido.referencias || 'Sin referencias registradas';
    document.getElementById("lblNotas").innerText = pedido.notas || 'Sin instrucciones adicionales';

    const containerProductos = document.getElementById("lblProductosContainer"); 
    containerProductos.innerHTML = "";
    
    if (pedido.productos) {
        pedido.productos.split("|").forEach(platillo => {
            if(platillo.trim() !== "") {
                const divRow = document.createElement("div"); 
                divRow.className = "product-item-row";
                divRow.innerHTML = `<span>🔥 ${platillo.trim()}</span>`;
                containerProductos.appendChild(divRow);
            }
        });
    } else { 
        containerProductos.innerHTML = "<p style='color:#666;'>No hay registros de platillos.</p>"; 
    }
    
    document.getElementById("detailModal").classList.add("show");
}

function cerrarModalDetalle() { document.getElementById("detailModal").classList.remove("show"); }

window.onclick = function(event) { 
    if (event.target === document.getElementById("detailModal")) cerrarModalDetalle(); 
    if (event.target === document.getElementById("menuMgmtModal")) cerrarModalGestionMenu(); 
}

function errorTabla(msj) { 
    document.getElementById("tableBodyContainer").innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#ff3344;">❌ ${msj}</td></tr>`; 
}