const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

let products = [];
let cart = {};
let totalVenta = 0;
let ultimaVentaGuardada = null;

// CONTROL DE MESAS Y MEMORIA LOCAL
let modoPosActual = "mostrador";
let listaNombresMesas = ["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6"];
let mesaSeleccionadaActual = null;
let estadoMesasLocal = {};

// GESTIÓN DE TURNO Y CAJA CHICA (LOCALSTORAGE)
let turnoPOS = {
    activo: false,
    fondoInicial: 0,
    gastos: [],
    ventas: [], // Lista de ventas de este turno
    ventasEfectivoTotal: 0,
    ventasTarjetaTotal: 0,
    ventasSpeiTotal: 0
};

document.addEventListener("DOMContentLoaded", () => {
    comprobarSesionPOS();
});

// ==========================================================================
// 0. SEGURIDAD, LOGIN Y FONDO INICIAL
// ==========================================================================
function comprobarSesionPOS() {
    const tokenGuardado = localStorage.getItem("POS_TACOS_TOKEN");
    if (tokenGuardado) {
        ocultarLoginPOS();
        comprobarTurnoAbierto();
    } else {
        mostrarLoginPOS();
    }
}

function mostrarLoginPOS() { document.getElementById("posLoginOverlay").style.display = "flex"; }
function ocultarLoginPOS() { document.getElementById("posLoginOverlay").style.display = "none"; }

function procesarLoginPOS(event) {
    event.preventDefault();
    const pinInput = document.getElementById("inputPinPos").value.trim();
    const btnSubmit = document.getElementById("btnPosLoginSubmit");
    const lblError = document.getElementById("lblErrorPosLogin");

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
        btnSubmit.innerHTML = `<i class="fa-solid fa-unlock"></i> Continuar`;

        if (data.result === "success" && data.token) {
            localStorage.setItem("POS_TACOS_TOKEN", data.token);
            ocultarLoginPOS();
            comprobarTurnoAbierto();
        } else {
            lblError.innerText = "❌ PIN de terminal incorrecto.";
            lblError.style.display = "block";
            document.getElementById("inputPinPos").value = "";
            document.getElementById("inputPinPos").focus();
        }
    })
    .catch(err => {
        console.error(err);
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `<i class="fa-solid fa-unlock"></i> Continuar`;
        lblError.innerText = "❌ Error de conexión al verificar el PIN.";
        lblError.style.display = "block";
    });
}

function comprobarTurnoAbierto() {
    try {
        const turnoGuardado = localStorage.getItem("POS_TURNO_ACTIVO_DATA");
        if (turnoGuardado) {
            turnoPOS = JSON.parse(turnoGuardado);
            if (!turnoPOS.ventas) turnoPOS.ventas = [];
        }
    } catch(e) { console.error(e); }

    if (!turnoPOS.activo) {
        document.getElementById("modalFondoInicial").style.display = "flex";
        setTimeout(() => document.getElementById("inputFondoInicial").focus(), 100);
    } else {
        iniciarTerminalPOS();
    }
}

function guardarFondoInicial(event) {
    event.preventDefault();
    const monto = parseFloat(document.getElementById("inputFondoInicial").value) || 0;
    
    turnoPOS.activo = true;
    turnoPOS.fondoInicial = monto;
    turnoPOS.gastos = [];
    turnoPOS.ventas = [];
    turnoPOS.ventasEfectivoTotal = 0;
    turnoPOS.ventasTarjetaTotal = 0;
    turnoPOS.ventasSpeiTotal = 0;

    localStorage.setItem("POS_TURNO_ACTIVO_DATA", JSON.stringify(turnoPOS));
    document.getElementById("modalFondoInicial").style.display = "none";
    iniciarTerminalPOS();
}

function bloquearTerminalPOS() {
    localStorage.removeItem("POS_TACOS_TOKEN");
    location.reload();
}

function iniciarTerminalPOS() {
    cargarProductosPOS();
    cargarEstadoMesasDesdeMemoria();
}

