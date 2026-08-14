const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

let datosFilas = [];            
let filasFiltradasGlobal = [];  
let listaProductosMenu = [];    
let filtroCanalActual = 'todos';
let filtroFechaActual = 'hoy';
let estadoTiendaActual = "ABIERTO";
let cantidadPedidosHistorica = 0;
let indicePedidoSeleccionado = null;
let adminTokenActual = null;

document.addEventListener("DOMContentLoaded", () => {
    comprobarSesionExistente();
});

// ==========================================================================
// 1. AUTENTICACIÓN Y SESIÓN SEGURA
// ==========================================================================
function comprobarSesionExistente() {
    const tokenGuardado = localStorage.getItem("ADMIN_TACOS_TOKEN");
    if (tokenGuardado) {
        adminTokenActual = tokenGuardado;
        ocultarPantallaLogin();
        iniciarPanelAdmin();
    } else {
        mostrarPantallaLogin();
    }
}

function mostrarPantallaLogin() {
    document.getElementById("loginOverlay").style.display = "flex";
}

function ocultarPantallaLogin() {
    document.getElementById("loginOverlay").style.display = "none";
}

function procesarLoginPIN(event) {
    event.preventDefault();
    const pinInput = document.getElementById("inputPinAdmin").value.trim();
    const btnSubmit = document.getElementById("btnLoginSubmit");
    const lblError = document.getElementById("lblErrorLogin");

    if (!pinInput) return;

    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Verificando...`;
    lblError.style.display = "none";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "validarPinAdmin", pin: pinInput })
    })
    .then(res => res.json())
    .then(data => {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-key"></i> Entrar al Panel`;

        if (data.result === "success" && data.token) {
            adminTokenActual = data.token;
            localStorage.setItem("ADMIN_TACOS_TOKEN", adminTokenActual);
            ocultarPantallaLogin();
            iniciarPanelAdmin();
        } else {
            lblError.innerText = "❌ PIN de administrador incorrecto.";
            lblError.style.display = "block";
            document.getElementById("inputPinAdmin").value = "";
            document.getElementById("inputPinAdmin").focus();
        }
    })
    .catch(err => {
        console.error(err);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-key"></i> Entrar al Panel`;
        lblError.innerText = "❌ Error de conexión con el servidor.";
        lblError.style.display = "block";
    });
}

function cerrarSesionAdmin() {
    localStorage.removeItem("ADMIN_TACOS_TOKEN");
    adminTokenActual = null;
    location.reload();
}

function iniciarPanelAdmin() {
    sincronizarDatosGrid();
    consultarEstadoTiendaActual();
    setInterval(() => { sincronizarDatosGrid(true); }, 30000);
}

// ==========================================================================
// 2. SINCRONIZACIÓN Y CONSULTA DE DATOS
// ==========================================================================
function sincronizarDatosGrid(esSilencioso = false) {
    const tbody = document.getElementById("tableBodyContainer");
    const indicator = document.getElementById("tableSyncStatus");
    
    if (!esSilencioso && datosFilas.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:50px; color:#ff5500;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando renglones del Google Sheet...</td></tr>`;
    }

    indicator.innerHTML = `<i class="fa-solid fa-arrows-rotate fa-spin"></i> Leyendo...`;
    indicator.style.color = "#ff8c00";

    fetch(`${GOOGLE_SCRIPT_URL}?action=getPedidos`, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        if (Array.isArray(data)) {
            let nuevosDatos = data.reverse();
            
            if (cantidadPedidosHistorica > 0 && nuevosDatos.length > cantidadPedidosHistorica) {
                reproducirSonidoNuevoPedidoPotente();
            }
            
            datosFilas = nuevosDatos;
            cantidadPedidosHistorica = datosFilas.length;
            
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
        if (!esSilencioso && datosFilas.length === 0) errorTabla("No se pudo conectar a la base de datos.");
    });
}

