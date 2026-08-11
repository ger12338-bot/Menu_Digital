// ==========================================================================
// ENDPOINT DE CONEXIÓN CON GOOGLE APPS SCRIPT
// ==========================================================================
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

let products = [];
let cart = {};
let totalVenta = 0;
let ultimaVentaGuardada = null; // Variable para almacenar los datos de la última venta e imprimir el ticket

document.addEventListener("DOMContentLoaded", () => {
    cargarProductosPOS();
});

// ==========================================================================
// 1. CARGA DE MENÚ PARA LA TERMINAL POS
// ==========================================================================
function cargarProductosPOS() {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "<p style='color:#ff5500; text-align:center; padding:40px; font-size:1rem;'><i class='fa-solid fa-circle-notch fa-spin'></i> Sincronizando Caja...</p>";
    
    fetch(GOOGLE_SCRIPT_URL, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        const listaProductos = data.productos || [];
        products = listaProductos.filter(p => p.id && p.nombre);
        generarCategoriasDinamicasPOS(products);
        renderMenuPOS(products);
    })
    .catch(err => {
        console.error("Error en POS de red:", err);
        container.innerHTML = "<p style='color:#ff3344; text-align:center;'>❌ Error de conexión al sincronizar la base de datos.</p>";
    });
}

function generarCategoriasDinamicasPOS(productsArray) {
    const nav = document.getElementById("categoriesNav");
    if (!nav) return;

    const categoriasUnicas = new Set();
    productsArray.forEach(p => {
        if (p.categoria && p.categoria.toString().trim() !== "") {
            categoriasUnicas.add(p.categoria.toString().trim());
        }
    });

    let htmlBotones = `<button class="category-btn active" onclick="filterCategory('todos', event)">Todos</button>`;
    categoriasUnicas.forEach(cat => {
        htmlBotones += `<button class="category-btn" onclick="filterCategory('${cat}', event)">${cat}</button>`;
    });

    nav.innerHTML = htmlBotones;
}

// ==========================================================================
// 2. RENDERIZADO DE MENÚ POS
// ==========================================================================
function renderMenuPOS(productsArray) {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "";

    if (!productsArray || productsArray.length === 0) {
        container.innerHTML = "<p style='color:#666; padding:20px; text-align:center;'>No hay productos disponibles.</p>";
        return;
    }

    productsArray.forEach(product => {
        const prodId = product.id.toString().trim();
        let precioLimpio = product.precio ? product.precio.toString().replace(/[^0-9.]/g, '') : "0";
        let precioFinal = parseFloat(precioLimpio) || 0;

        const estaAgotado = product.agotado && product.agotado.toString().trim().toUpperCase() === "SI";

        const card = document.createElement("div");
        card.className = `pos-card ${estaAgotado ? 'pos-card-agotado' : ''}`;
        card.id = `product-card-${prodId}`;
        
        if (!estaAgotado) {
            card.onclick = () => agregarAlCarritoPOS(prodId);
        }

        card.innerHTML = `
            <h3>${product.nombre}</h3>
            ${estaAgotado 
                ? '<span class="pos-badge-agotado"><i class="fa-solid fa-ban"></i> AGOTADO</span>' 
                : `<span class="price">$${precioFinal.toFixed(2)}</span>`
            }
        `;
        container.appendChild(card);
    });
}

// ==========================================================================
// 3. BUSCADOR Y FILTROS
// ==========================================================================
function buscarProducto() {
    const query = document.getElementById("posSearch").value.toLowerCase().trim();
    const clearBtn = document.getElementById("clearSearchBtn");
    
    clearBtn.style.display = query !== "" ? "block" : "none";

    const filtrados = products.filter(p => p.nombre.toLowerCase().includes(query));
    renderMenuPOS(filtrados);
}

function limpiarBuscador() {
    document.getElementById("posSearch").value = "";
    document.getElementById("clearSearchBtn").style.display = "none";
    renderMenuPOS(products);
}

function filterCategory(category, evt) {
    const buttons = document.querySelectorAll(".category-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    
    if (evt && evt.target) {
        evt.target.classList.add("active");
    }

    if (category === 'todos') {
        renderMenuPOS(products);
    } else {
        const filtrados = products.filter(p => p.categoria && p.categoria.toString().trim().toLowerCase() === category.toLowerCase());
        renderMenuPOS(filtrados);
    }
}

// ==========================================================================
// 4. CARRITO Y TICKET
// ==========================================================================
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
    const container = document.getElementById("containerMontoEnvio");
    if (container) {
        container.style.display = chk.checked ? "flex" : "none";
    }
    actualizarUIPOS();
}