// ==========================================================================
// 1. GESTIÓN DE HISTORIAL DE VENTAS Y ENVIÓ A WHATSAPP
// ==========================================================================
function abrirModalHistorialVentas() {
    const container = document.getElementById("containerListaHistorialVentas");
    container.innerHTML = "";

    const listaVentas = turnoPOS.ventas || [];

    if (listaVentas.length === 0) {
        container.innerHTML = "<p style='color:#666; text-align:center; padding:30px;'>No hay ventas registradas en este turno.</p>";
    } else {
        // Mostramos las más recientes primero
        [...listaVentas].reverse().forEach((v, indexOriginal) => {
            const indexReal = listaVentas.length - 1 - indexOriginal;
            const card = document.createElement("div");
            card.className = "history-item-card";

            let productosCorta = (v.productos || "").replace(/\|/g, ", ");

            card.innerHTML = `
                <div style="display:flex; flex-direction:column; max-width:60%;">
                    <span style="color:#fff; font-weight:800; font-size:0.9rem;">${v.nombre}</span>
                    <span style="color:#888; font-size:0.75rem;">${v.fecha} (${v.metodo_pago})</span>
                    <span style="color:#aaa; font-size:0.75rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${productosCorta}">${productosCorta}</span>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                    <strong style="color:#ff944d; font-size:1rem;">$${parseFloat(v.total).toFixed(2)}</strong>
                    <div style="display:flex; gap:6px;">
                        <button onclick="enviarVentaEspecificaWhatsApp(${indexReal})" style="background:#25D366; color:#fff; border:none; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:800; cursor:pointer;" title="Enviar por WhatsApp">
                            <i class="fa-brands fa-whatsapp"></i> WhatsApp
                        </button>
                        <button onclick="reimprimirTicketGenerico(${indexReal})" style="background:#222; color:#fff; border:1px solid rgba(255,255,255,0.1); padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:800; cursor:pointer;" title="Imprimir Ticket">
                            <i class="fa-solid fa-print"></i>
                        </button>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    document.getElementById("modalHistorialVentas").style.display = "flex";
}

function cerrarModalHistorialVentas() {
    document.getElementById("modalHistorialVentas").style.display = "none";
}

function generarTextoWhatsAppTicket(v) {
    let itemsTexto = "";
    if (v.productos) {
        v.productos.split("|").forEach(prod => {
            if (prod.trim() !== "") itemsTexto += `• ${prod.trim()}\n`;
        });
    }

    let msg = `📄 *TACOS & PAPAS ASADAS*\n`;
    msg += `_Comprobante de Compra_\n`;
    msg += `----------------------------------\n`;
    msg += `📅 *Fecha:* ${v.fecha}\n`;
    msg += `👤 *Lugar/Cliente:* ${v.nombre}\n`;
    msg += `💳 *Método de Pago:* ${v.metodo_pago}\n`;
    if (v.notas && v.notas !== "Venta local") msg += `📝 *Notas:* ${v.notas}\n`;
    msg += `----------------------------------\n`;
    msg += `🛒 *DESGLOSE:*\n${itemsTexto}`;
    msg += `----------------------------------\n`;
    msg += `💰 *TOTAL: $${parseFloat(v.total).toFixed(2)}*\n`;
    if (v.metodo_pago === 'Efectivo') {
        msg += `💵 *Pagó con:* $${parseFloat(v.efectivo_recibido).toFixed(2)}\n`;
        msg += `🪙 *Cambio:* $${parseFloat(v.cambio).toFixed(2)}\n`;
    }
    msg += `\n¡Muchas gracias por su compra! 🔥`;

    return encodeURIComponent(msg);
}

function enviarUltimaVentaWhatsApp() {
    if (!ultimaVentaGuardada) return;
    const textoUrl = generarTextoWhatsAppTicket(ultimaVentaGuardada);
    window.open(`https://api.whatsapp.com/send?text=${textoUrl}`, '_blank');
    limpiarFormularioPOS();
    document.getElementById("printConfirmModal").style.display = "none";
}

function enviarVentaEspecificaWhatsApp(index) {
    const v = turnoPOS.ventas[index];
    if (!v) return;
    const textoUrl = generarTextoWhatsAppTicket(v);
    window.open(`https://api.whatsapp.com/send?text=${textoUrl}`, '_blank');
}

function reimprimirTicketGenerico(index) {
    const v = turnoPOS.ventas[index];
    if (v) imprimirTicketPOS(v);
}

// ==========================================================================
// 2. GESTIÓN DE SALIDAS DE EFECTIVO (GASTOS DE CAJA)
// ==========================================================================
function abrirModalGastoPOS() {
    document.getElementById("gastoMonto").value = "";
    document.getElementById("gastoConcepto").value = "";
    document.getElementById("modalGastoCaja").style.display = "flex";
    setTimeout(() => document.getElementById("gastoMonto").focus(), 100);
}

function cerrarModalGastoPOS() {
    document.getElementById("modalGastoCaja").style.display = "none";
}

function registrarGastoCajaPOS(event) {
    event.preventDefault();
    const monto = parseFloat(document.getElementById("gastoMonto").value) || 0;
    const concepto = document.getElementById("gastoConcepto").value.trim();

    if (monto <= 0 || !concepto) {
        alert("⚠️ Ingresa un monto válido y un concepto.");
        return;
    }

    if (!turnoPOS.gastos) turnoPOS.gastos = [];
    turnoPOS.gastos.push({ monto: monto, concepto: concepto, hora: new Date().toLocaleTimeString() });

    localStorage.setItem("POS_TURNO_ACTIVO_DATA", JSON.stringify(turnoPOS));
    cerrarModalGastoPOS();
    alert(`✅ Salida de $${monto.toFixed(2)} registrada correctamente.`);
}

// ==========================================================================
// 3. ARQUEO Y CORTE DE CAJA
// ==========================================================================
function abrirModalCorteCaja() {
    let totalGastos = 0;
    if (turnoPOS.gastos) {
        turnoPOS.gastos.forEach(g => totalGastos += g.monto);
    }

    const efectivoEsperado = (turnoPOS.fondoInicial || 0) + (turnoPOS.ventasEfectivoTotal || 0) - totalGastos;

    document.getElementById("corteFondo").innerText = `$${(turnoPOS.fondoInicial || 0).toFixed(2)}`;
    document.getElementById("corteVentasEfectivo").innerText = `$${(turnoPOS.ventasEfectivoTotal || 0).toFixed(2)}`;
    document.getElementById("corteGastos").innerText = `$${totalGastos.toFixed(2)}`;
    document.getElementById("corteEfectivoEsperado").innerText = `$${efectivoEsperado.toFixed(2)}`;

    document.getElementById("corteTarjeta").innerText = `$${(turnoPOS.ventasTarjetaTotal || 0).toFixed(2)}`;
    document.getElementById("corteSpei").innerText = `$${(turnoPOS.ventasSpeiTotal || 0).toFixed(2)}`;

    document.getElementById("efectivoContado").value = "";
    document.getElementById("lblDiferenciaCaja").innerText = "";
    document.getElementById("modalCorteCaja").style.display = "flex";
    setTimeout(() => document.getElementById("efectivoContado").focus(), 100);
}

function cerrarModalCorteCaja() {
    document.getElementById("modalCorteCaja").style.display = "none";
}

function calcularDiferenciaCaja() {
    let totalGastos = 0;
    if (turnoPOS.gastos) turnoPOS.gastos.forEach(g => totalGastos += g.monto);
    const efectivoEsperado = (turnoPOS.fondoInicial || 0) + (turnoPOS.ventasEfectivoTotal || 0) - totalGastos;

    const contadoInput = parseFloat(document.getElementById("efectivoContado").value);
    const lblDif = document.getElementById("lblDiferenciaCaja");

    if (isNaN(contadoInput)) {
        lblDif.innerText = "";
        return;
    }

    const diferencia = contadoInput - efectivoEsperado;
    if (diferencia === 0) {
        lblDif.innerHTML = "✅ ¡Caja cuadrada exacto!";
        lblDif.style.color = "#25D366";
    } else if (diferencia > 0) {
        lblDif.innerHTML = `⚠️ Sobrante en caja: +$${diferencia.toFixed(2)}`;
        lblDif.style.color = "#ff944d";
    } else {
        lblDif.innerHTML = `❌ Faltante en caja: -$${Math.abs(diferencia).toFixed(2)}`;
        lblDif.style.color = "#ff3344";
    }
}

function imprimirTicketCorte() {
    let totalGastos = 0;
    let gastosHTML = "";
    if (turnoPOS.gastos && turnoPOS.gastos.length > 0) {
        turnoPOS.gastos.forEach(g => {
            totalGastos += g.monto;
            gastosHTML += `<div>- ${g.concepto}: $${g.monto.toFixed(2)}</div>`;
        });
    } else {
        gastosHTML = `<div>Ninguna salida registrada</div>`;
    }

    const efectivoEsperado = (turnoPOS.fondoInicial || 0) + (turnoPOS.ventasEfectivoTotal || 0) - totalGastos;
    const contado = parseFloat(document.getElementById("efectivoContado").value) || 0;
    const diferencia = contado - efectivoEsperado;

    const ventanaImp = window.open('', '_blank', 'width=350,height=600');
    ventanaImp.document.write(`
        <html>
        <head>
            <title>Corte de Turno POS</title>
            <style>
                body { font-family: monospace; width: 260px; padding: 10px; margin: 0; color: #000; font-size: 12px; }
                .center { text-align: center; }
                .line { border-bottom: 1px dashed #000; margin: 8px 0; }
                .bold { font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="center bold" style="font-size:14px;">TACOS & PAPAS ASADAS</div>
            <div class="center">*** CORTE DE CAJA ***</div>
            <div class="line"></div>
            <div><b>Fecha:</b> ${new Date().toLocaleString('es-MX')}</div>
            <div class="line"></div>
            <div>Fondo Inicial: $${(turnoPOS.fondoInicial || 0).toFixed(2)}</div>
            <div>Ventas Efectivo: $${(turnoPOS.ventasEfectivoTotal || 0).toFixed(2)}</div>
            <div>Salidas / Gastos: $${totalGastos.toFixed(2)}</div>
            ${gastosHTML}
            <div class="line"></div>
            <div class="bold">EFECTIVO ESPERADO: $${efectivoEsperado.toFixed(2)}</div>
            <div>Efectivo Contado: $${contado.toFixed(2)}</div>
            <div class="bold">Diferencia: $${diferencia.toFixed(2)}</div>
            <div class="line"></div>
            <div>Ventas Tarjeta: $${(turnoPOS.ventasTarjetaTotal || 0).toFixed(2)}</div>
            <div>Ventas SPEI: $${(turnoPOS.ventasSpeiTotal || 0).toFixed(2)}</div>
            <div class="center" style="margin-top:15px;">--- FIN DEL CORTE ---</div>
            <script>
                window.onload = function() { window.print(); window.close(); }
            </script>
        </body>
        </html>
    `);
    ventanaImp.document.close();
}

function cerrarTurnoPOS() {
    if (!confirm("⚠️ ¿Estás seguro de cerrar el turno actual? Se cerrará la sesión y se reiniciarán los contadores de caja.")) return;
    
    localStorage.removeItem("POS_TURNO_ACTIVO_DATA");
    localStorage.removeItem("POS_TACOS_TOKEN");
    location.reload();
}

// ==========================================================================
// 4. GESTIÓN DE MESAS Y CATÁLOGO
// ==========================================================================
function cargarEstadoMesasDesdeMemoria() {
    try {
        const guardado = localStorage.getItem("POS_ESTADO_MESAS_TACOS");
        if (guardado) estadoMesasLocal = JSON.parse(guardado);
    } catch(e) { console.error(e); }
}

function guardarEstadoMesasEnMemoria() {
    try {
        localStorage.setItem("POS_ESTADO_MESAS_TACOS", JSON.stringify(estadoMesasLocal));
    } catch(e) { console.error(e); }
}

function cambiarModoPOS(modo) {
    modoPosActual = modo;
    const btnMostrador = document.getElementById("btnModoMostrador");
    const btnMesas = document.getElementById("btnModoMesas");
    const panelMesas = document.getElementById("mesasPanelContainer");
    const btnGuardarMesa = document.getElementById("btnGuardarMesaTemporal");
    const btnPreCuenta = document.getElementById("btnPreCuentaMesa");

    if (modo === "mesas") {
        btnMostrador.classList.remove("active");
        btnMesas.classList.add("active");
        panelMesas.style.display = "block";
        btnGuardarMesa.style.display = "block";
        btnPreCuenta.style.display = "inline-block";
        renderizarGridMesas();
        if (!mesaSeleccionadaActual) seleccionarMesa("Mesa 1");
    } else {
        btnMesas.classList.remove("active");
        btnMostrador.classList.add("active");
        panelMesas.style.display = "none";
        btnGuardarMesa.style.display = "none";
        btnPreCuenta.style.display = "none";
        mesaSeleccionadaActual = null;
        cart = {};
        document.getElementById("lblTituloTicket").innerText = "Detalle del Ticket";
        actualizarUIPOS();
    }
}

function renderizarGridMesas() {
    const container = document.getElementById("mesasGridContainer");
    if (!container) return;
    container.innerHTML = "";

    listaNombresMesas.forEach(nombreMesa => {
        const datosMesa = estadoMesasLocal[nombreMesa];
        const tieneConsumo = datosMesa && datosMesa.cart && Object.keys(datosMesa.cart).length > 0;
        
        let subtotalMesa = 0;
        if (tieneConsumo) {
            Object.keys(datosMesa.cart).forEach(id => {
                subtotalMesa += datosMesa.cart[id].price * datosMesa.cart[id].quantity;
            });
        }

        const esSeleccionada = (mesaSeleccionadaActual === nombreMesa);
        const card = document.createElement("div");
        card.className = `mesa-card ${tieneConsumo ? 'ocupada' : 'libre'} ${esSeleccionada ? 'seleccionada' : ''}`;
        card.onclick = () => seleccionarMesa(nombreMesa);

        card.innerHTML = `
            <span class="mesa-title">${nombreMesa}</span>
            <span class="mesa-status-badge">${tieneConsumo ? `$${subtotalMesa.toFixed(2)}` : 'Libre'}</span>
        `;
        container.appendChild(card);
    });
}

function seleccionarMesa(nombreMesa) {
    mesaSeleccionadaActual = nombreMesa;
    document.getElementById("lblMesaSeleccionadaInfo").innerText = `Mesa activa: ${nombreMesa}`;
    document.getElementById("lblTituloTicket").innerText = `Ticket (${nombreMesa})`;

    if (estadoMesasLocal[nombreMesa] && estadoMesasLocal[nombreMesa].cart) {
        cart = JSON.parse(JSON.stringify(estadoMesasLocal[nombreMesa].cart));
        if (document.getElementById("posNotes")) {
            document.getElementById("posNotes").value = estadoMesasLocal[nombreMesa].notas || "";
        }
    } else {
        cart = {};
        if (document.getElementById("posNotes")) document.getElementById("posNotes").value = "";
    }
    renderizarGridMesas();
    actualizarUIPOS();
}

function guardarComandaAMesaActual() {
    if (!mesaSeleccionadaActual) return;
    const notas = document.getElementById("posNotes").value.trim();

    if (Object.keys(cart).length === 0) {
        delete estadoMesasLocal[mesaSeleccionadaActual];
    } else {
        estadoMesasLocal[mesaSeleccionadaActual] = { cart: JSON.parse(JSON.stringify(cart)), notas: notas };
    }

    guardarEstadoMesasEnMemoria();
    renderizarGridMesas();

    const btn = document.getElementById("btnGuardarMesaTemporal");
    btn.innerHTML = "<i class='fa-solid fa-check'></i> ¡Guardado!";
    setTimeout(() => { btn.innerHTML = "<i class='fa-solid fa-floppy-disk'></i> Guardar a Mesa"; }, 1500);
}

function imprimirPreCuentaMesa() {
    if (Object.keys(cart).length === 0) {
        alert("⚠️ No hay consumos registrados en esta mesa.");
        return;
    }

    let itemsHTML = "";
    let subtotalCalc = 0;
    Object.keys(cart).forEach(id => {
        const item = cart[id];
        const sub = item.price * item.quantity;
        subtotalCalc += sub;
        itemsHTML += `<div style="display:flex; justify-content:space-between; margin: 4px 0; font-size: 11px;"><span>${item.quantity}x ${item.name}</span><span>$${sub.toFixed(2)}</span></div>`;
    });

    const ventanaImp = window.open('', '_blank', 'width=350,height=600');
    ventanaImp.document.write(`
        <html><head><title>Pre-Cuenta ${mesaSeleccionadaActual}</title><style>body{font-family:monospace;width:260px;padding:10px;margin:0;font-size:12px;}.center{text-align:center;}.line{border-bottom:1px dashed #000;margin:8px 0;}.bold{font-weight:bold;}</style></head>
        <body>
            <div class="center bold" style="font-size:14px;">TACOS & PAPAS ASADAS</div>
            <div class="center">*** PRE-CUENTA ***</div>
            <div class="line"></div>
            <div><b>Lugar:</b> ${mesaSeleccionadaActual}</div>
            <div><b>Fecha:</b> ${new Date().toLocaleString('es-MX')}</div>
            <div class="line"></div>
            ${itemsHTML}
            <div class="line"></div>
            <div style="font-size:14px;" class="bold">TOTAL: $${subtotalCalc.toFixed(2)}</div>
            <div class="center" style="margin-top:15px;">¡Gracias!</div>
            <script>window.onload = function() { window.print(); window.close(); }</script>
        </body></html>
    `);
    ventanaImp.document.close();
}

function cargarProductosPOS() {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "<p style='color:#ff5500; text-align:center; padding:40px;'><i class='fa-solid fa-circle-notch fa-spin'></i> Sincronizando Caja...</p>";
    
    fetch(GOOGLE_SCRIPT_URL, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        products = (data.productos || []).filter(p => p.id && p.nombre);
        generarCategoriasDinamicasPOS(products);
        renderMenuPOS(products);
    })
    .catch(err => {
        console.error(err);
        container.innerHTML = "<p style='color:#ff3344; text-align:center;'>❌ Error de conexión al sincronizar.</p>";
    });
}

function generarCategoriasDinamicasPOS(productsArray) {
    const nav = document.getElementById("categoriesNav");
    if (!nav) return;
    const categoriasUnicas = new Set();
    productsArray.forEach(p => { if (p.categoria) categoriasUnicas.add(p.categoria.toString().trim()); });

    let htmlBotones = `<button class="category-btn active" onclick="filterCategory('todos', event)">Todos</button>`;
    categoriasUnicas.forEach(cat => { htmlBotones += `<button class="category-btn" onclick="filterCategory('${cat}', event)">${cat}</button>`; });
    nav.innerHTML = htmlBotones;
}

function renderMenuPOS(productsArray) {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "";

    if (!productsArray || productsArray.length === 0) {
        container.innerHTML = "<p style='color:#666; padding:20px; text-align:center;'>No hay productos disponibles.</p>";
        return;
    }

    productsArray.forEach(product => {
        const prodId = product.id.toString().trim();
        let precioFinal = parseFloat(product.precio ? product.precio.toString().replace(/[^0-9.]/g, '') : "0") || 0;
        const estaAgotado = product.agotado && product.agotado.toString().trim().toUpperCase() === "SI";

        const card = document.createElement("div");
        card.className = `pos-card ${estaAgotado ? 'pos-card-agotado' : ''}`;
        card.id = `product-card-${prodId}`;
        if (!estaAgotado) card.onclick = () => agregarAlCarritoPOS(prodId);

        card.innerHTML = `
            <h3>${product.nombre}</h3>
            ${estaAgotado ? '<span class="pos-badge-agotado"><i class="fa-solid fa-ban"></i> AGOTADO</span>' : `<span class="price">$${precioFinal.toFixed(2)}</span>`}
        `;
        container.appendChild(card);
    });
}

function buscarProducto() {
    const query = document.getElementById("posSearch").value.toLowerCase().trim();
    document.getElementById("clearSearchBtn").style.display = query !== "" ? "block" : "none";
    renderMenuPOS(products.filter(p => p.nombre.toLowerCase().includes(query)));
}

function limpiarBuscador() {
    document.getElementById("posSearch").value = "";
    document.getElementById("clearSearchBtn").style.display = "none";
    renderMenuPOS(products);
}

function filterCategory(category, evt) {
    document.querySelectorAll(".category-btn").forEach(btn => btn.classList.remove("active"));
    if (evt && evt.target) evt.target.classList.add("active");
    if (category === 'todos') renderMenuPOS(products);
    else renderMenuPOS(products.filter(p => p.categoria && p.categoria.toString().trim().toLowerCase() === category.toLowerCase()));
}

function agregarAlCarritoPOS(productId) {
    const cardElement = document.getElementById(`product-card-${productId}`);
    if (cardElement) {
        cardElement.classList.add("flash-effect");
        setTimeout(() => cardElement.classList.remove("flash-effect"), 350);
    }

    if (cart[productId]) {
        cart[productId].quantity += 1;
    } else {
        const product = products.find(p => p.id.toString().trim() === productId);
        let precioLimpio = product.precio.toString().replace(/[^0-9.]/g, '');
        cart[productId] = { name: product.nombre, price: parseFloat(precioLimpio) || 0, quantity: 1 };
    }
    actualizarUIPOS();
}

function cambiarCantidadPOS(productId, cambio) {
    if (!cart[productId]) return;
    cart[productId].quantity += cambio;
    if (cart[productId].quantity <= 0) delete cart[productId];
    actualizarUIPOS();
}

function toggleControlEnvio() {
    const chk = document.getElementById("chkEnvio");
    document.getElementById("containerMontoEnvio").style.display = chk.checked ? "flex" : "none";
    actualizarUIPOS();
}

function actualizarUIPOS() {
    const list = document.getElementById("posItemsList");
    list.innerHTML = "";
    totalVenta = 0;

    let subtotalProductos = 0;
    Object.keys(cart).forEach(id => { subtotalProductos += cart[id].price * cart[id].quantity; });

    const chkEnvio = document.getElementById("chkEnvio");
    let costoEnvio = (chkEnvio && chkEnvio.checked) ? (parseFloat(document.getElementById("montoEnvio").value) || 0) : 0;
    totalVenta = subtotalProductos + costoEnvio;

    if (Object.keys(cart).length === 0 && !chkEnvio.checked) {
        list.innerHTML = '<p style="color: #555; text-align: center; padding-top: 30px; font-size:0.85rem;">🎟️ Selecciona productos.</p>';
        document.getElementById("posTotal").innerText = "$0.00";
        calcularCambio();
        return;
    }

    Object.keys(cart).forEach(id => {
        const item = cart[id];
        const sub = item.price * item.quantity;
        const row = document.createElement("div");
        row.className = "ticket-row";
        row.innerHTML = `
            <div style="display:flex; flex-direction:column; max-width:60%;">
                <span style="font-weight:600; color:#fff; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name}</span>
                <span style="font-size:0.75rem; color:#666;">$${item.price.toFixed(2)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:700; color:#ff944d; font-size:0.85rem;">$${sub.toFixed(2)}</span>
                <div class="ticket-controls">
                    <button class="ticket-btn" onclick="cambiarCantidadPOS('${id}', -1)">-</button>
                    <span style="font-size:0.85rem; font-weight:800; min-width:16px; text-align:center; color:#fff;">${item.quantity}</span>
                    <button class="ticket-btn" onclick="cambiarCantidadPOS('${id}', 1)">+</button>
                </div>
            </div>`;
        list.appendChild(row);
    });

    if (chkEnvio.checked) {
        const rowEnvio = document.createElement("div");
        rowEnvio.className = "ticket-row";
        rowEnvio.style.background = "rgba(255, 85, 0, 0.05)";
        rowEnvio.innerHTML = `<span style="font-weight:700; color:#ff5500; font-size:0.85rem;">🚚 Envío</span><span style="font-weight:700; color:#ff944d; font-size:0.85rem;">$${costoEnvio.toFixed(2)}</span>`;
        list.appendChild(rowEnvio);
    }

    document.getElementById("posTotal").innerText = `$${totalVenta.toFixed(2)}`;
    calcularCambio();
}

function alternarCamposEfectivo() {
    const method = document.getElementById("posPaymentMethod").value;
    const inputCtrl = document.getElementById("efectivoInputControl");
    const fastSection = document.getElementById("fastCashSection");
    const changeSection = document.getElementById("efectivoSection");
    
    if (method === "Efectivo") {
        inputCtrl.style.display = "block";
        fastSection.style.display = "grid";
        changeSection.style.display = "flex";
    } else {
        inputCtrl.style.display = "none";
        fastSection.style.display = "none";
        changeSection.style.display = "none";
        document.getElementById("pagaCon").value = "";
        document.getElementById("cambioAEntregar").innerText = "$0.00";
    }
}

function rapidoEfectivo(denominacion) {
    document.getElementById("pagaCon").value = denominacion;
    calcularCambio();
}

function calcularCambio() {
    const pagaCon = parseFloat(document.getElementById("pagaCon").value) || 0;
    const cambioBox = document.getElementById("cambioAEntregar");

    if (pagaCon === 0 || pagaCon < totalVenta) {
        cambioBox.innerText = "$0.00";
        cambioBox.style.color = "#ff3344";
    } else {
        const cambio = pagaCon - totalVenta;
        cambioBox.innerText = `$${cambio.toFixed(2)}`;
        cambioBox.style.color = "#25D366";
    }
}

function procesarVentaPOS() {
    const chkEnvio = document.getElementById("chkEnvio");
    if (Object.keys(cart).length === 0 && (!chkEnvio || !chkEnvio.checked)) return;

    const method = document.getElementById("posPaymentMethod").value;
    const pagaCon = parseFloat(document.getElementById("pagaCon").value) || totalVenta;
    const notas = document.getElementById("posNotes").value.trim() || "Venta local";

    if (method === "Efectivo" && pagaCon < totalVenta) {
        alert("⚠️ El monto pagado es menor al total.");
        return;
    }

    let arrProductos = Object.keys(cart).map(id => {
        const item = cart[id];
        return `${item.quantity}x ${item.name} ($${item.price.toFixed(2)} c/u = $${(item.price * item.quantity).toFixed(2)})`;
    });

    if (chkEnvio && chkEnvio.checked) {
        let costoEnvio = parseFloat(document.getElementById("montoEnvio").value) || 0;
        arrProductos.push(`1x 🚚 Envío ($${costoEnvio.toFixed(2)})`);
    }

    let productosString = arrProductos.join(" | ");
    const cambioEntregado = method === "Efectivo" ? (pagaCon - totalVenta) : 0;
    const fechaHoraActual = new Date().toLocaleString('es-MX');

    let etiquetaCliente = (modoPosActual === "mesas" && mesaSeleccionadaActual) ? `Consumo en ${mesaSeleccionadaActual}` : "Venta Local Mostrador";

    const ventaData = {
        fecha: fechaHoraActual,
        nombre: etiquetaCliente,
        direccion: `Sucursal (${method})`,
        referencias: "POS Pro Console",
        gps: "No Aplica",
        productos: productosString,
        total: totalVenta,
        notas: notas,
        metodo_pago: method,
        efectivo_recibido: pagaCon,
        cambio: cambioEntregado
    };

    ultimaVentaGuardada = { ...ventaData };

    // ACUMULAR EN EL TURNO ACTIVO
    if (method === "Efectivo") turnoPOS.ventasEfectivoTotal = (turnoPOS.ventasEfectivoTotal || 0) + totalVenta;
    else if (method === "Tarjeta") turnoPOS.ventasTarjetaTotal = (turnoPOS.ventasTarjetaTotal || 0) + totalVenta;
    else if (method === "Transferencia") turnoPOS.ventasSpeiTotal = (turnoPOS.ventasSpeiTotal || 0) + totalVenta;

    if (!turnoPOS.ventas) turnoPOS.ventas = [];
    turnoPOS.ventas.push(ventaData);

    localStorage.setItem("POS_TURNO_ACTIVO_DATA", JSON.stringify(turnoPOS));

    const btn = document.getElementById("btnRegistrarVenta");
    btn.disabled = true;
    btn.innerHTML = "<i class='fa-solid fa-circle-notch fa-spin' style='color:#ff5500;'></i> Procesando...";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ventaData)
    })
    .then(() => {
        btn.disabled = false;
        btn.innerHTML = "<i class='fa-solid fa-bolt'></i> Registrar Venta";
        
        if (modoPosActual === "mesas" && mesaSeleccionadaActual) {
            delete estadoMesasLocal[mesaSeleccionadaActual];
            guardarEstadoMesasEnMemoria();
            renderizarGridMesas();
        }
        document.getElementById("printConfirmModal").style.display = "flex";
    })
    .catch(err => {
        console.error(err);
        btn.disabled = false;
        btn.innerHTML = "<i class='fa-solid fa-triangle-exclamation'></i> Reintentar";
    });
}