function reproducirSonidoNuevoPedidoPotente() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        function emitirBeep(tiempoInicio) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.type = "square"; osc.frequency.setValueAtTime(880, tiempoInicio); 
            gain.gain.setValueAtTime(0.8, tiempoInicio); 
            gain.gain.exponentialRampToValueAtTime(0.01, tiempoInicio + 0.18);
            osc.start(tiempoInicio); osc.stop(tiempoInicio + 0.18);
        }
        const ahora = audioCtx.currentTime;
        emitirBeep(ahora); emitirBeep(ahora + 0.25); emitirBeep(ahora + 0.50);
    } catch(e) { console.error("Audio bloqueado", e); }
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
        btn.style.borderColor = "#25D366"; btn.style.color = "#25D366";
        btn.innerHTML = `<i class="fa-solid fa-door-open"></i> ABIERTA`;
    } else {
        btn.style.background = "rgba(255, 51, 68, 0.15)";
        btn.style.borderColor = "#ff3344"; btn.style.color = "#ff3344";
        btn.innerHTML = `<i class="fa-solid fa-door-closed"></i> CERRADA`;
    }
}

// ==========================================================================
// 3. CAMBIAR ESTATUS (PENDIENTE / ENTREGADO / CANCELADO)
// ==========================================================================
function cambiarEstatusDirecto(index, nuevoEstatus) {
    if (!adminTokenActual) return alert("⚠️ Sesión no válida.");
    const pedido = filasFiltradasGlobal[index];
    if (!pedido) return;

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "cambiarEstatusPedido",
            fechaPedido: pedido.fecha,
            nuevoEstatus: nuevoEstatus,
            token: adminTokenActual
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.result === "success") {
            pedido.estatus = nuevoEstatus;
            const itemOriginal = datosFilas.find(d => d.fecha === pedido.fecha);
            if (itemOriginal) itemOriginal.estatus = nuevoEstatus;

            filtrarTabla();
        } else {
            alert("❌ Error: " + (data.message || "No se pudo cambiar el estatus."));
        }
    })
    .catch(() => alert("❌ Error de red al actualizar estatus."));
}

function toggleEstadoTiendaInternet() {
    if (!adminTokenActual) return alert("⚠️ Sesión no válida.");
    const btn = document.getElementById("btnToggleTienda");
    const proximoEstado = (estadoTiendaActual === "ABIERTO") ? "CERRADO" : "ABIERTO";
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "cambiarEstadoTienda", estado: proximoEstado, token: adminTokenActual })
    })
    .then(res => res.json())
    .then(data => {
        btn.disabled = false;
        if (data.result === "success") {
            estadoTiendaActual = proximoEstado;
            actualizarBotonInterfazAdmin();
        } else {
            alert("❌ " + (data.message || "Acceso denegado."));
            actualizarBotonInterfazAdmin();
        }
    })
    .catch(() => { alert("Error de conexión."); actualizarBotonInterfazAdmin(); btn.disabled = false; });
}

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
    .catch(() => { container.innerHTML = `<p style="text-align:center; color:#ff3344;">❌ No se pudo cargar el menú.</p>`; });
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
    if (!adminTokenActual) return alert("⚠️ Sesión no válida.");
    const valorAgotado = estaAgotadoChecked ? "SI" : "NO";
    const labelState = document.getElementById(`label-state-${productId}`);
    if (labelState) labelState.innerText = "GUARDANDO...";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "actualizarProducto", id: productId, agotado: valorAgotado, token: adminTokenActual })
    })
    .then(res => res.json())
    .then(data => {
        if (data.result === "success") {
            const prod = listaProductosMenu.find(item => item.id.toString().trim() === productId);
            if(prod) prod.agotado = valorAgotado;
            if (labelState) {
                labelState.innerText = estaAgotadoChecked ? "AGOTADO" : "DISPONIBLE";
                labelState.style.color = estaAgotadoChecked ? "#ff3344" : "#25D366";
            }
        } else {
            alert("❌ Error de actualización");
            if (labelState) labelState.innerText = "ERROR";
        }
    })
    .catch(() => alert("❌ Error de red."));
}