function actualizarUIPOS() {
    const list = document.getElementById("posItemsList");
    list.innerHTML = "";
    totalVenta = 0;

    let subtotalProductos = 0;
    Object.keys(cart).forEach(id => {
        const item = cart[id];
        subtotalProductos += item.price * item.quantity;
    });

    const chkEnvio = document.getElementById("chkEnvio");
    const estaEnvioActivo = chkEnvio && chkEnvio.checked;
    let costoEnvio = 0;
    if (estaEnvioActivo) {
        costoEnvio = parseFloat(document.getElementById("montoEnvio").value) || 0;
    }

    totalVenta = subtotalProductos + costoEnvio;

    if (Object.keys(cart).length === 0 && !estaEnvioActivo) {
        list.innerHTML = '<p style="color: #555; text-align: center; padding-top: 30px; font-size:0.85rem;">🎟️ Selecciona productos del menú.</p>';
        document.getElementById("posTotal").innerText = "$0.00";
        calcularCambio();
        return;
    }

    Object.keys(cart).forEach(id => {
        const item = cart[id];
        const subtotal = item.price * item.quantity;

        const row = document.createElement("div");
        row.className = "ticket-row";
        row.innerHTML = `
            <div style="display:flex; flex-direction:column; max-width:60%;">
                <span style="font-weight:600; color:#fff; font-size:0.85rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name}</span>
                <span style="font-size:0.75rem; color:#666;">$${item.price.toFixed(2)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:700; color:#ff944d; font-size:0.85rem;">$${subtotal.toFixed(2)}</span>
                <div class="ticket-controls">
                    <button class="ticket-btn" onclick="cambiarCantidadPOS('${id}', -1)">-</button>
                    <span style="font-size:0.85rem; font-weight:800; min-width:16px; text-align:center; color:#fff;">${item.quantity}</span>
                    <button class="ticket-btn" onclick="cambiarCantidadPOS('${id}', 1)">+</button>
                </div>
            </div>
        `;
        list.appendChild(row);
    });

    if (estaEnvioActivo) {
        const rowEnvio = document.createElement("div");
        rowEnvio.className = "ticket-row";
        rowEnvio.style.background = "rgba(255, 85, 0, 0.05)";
        rowEnvio.style.padding = "8px";
        rowEnvio.style.borderRadius = "8px";
        rowEnvio.innerHTML = `
            <span style="font-weight:700; color:#ff5500; font-size:0.85rem;">🚚 Servicio de Envío</span>
            <span style="font-weight:700; color:#ff944d; font-size:0.85rem;">$${costoEnvio.toFixed(2)}</span>
        `;
        list.appendChild(rowEnvio);
    }

    document.getElementById("posTotal").innerText = `$${totalVenta.toFixed(2)}`;
    calcularCambio();
}

// ==========================================================================
// 5. CALCULADORA DE CAMBIO Y BILLETES
// ==========================================================================
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
    const pagaConInput = document.getElementById("pagaCon").value;
    const pagaCon = parseFloat(pagaConInput) || 0;
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