function confirmarImpresionYFinalizar() {
    if (ultimaVentaGuardada) imprimirTicketPOS(ultimaVentaGuardada);
    limpiarFormularioPOS();
    document.getElementById("printConfirmModal").style.display = "none";
}

function cerrarModalImpresionSinImprimir() {
    limpiarFormularioPOS();
    document.getElementById("printConfirmModal").style.display = "none";
}

function limpiarFormularioPOS() {
    cart = {};
    const chkEnvio = document.getElementById("chkEnvio");
    if (chkEnvio) chkEnvio.checked = false;
    toggleControlEnvio();
    document.getElementById("posNotes").value = "";
    document.getElementById("pagaCon").value = "";
    actualizarUIPOS();
}

function imprimirTicketPOS(v) {
    let itemsHTML = "";
    if (v.productos) {
        v.productos.split("|").forEach(prod => {
            if(prod.trim() !== "") itemsHTML += `<div style="margin: 4px 0; font-size: 11px;">${prod.trim()}</div>`;
        });
    }

    const ventanaImp = window.open('', '_blank', 'width=350,height=600');
    ventanaImp.document.write(`
        <html><head><title>Ticket POS</title><style>body{font-family:monospace;width:260px;padding:10px;margin:0;font-size:12px;}.center{text-align:center;}.line{border-bottom:1px dashed #000;margin:8px 0;}.bold{font-weight:bold;}</style></head>
        <body>
            <div class="center bold" style="font-size:14px;">TACOS & PAPAS ASADAS</div>
            <div class="center">*** TICKET DE VENTA ***</div>
            <div class="line"></div>
            <div><b>Fecha:</b> ${v.fecha}</div>
            <div><b>Lugar:</b> ${v.nombre}</div>
            <div><b>Pago:</b> ${v.metodo_pago}</div>
            <div><b>Notas:</b> ${v.notas}</div>
            <div class="line"></div>
            ${itemsHTML}
            <div class="line"></div>
            <div style="font-size:14px;" class="bold">TOTAL: $${parseFloat(v.total).toFixed(2)}</div>
            ${v.metodo_pago === 'Efectivo' ? `<div>Paga Con: $${parseFloat(v.efectivo_recibido).toFixed(2)}</div><div>Cambio: $${parseFloat(v.cambio).toFixed(2)}</div>` : ''}
            <div class="center" style="margin-top:15px;">¡Gracias!</div>
            <script>window.onload = function() { window.print(); window.close(); }</script>
        </body></html>
    `);
    ventanaImp.document.close();
}

function abrirModalOtroProducto() {
    document.getElementById("customProdName").value = "";
    document.getElementById("customProdPrice").value = "";
    document.getElementById("customProdQty").value = "1";
    document.getElementById("customProductModal").style.display = "flex";
    setTimeout(() => document.getElementById("customProdName").focus(), 100);
}

function cerrarModalOtroProducto() { document.getElementById("customProductModal").style.display = "none"; }

function agregarProductoEspecialAlCarrito(event) {
    event.preventDefault();
    const nombre = document.getElementById("customProdName").value.trim();
    const precio = parseFloat(document.getElementById("customProdPrice").value) || 0;
    const cantidad = parseInt(document.getElementById("customProdQty").value, 10) || 1;

    if (!nombre || precio <= 0) {
        alert("⚠️ Ingresa nombre y precio válidos.");
        return;
    }

    cart["CUSTOM_" + Date.now()] = { name: `⭐ ${nombre}`, price: precio, quantity: cantidad };
    actualizarUIPOS();
    cerrarModalOtroProducto();
}