function guardarNuevoPrecioExpress(productId) {
    if (!adminTokenActual) return alert("⚠️ Sesión no válida.");
    const inputPrice = document.getElementById(`input-price-${productId}`);
    const nuevoPrecio = parseFloat(inputPrice.value) || 0;
    inputPrice.style.borderColor = "#ff8c00";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "actualizarProducto", id: productId, precio: nuevoPrecio, token: adminTokenActual })
    })
    .then(res => res.json())
    .then(data => {
        if (data.result === "success") {
            const prod = listaProductosMenu.find(item => item.id.toString().trim() === productId);
            if(prod) prod.precio = nuevoPrecio;
            inputPrice.style.borderColor = "#25D366";
            setTimeout(() => { inputPrice.style.borderColor = "rgba(255, 255, 255, 0.1)"; }, 1500);
        } else {
            inputPrice.style.borderColor = "#ff3344"; alert("❌ Error al guardar.");
        }
    })
    .catch(() => { inputPrice.style.borderColor = "#ff3344"; alert("❌ Error al guardar."); });
}

// ==========================================================================
// 4. FILTROS Y TABLA DE PEDIDOS
// ==========================================================================
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
    document.getElementById("fdRango").classList.remove("active");

    const rangeContainer = document.getElementById("customDateRangeContainer");

    if (rango === 'hoy') document.getElementById("fdHoy").classList.add("active");
    if (rango === 'ayer') document.getElementById("fdAyer").classList.add("active");
    if (rango === 'semana') document.getElementById("fdSemana").classList.add("active");
    if (rango === 'todo') document.getElementById("fdTodo").classList.add("active");
    
    if (rango === 'rango') {
        document.getElementById("fdRango").classList.add("active");
        if (rangeContainer) rangeContainer.style.display = "flex";
        
        const inputStart = document.getElementById("dateStart");
        const inputEnd = document.getElementById("dateEnd");
        const hoyIso = new Date().toISOString().slice(0, 10);
        
        if (inputStart && !inputStart.value) inputStart.value = hoyIso;
        if (inputEnd && !inputEnd.value) inputEnd.value = hoyIso;
    } else {
        if (rangeContainer) rangeContainer.style.display = "none";
    }

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

    let fechaInicioRango = null;
    let fechaFinRango = null;

    if (filtroFechaActual === 'rango') {
        const valStart = document.getElementById("dateStart") ? document.getElementById("dateStart").value : "";
        const valEnd = document.getElementById("dateEnd") ? document.getElementById("dateEnd").value : "";
        if (valStart) {
            let partes = valStart.split("-");
            fechaInicioRango = new Date(partes[0], partes[1] - 1, partes[2], 0, 0, 0);
        }
        if (valEnd) {
            let partes = valEnd.split("-");
            fechaFinRango = new Date(partes[0], partes[1] - 1, partes[2], 23, 59, 59);
        }
    }

    filasFiltradasGlobal = datosFilas.filter(f => {
        let metodoPagoTexto = (f.metodo_pago || f['método de pago'] || '').toString().toLowerCase();
        let esCanalWhatsApp = metodoPagoTexto.includes('whatsapp') || (f.gps && f.gps.toString().startsWith("http"));

        let pasaCanal = true;
        if (filtroCanalActual === 'WhatsApp' && !esCanalWhatsApp) pasaCanal = false;
        if (filtroCanalActual === 'Local' && esCanalWhatsApp) pasaCanal = false;

        let pasaFecha = true;
        let fechaObj = interpretarFecha(f.fecha);
        if (fechaObj) {
            let tiempoPedido = new Date(fechaObj); tiempoPedido.setHours(0,0,0,0);
            if (filtroFechaActual === 'hoy' && tiempoPedido.getTime() !== hoy.getTime()) pasaFecha = false;
            if (filtroFechaActual === 'ayer' && tiempoPedido.getTime() !== ayer.getTime()) pasaFecha = false;
            if (filtroFechaActual === 'semana' && (fechaObj < hace7Dias)) pasaFecha = false;
            if (filtroFechaActual === 'rango') {
                if (fechaInicioRango && fechaObj < fechaInicioRango) pasaFecha = false;
                if (fechaFinRango && fechaObj > fechaFinRango) pasaFecha = false;
            }
        } else if (filtroFechaActual !== 'todo') { pasaFecha = false; }

        let cliente = (f.cliente || '').toLowerCase();
        let direccion = (f.direccion || '').toLowerCase();
        let productos = (f.productos || '').toLowerCase();
        let pasaQuery = cliente.includes(query) || direccion.includes(query) || productos.includes(query);

        return pasaCanal && pasaFecha && pasaQuery;
    });

    actualizarKPIS(filasFiltradasGlobal);

    if (filasFiltradasGlobal.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#555;">Ninguna fila coincide con los filtros aplicados.</td></tr>`;
        return;
    }

    filasFiltradasGlobal.forEach((f, index) => {
        const tr = document.createElement("tr");
        const estatus = f.estatus || "PENDIENTE";
        const esCancelado = (estatus === "CANCELADO");

        if (esCancelado) tr.className = "tr-cancelado";

        let campoFecha = f.fecha || "Reciente";
        let metodoPagoTexto = (f.metodo_pago || f['método de pago'] || '').toString().toLowerCase();
        let esCanalWhatsApp = metodoPagoTexto.includes('whatsapp') || (f.gps && f.gps.toString().startsWith("http"));

        let badgeCanalHTML = esCanalWhatsApp 
            ? `<span class="cell-badge badge-whatsapp"><i class="fa-brands fa-whatsapp"></i> WhatsApp</span>`
            : `<span class="cell-badge badge-local"><i class="fa-solid fa-cash-register"></i> Mostrador</span>`;

        let badgeEstatusHTML = `<span class="cell-badge badge-pendiente"><i class="fa-solid fa-clock"></i> PENDIENTE</span>`;
        if (estatus === "ENTREGADO") {
            badgeEstatusHTML = `<span class="cell-badge badge-entregado"><i class="fa-solid fa-circle-check"></i> ENTREGADO</span>`;
        } else if (estatus === "CANCELADO") {
            badgeEstatusHTML = `<span class="cell-badge badge-cancelado"><i class="fa-solid fa-ban"></i> CANCELADO</span>`;
        }

        let stringProductos = f.productos ? f.productos.toString().replace(/\|/g, ", ") : "Sin especificar";
        let totalNumerico = parseFloat(f.total) || 0;

        let botonesAccionHTML = "";
        if (estatus === "PENDIENTE") {
            botonesAccionHTML = `
                <div style="display:flex; gap:4px; justify-content:center;">
                    <button class="btn-restore-action" onclick="cambiarEstatusDirecto(${index}, 'ENTREGADO')" title="Marcar Entregado"><i class="fa-solid fa-check"></i></button>
                    <button class="btn-cancel-action" onclick="cambiarEstatusDirecto(${index}, 'CANCELADO')" title="Cancelar Venta"><i class="fa-solid fa-ban"></i></button>
                </div>`;
        } else if (estatus === "ENTREGADO") {
            botonesAccionHTML = `
                <div style="display:flex; gap:4px; justify-content:center;">
                    <button class="btn-cancel-action" onclick="cambiarEstatusDirecto(${index}, 'CANCELADO')" title="Cancelar Venta"><i class="fa-solid fa-ban"></i></button>
                </div>`;
        } else if (estatus === "CANCELADO") {
            botonesAccionHTML = `
                <div style="display:flex; gap:4px; justify-content:center;">
                    <button class="btn-restore-action" onclick="cambiarEstatusDirecto(${index}, 'PENDIENTE')" title="Reactivar a Pendiente"><i class="fa-solid fa-rotate-left"></i> Restaurar</button>
                </div>`;
        }

        tr.innerHTML = `
            <td data-label="Fecha/Hora" class="cell-date">${campoFecha}</td>
            <td data-label="Cliente" class="cell-bold">${f.cliente || 'General'}</td>
            <td data-label="Estatus">${badgeEstatusHTML}</td>
            <td data-label="Canal">${badgeCanalHTML}</td>
            <td data-label="Platillos"><div class="cell-products-list" title="${stringProductos}">${stringProductos}</div></td>
            <td data-label="Total" class="cell-price">$${totalNumerico.toFixed(2)}</td>
            <td data-label="Detalle" style="text-align: center;">
                <button class="btn-table-action" onclick="abrirModalDetalle(${index})" style="color:#25D366; background:rgba(37,211,102,0.05);"><i class="fa-solid fa-eye"></i> Ver</button>
            </td>
            <td data-label="Acción" style="text-align: center;">${botonesAccionHTML}</td>
        `;
        tbody.appendChild(tr);
    });
}