// ==========================================================================
// 6. REGISTRO DE VENTA Y DESPLIEGUE OPCIÓN C
// ==========================================================================
function procesarVentaPOS() {
    const chkEnvio = document.getElementById("chkEnvio");
    const estaEnvioActivo = chkEnvio && chkEnvio.checked;

    if (Object.keys(cart).length === 0 && !estaEnvioActivo) return;

    const method = document.getElementById("posPaymentMethod").value;
    const pagaCon = parseFloat(document.getElementById("pagaCon").value) || totalVenta;
    const notas = document.getElementById("posNotes").value.trim() || "Venta mostrador local";

    if (method === "Efectivo" && pagaCon < totalVenta) {
        alert("⚠️ El monto pagado es menor al total.");
        return;
    }

    let arrProductos = Object.keys(cart).map(id => {
        const item = cart[id];
        const subtotal = item.price * item.quantity;
        return `${item.quantity}x ${item.name} ($${item.price.toFixed(2)} c/u = $${subtotal.toFixed(2)})`;
    });

    if (estaEnvioActivo) {
        const costoEnvio = parseFloat(document.getElementById("montoEnvio").value) || 0;
        arrProductos.push(`1x 🚚 Servicio de Envío ($${costoEnvio.toFixed(2)})`);
    }

    let productosString = arrProductos.join(" | ");
    const cambioEntregado = method === "Efectivo" ? (pagaCon - totalVenta) : 0;

    const fechaHoraActual = new Date().toLocaleString('es-MX');

    const ventaData = {
        fecha: fechaHoraActual,
        nombre: "Venta Local Mostrador",
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

    // Almacena los datos completos para la impresión del ticket
    ultimaVentaGuardada = { ...ventaData };

    const btn = document.getElementById("btnRegistrarVenta");
    btn.disabled = true;
    btn.style.background = "#222";
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
        btn.style.background = "linear-gradient(135deg, #ff5500, #ff8c00)";
        btn.innerHTML = "<i class='fa-solid fa-bolt'></i> Registrar Venta";
        
        // Abre el modal emergente para preguntar si desea imprimir ticket (Opción C)
        document.getElementById("printConfirmModal").style.display = "flex";
    })
    .catch(err => {
        console.error(err);
        btn.disabled = false;
        btn.style.background = "#ff3344";
        btn.innerHTML = "<i class='fa-solid fa-triangle-exclamation'></i> Reintentar";
    });
}

// ==========================================================================
// 7. IMPRESIÓN Y LIMPIEZA DE TERMINAL POS
// ==========================================================================
function confirmarImpresionYFinalizar() {
    if (ultimaVentaGuardada) {
        imprimirTicketPOS(ultimaVentaGuardada);
    }
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
            <title>Ticket Comanda POS</title>
            <style>
                body { font-family: monospace; width: 260px; padding: 10px; margin: 0; color: #000; font-size: 12px; }
                .center { text-align: center; }
                .line { border-bottom: 1px dashed #000; margin: 8px 0; }
                .bold { font-weight: bold; }
            </style>
        </head>
        <body>
            <div class="center bold" style="font-size:14px;">TACOS & PAPAS ASADAS</div>
            <div class="center">*** TICKET DE VENTA ***</div>
            <div class="line"></div>
            <div><b>Fecha:</b> ${v.fecha}</div>
            <div><b>Cliente:</b> ${v.nombre}</div>
            <div><b>Pago:</b> ${v.metodo_pago}</div>
            <div><b>Notas:</b> ${v.notas}</div>
            <div class="line"></div>
            <div class="bold" style="margin-bottom:5px;">DESGLOSE:</div>
            ${itemsHTML}
            <div class="line"></div>
            <div style="font-size:14px;" class="bold">TOTAL: $${parseFloat(v.total).toFixed(2)}</div>
            ${v.metodo_pago === 'Efectivo' ? `
                <div>Paga Con: $${parseFloat(v.efectivo_recibido).toFixed(2)}</div>
                <div>Cambio: $${parseFloat(v.cambio).toFixed(2)}</div>
            ` : ''}
            <div class="center" style="margin-top:15px;">¡Gracias por su compra!</div>
            <script>
                window.onload = function() { window.print(); window.close(); }
            </script>
        </body>
        </html>
    `);
    ventanaImp.document.close();
}

// ==========================================================================
// 8. FUNCIONALIDAD PARA AGREGAR PRODUCTOS ESPECIALES / LIBRES
// ==========================================================================
function abrirModalOtroProducto() {
    document.getElementById("customProdName").value = "";
    document.getElementById("customProdPrice").value = "";
    document.getElementById("customProdQty").value = "1";
    document.getElementById("customProductModal").style.display = "flex";
    setTimeout(() => document.getElementById("customProdName").focus(), 100);
}

function cerrarModalOtroProducto() {
    document.getElementById("customProductModal").style.display = "none";
}

function agregarProductoEspecialAlCarrito(event) {
    event.preventDefault();
    
    const nombre = document.getElementById("customProdName").value.trim();
    const precio = parseFloat(document.getElementById("customProdPrice").value) || 0;
    const cantidad = parseInt(document.getElementById("customProdQty").value, 10) || 1;

    if (!nombre || precio <= 0) {
        alert("⚠️ Por favor ingresa un nombre y precio válidos.");
        return;
    }

    const customId = "CUSTOM_" + Date.now();

    cart[customId] = {
        name: `⭐ ${nombre}`,
        price: precio,
        quantity: cantidad
    };

    actualizarUIPOS();
    cerrarModalOtroProducto();
}