function actualizarKPIS(pedidos) {
    let pedidosEntregados = pedidos.filter(f => f.estatus === "ENTREGADO");
    
    let sumaTotal = pedidosEntregados.reduce((acc, f) => acc + (parseFloat(f.total) || 0), 0);
    let totalPedidos = pedidosEntregados.length;
    let promedio = totalPedidos > 0 ? (sumaTotal / totalPedidos) : 0;

    document.getElementById("kpiTotalVentas").innerText = `$${sumaTotal.toFixed(2)}`;
    document.getElementById("kpiCantPedidos").innerText = totalPedidos;
    document.getElementById("kpiTicketPromedio").innerText = `$${promedio.toFixed(2)}`;
}

function abrirModalDetalle(index) {
    indicePedidoSeleccionado = index;
    const pedido = filasFiltradasGlobal[index];
    if (!pedido) return;

    let metodoOriginal = (pedido.metodo_pago || pedido['método de pago'] || 'Mostrador Local').toString();

    document.getElementById("lblCliente").innerText = pedido.cliente || 'General / Local';
    document.getElementById("lblFecha").innerText = pedido.fecha || 'Reciente';
    document.getElementById("lblMetodo").innerText = metodoOriginal;
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

function imprimirTicketDirecto() {
    if (indicePedidoSeleccionado === null) return;
    const p = filasFiltradasGlobal[indicePedidoSeleccionado];

    let itemsHTML = "";
    if (p.productos) {
        p.productos.split("|").forEach(prod => {
            let itemTexto = prod.trim();
            if(itemTexto !== "") {
                itemsHTML += `
                <div style="margin: 4px 0; font-size: 11px; line-height: 1.3;">
                    <span>${itemTexto}</span>
                </div>`;
            }
        });
    }

    const ventanaImp = window.open('', '_blank', 'width=350,height=600');
    ventanaImp.document.write(`
        <html>
        <head>
            <title>Ticket Comanda</title>
            <style>
                body { font-family: monospace; width: 260px; padding: 10px; margin: 0; color: #000; font-size: 12px; }
                .center { text-align: center; }
                .line { border-bottom: 1px dashed #000; margin: 8px 0; }
                .bold { font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="center bold" style="font-size:14px;">TACOS & PAPAS ASADAS</div>
            <div class="center">*** COMANDA DE VENTA ***</div>
            <div class="line"></div>
            <div><b>Fecha:</b> ${p.fecha || 'Hoy'}</div>
            <div><b>Cliente:</b> ${p.cliente || 'General'}</div>
            <div><b>Origen/Pago:</b> ${p.metodo_pago || p['método de pago'] || 'Mostrador'}</div>
            <div><b>Dirección:</b> ${p.direccion || 'Local'}</div>
            <div><b>Estatus:</b> ${p.estatus || 'PENDIENTE'}</div>
            <div class="line"></div>
            <div class="bold" style="margin-bottom:5px;">PLATILLOS & DESGLOSE:</div>
            ${itemsHTML}
            <div class="line"></div>
            <div><b>Notas:</b> ${p.notas || 'Sin instrucciones'}</div>
            <div class="line"></div>
            <div style="font-size:14px;" class="bold">TOTAL: $${(parseFloat(p.total) || 0).toFixed(2)}</div>
            <div class="center" style="margin-top:15px;">¡Gracias por su preferencia!</div>
            <script>
                window.onload = function() { window.print(); window.close(); }
            </script>
        </body>
        </html>
    `);
    ventanaImp.document.close();
}

function generarCierreDelDiaCSV() {
    if (!filasFiltradasGlobal || filasFiltradasGlobal.length === 0) {
        alert("⚠️ No hay pedidos en el rango seleccionado para generar el reporte.");
        return;
    }

    let totalVentasNetas = 0;
    let cantWhatsApp = 0;
    let cantMostrador = 0;
    let cantCancelados = 0;
    let cantPendientes = 0;

    let csvContent = "\uFEFF"; 
    csvContent += "=== REPORTE DE CIERRE DE CAJA / VENTAS ===\n";
    csvContent += `Fecha Generacion,${new Date().toLocaleString()}\n\n`;
    csvContent += "FECHA/HORA,CLIENTE,ESTATUS,CANAL,DIRECCION,PLATILLOS,TOTAL\n";

    filasFiltradasGlobal.forEach(p => {
        let totalNum = parseFloat(p.total) || 0;
        let estatus = p.estatus || "PENDIENTE";

        if (estatus === "CANCELADO") {
            cantCancelados++;
        } else if (estatus === "PENDIENTE") {
            cantPendientes++;
        } else if (estatus === "ENTREGADO") {
            totalVentasNetas += totalNum;
            let metodoPagoTexto = (p.metodo_pago || p['método de pago'] || '').toString().toLowerCase();
            let esCanalWhatsApp = metodoPagoTexto.includes('whatsapp') || (p.gps && p.gps.toString().startsWith("http"));
            if (esCanalWhatsApp) cantWhatsApp++; else cantMostrador++;
        }

        let cliente = `"${(p.cliente || '').replace(/"/g, '""')}"`;
        let direccion = `"${(p.direccion || '').replace(/"/g, '""')}"`;
        let productos = `"${(p.productos || '').replace(/"/g, '""')}"`;
        let canalNombre = (p.metodo_pago || '').toLowerCase().includes('whatsapp') ? "WhatsApp" : "Mostrador";

        csvContent += `"${p.fecha || ''}",${cliente},"${estatus}","${canalNombre}",${direccion},${productos},${totalNum.toFixed(2)}\n`;
    });

    let totalPedidosEntregados = filasFiltradasGlobal.length - (cantCancelados + cantPendientes);

    csvContent += "\n=== RESUMEN GENERAL ===\n";
    csvContent += `PEDIDOS ENTREGADOS,${totalPedidosEntregados}\n`;
    csvContent += `PEDIDOS PENDIENTES,${cantPendientes}\n`;
    csvContent += `PEDIDOS CANCELADOS,${cantCancelados}\n`;
    csvContent += `VENTA NETO REAL ENTREGADA,$${totalVentasNetas.toFixed(2)}\n`;
    csvContent += `TICKET PROMEDIO ENTREGADO,$${(totalPedidosEntregados > 0 ? (totalVentasNetas / totalPedidosEntregados) : 0).toFixed(2)}\n`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    
    const fechaNom = new Date().toISOString().slice(0,10);
    link.setAttribute("href", url);
    link.setAttribute("download", `Cierre_Caja_${fechaNom}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function cerrarModalDetalle() { document.getElementById("detailModal").classList.remove("show"); }

window.onclick = function(event) { 
    if (event.target === document.getElementById("detailModal")) cerrarModalDetalle(); 
    if (event.target === document.getElementById("menuMgmtModal")) cerrarModalGestionMenu(); 
}

function errorTabla(msj) { 
    document.getElementById("tableBodyContainer").innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#ff3344;">❌ ${msj}</td></tr>`; 
}