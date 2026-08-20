// ==========================================================================
// CONFIGURACIÓN GENERAL DEL NEGOCIO
// ==========================================================================
const PHONE_NUMBER = "528131151055"; 
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

// COORDENADAS DEL NEGOCIO (Tacos & Papas Asadas)
const STORE_LAT = 25.923945369456046;
const STORE_LNG = -100.24093502914572;

let products = [];
let promociones = [];
let promoActivaHoy = null;
let cart = {};
let userCoordinates = null;
let shippingCost = 0;
let deliveryDistanceMeters = 0;
let tiendaEstaCerrada = false; // VARIABLE GLOBAL DE ESTADO DE TIENDA

const DIAS_TEXTO = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

document.addEventListener("DOMContentLoaded", () => {
    cargarProductosDesdeSheets();
    inicializarContadorEnVivo();
});

// ==========================================================================
// 1. CARGAR PRODUCTOS, ESTADO DE TIENDA Y PROMOCIONES
// ==========================================================================
function cargarProductosDesdeSheets() {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "<p style='text-align:center; padding:40px; color:#00d4ff; font-size: 1.1rem;'><i class='fa-solid fa-spinner fa-spin'></i> Cargando menú...</p>";

    fetch(GOOGLE_SCRIPT_URL, { method: "GET", redirect: "follow" })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            container.innerHTML = `<p style='text-align:center; padding:20px; color:#ff3344;'>❌ Error: ${data.error}</p>`;
            return;
        }
        
        tiendaEstaCerrada = data.estado && data.estado === "CERRADO";
        
        const banner = document.getElementById("bannerCerrado");
        const cartBar = document.getElementById("cartBar");
        const btnCombo = document.getElementById("btnPedirCombo");
        
        if (tiendaEstaCerrada) {
            if(banner) banner.style.display = "block";
            if(cartBar) cartBar.style.setProperty("display", "none", "important");
            
            if (btnCombo) {
                btnCombo.disabled = true;
                btnCombo.style.opacity = "0.5";
                btnCombo.style.cursor = "not-allowed";
                btnCombo.innerHTML = `<i class="fa-solid fa-lock"></i> No disponible (Cerrado)`;
            }
        } else {
            if(banner) banner.style.display = "none";
            
            if (btnCombo) {
                btnCombo.disabled = false;
                btnCombo.style.opacity = "1";
                btnCombo.style.cursor = "pointer";
                btnCombo.innerHTML = `<i class="fa-solid fa-cart-plus"></i> Pedir Combo`;
            }
        }

        const listaProductos = data.productos || [];
        products = listaProductos.filter(product => {
            return product.id && product.nombre && product.id.toString().trim() !== "";
        });

        promociones = data.promociones || [];
        evaluarPromoDelDia();

        generarCategoriasDinamicas(products);
        renderMenuModificado(products, tiendaEstaCerrada);
    })
    .catch(error => {
        console.error("Error:", error);
        container.innerHTML = "<p style='text-align:center; padding:20px; color:#ff3344;'>❌ No se pudo conectar con la base de datos.</p>";
    });
}

function generarCategoriasDinamicas(productsArray) {
    const nav = document.getElementById("categoriesNav");
    if (!nav) return;
    const categoriasUnicas = new Set();
    productsArray.forEach(p => { if (p.categoria) categoriasUnicas.add(p.categoria.toString().trim()); });
    let htmlBotones = `<button class="category-btn active" onclick="filterCategory('todos', event)">Todos</button>`;
    categoriasUnicas.forEach(cat => { htmlBotones += `<button class="category-btn" onclick="filterCategory('${cat}', event)">${cat}</button>`; });
    nav.innerHTML = htmlBotones;
}

// ==========================================================================
// 2. LÓGICA DE PROMOCIONES DEL DÍA CON FILTRO INTELIGENTE
// ==========================================================================
function evaluarPromoDelDia() {
    const numDia = new Date().getDay();
    const nombreDia = DIAS_TEXTO[numDia];

    promoActivaHoy = promociones.find(p => 
        p.diaSemana.includes(nombreDia) && 
        (!p.activo || p.activo.toString().toUpperCase() === "SI")
    );

    const container = document.getElementById("promoBannerContainer");
    if (!promoActivaHoy || !container) {
        if (container) container.style.display = "none";
        return;
    }

    document.getElementById("promoTitulo").innerText = promoActivaHoy.titulo;
    document.getElementById("promoSubtitulo").innerText = promoActivaHoy.subtitulo;
    document.getElementById("promoDescripcion").innerText = promoActivaHoy.descripcion;
    document.getElementById("promoPrecioLista").innerText = `$${parseFloat(promoActivaHoy.precioLista).toFixed(2)}`;
    document.getElementById("promoPrecioOferta").innerText = `$${parseFloat(promoActivaHoy.precioOferta).toFixed(2)}`;
    
    container.style.display = "block";
}

function abrirModalOpcionesPromo() {
    if (tiendaEstaCerrada) return;
    if (!promoActivaHoy) return;

    document.getElementById("modalComboTitulo").innerText = promoActivaHoy.titulo;
    const cuerpo = document.getElementById("modalComboCuerpo");
    cuerpo.innerHTML = "";

    const grupos = promoActivaHoy.configOpciones.split("|");

    grupos.forEach((grupo, idx) => {
        let partes = grupo.split(":");
        let etiqueta = partes[0] ? partes[0].trim() : "Opción";
        let condicion = partes[1] ? partes[1].trim() : "";

        let filtroPartes = condicion.split(">");
        let categoriaRequerida = filtroPartes[0].trim();
        let palabraClave = filtroPartes[1] ? filtroPartes[1].trim().toLowerCase() : "";

        let opcionesDisponibles = products.filter(p => {
            let coincideCategoria = p.categoria.toString().trim().toLowerCase() === categoriaRequerida.toLowerCase();
            let noEstaAgotado = (p.agotado || "").toString().toUpperCase() !== "SI";
            let coincidePalabra = palabraClave === "" || p.nombre.toString().toLowerCase().includes(palabraClave);

            return coincideCategoria && noEstaAgotado && coincidePalabra;
        });

        let optionsHTML = "";
        if (opcionesDisponibles.length > 0) {
            optionsHTML = opcionesDisponibles.map(p => `<option value="${p.nombre}">${p.nombre}</option>`).join("");
        } else {
            optionsHTML = `<option value="Estándar">Opción Estándar</option>`;
        }

        cuerpo.innerHTML += `
            <div>
                <label style="font-size: 0.85rem; color: var(--accent-cyan); display: block; margin-bottom: 6px; font-weight: 700;">${etiqueta}:</label>
                <select id="opcCombo_${idx}" class="input-combo-opcion" style="width: 100%; background: #0b1329; border: 1px solid rgba(0, 212, 255, 0.3); padding: 12px; border-radius: 12px; color: #fff; font-weight: 700; font-size: 0.9rem;">
                    ${optionsHTML}
                </select>
            </div>
        `;
    });

    document.getElementById("modalOpcionesCombo").style.setProperty("display", "flex", "important");
}

function cerrarModalOpcionesPromo() {
    document.getElementById("modalOpcionesCombo").style.display = "none";
}

function confirmarAgregarComboAlCarrito() {
    if (tiendaEstaCerrada) return;
    if (!promoActivaHoy) return;

    let selecciones = [];
    document.querySelectorAll(".input-combo-opcion").forEach(sel => {
        selecciones.push(sel.value);
    });

    let detalle = selecciones.join(" / ");
    let nombreItemCombo = `🔥 ${promoActivaHoy.titulo} (${detalle})`;

    let itemKey = `COMBO_${Date.now()}`;
    cart[itemKey] = {
        name: nombreItemCombo,
        price: parseFloat(promoActivaHoy.precioOferta),
        quantity: 1
    };

    updateCartUI();
    calculateChange();
    cerrarModalOpcionesPromo();
}

// ==========================================================================
// 3. RENDERIZADO DE TARJETAS
// ==========================================================================
function renderMenuModificado(productsArray, estaTiendaCerrada) {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "";

    if (!productsArray || productsArray.length === 0) {
        container.innerHTML = "<p style='text-align:center; padding:20px; color:#94a3b8;'>No hay productos disponibles por el momento.</p>";
        return;
    }

    productsArray.forEach(product => {
        const prodId = product.id.toString().trim();
        const isInCart = cart[prodId];
        const estaAgotado = product.agotado && product.agotado.toString().trim().toUpperCase() === "SI";
        
        let controlsHTML = "";
        
        if (estaTiendaCerrada) {
            controlsHTML = `<span class="txt-agotado" style="color: #ff944d;"><i class="fa-solid fa-lock"></i> Cerrado</span>`;
        } else if (estaAgotado) {
            controlsHTML = `<span class="txt-agotado">No disponible</span>`;
        } else {
            controlsHTML = isInCart 
                ? `<div class="quantity-controls">
                    <button class="qty-btn" onclick="updateQuantity('${prodId}', -1)">-</button>
                    <span class="qty-number">${cart[prodId].quantity}</span>
                    <button class="qty-btn" onclick="updateQuantity('${prodId}', 1)">+</button>
                   </div>`
                : `<button class="add-btn" onclick="addToCart('${prodId}')">Agregar +</button>`;
        }

        const imgUrl = product.imagen || "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=500&q=80";
        let precioFinal = parseFloat(product.precio ? product.precio.toString().replace(/[^0-9.]/g, '') : "0") || 0;

        const card = document.createElement("div");
        card.className = `product-card ${estaAgotado ? 'agotado-card' : ''}`;
        
        card.innerHTML = `
            ${estaAgotado ? '<span class="badge-agotado"><i class="fa-solid fa-ban"></i> Agotado</span>' : ''}
            <img src="${imgUrl}" alt="${product.nombre}" class="product-img">
            <div class="product-info">
                <div>
                    <h3>${product.nombre}</h3>
                    <p class="product-desc">${product.descripcion || ''}</p>
                </div>
                <div class="product-footer">
                    <span class="product-price">$${precioFinal.toFixed(2)}</span>
                    <div id="controls-${prodId}">${controlsHTML}</div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function filterCategory(category, evt) {
    const buttons = document.querySelectorAll(".category-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    
    if (evt && evt.target) {
        const btnActivo = evt.target.closest('.category-btn');
        if (btnActivo) btnActivo.classList.add("active");
    }

    if (category === 'todos') {
        renderMenuModificado(products, tiendaEstaCerrada);
    } else {
        const filtered = products.filter(p => p.categoria && p.categoria.toString().trim().toLowerCase() === category.toLowerCase());
        renderMenuModificado(filtered, tiendaEstaCerrada);
    }
}

// ==========================================================================
// 4. CARRITO DE COMPRAS Y ACTUALIZACIÓN UI
// ==========================================================================
function addToCart(productId) {
    if (tiendaEstaCerrada) return;
    const idClave = productId.toString().trim();
    const product = products.find(p => p.id.toString().trim() === idClave);
    if (!product) return;
    let precioNumerico = parseFloat(product.precio.toString().replace(/[^0-9.]/g, '')) || 0;
    cart[idClave] = { name: product.nombre, price: precioNumerico, quantity: 1 };
    updateCartUI();
    refreshProductCardControl(idClave);
    calculateChange();
}

function updateQuantity(productId, change) {
    if (tiendaEstaCerrada) return;
    const idClave = productId.toString().trim();
    if (!cart[idClave]) return;
    cart[idClave].quantity += change;
    if (cart[idClave].quantity <= 0) delete cart[idClave];
    updateCartUI();
    refreshProductCardControl(idClave);
    calculateChange();
}

function removeProductFromCart(productId) {
    const idClave = productId.toString().trim();
    if (cart[idClave]) { 
        delete cart[idClave]; 
        updateCartUI(); 
        refreshProductCardControl(idClave); 
        calculateChange();
    }
}

function refreshProductCardControl(productId) {
    const idClave = productId.toString().trim();
    const controlContainer = document.getElementById(`controls-${idClave}`);
    if (!controlContainer) return;
    if (cart[idClave]) {
        controlContainer.innerHTML = `<div class="quantity-controls">
            <button class="qty-btn" onclick="updateQuantity('${idClave}', -1)">-</button>
            <span class="qty-number">${cart[idClave].quantity}</span>
            <button class="qty-btn" onclick="updateQuantity('${idClave}', 1)">+</button>
        </div>`;
    } else { controlContainer.innerHTML = `<button class="add-btn" onclick="addToCart('${idClave}')">Agregar +</button>`; }
}

function calculateSubtotal() {
    let subtotal = 0;
    Object.keys(cart).forEach(id => { subtotal += cart[id].price * cart[id].quantity; });
    return subtotal;
}

function updateCartUI() {
    let totalItems = 0;
    Object.keys(cart).forEach(id => { totalItems += cart[id].quantity; });
    const subtotal = calculateSubtotal();
    const grandTotal = subtotal + shippingCost;

    const cartBar = document.getElementById("cartBar"); if (!cartBar) return;
    if (totalItems > 0 && !tiendaEstaCerrada) {
        cartBar.style.setProperty("display", "block", "important");
        document.getElementById("cartCount").innerText = `${totalItems} ítems`;
        document.getElementById("cartTotalHeader").innerText = `$${grandTotal.toFixed(2)}`;
    } else { 
        cartBar.style.display = "none"; 
        toggleCartModal(false); 
    }

    if (document.getElementById("cartModalTotal")) {
        document.getElementById("cartModalTotal").innerText = `$${grandTotal.toFixed(2)}`;
    }

    const list = document.getElementById("cartItemsList");
    if (list) {
        list.innerHTML = "";
        Object.keys(cart).forEach(id => {
            const item = cart[id]; const row = document.createElement("div"); row.className = "cart-item";
            row.innerHTML = `<div class="cart-item-left"><span>${item.quantity}x ${item.name}</span></div>
                <div class="cart-item-right"><span>$${(item.price * item.quantity).toFixed(2)}</span>
                <button class="delete-item-btn" onclick="removeProductFromCart('${id}')"><i class="fa-solid fa-trash-can"></i></button></div>`;
            list.appendChild(row);
        });

        if (userCoordinates) {
            const shippingRow = document.createElement("div"); 
            shippingRow.className = "cart-item";
            shippingRow.style.color = "#00d4ff";
            shippingRow.style.fontWeight = "600";
            
            const distKm = (deliveryDistanceMeters / 1000).toFixed(1);
            const envioTexto = shippingCost === 0 ? "¡GRATIS! (Vecino)" : `$${shippingCost.toFixed(2)}`;
            
            shippingRow.innerHTML = `<div class="cart-item-left"><span>🛵 Envío a domicilio (${distKm} km)</span></div>
                <div class="cart-item-right"><span style="color:#25D366;">${envioTexto}</span></div>`;
            list.appendChild(shippingRow);
        }
    }
}

function toggleCartModal(show) { 
    if (tiendaEstaCerrada && show) return;
    const m = document.getElementById("cartModal"); 
    if (m) m.style.setProperty("display", show ? "flex" : "none", "important"); 
}

// ==========================================================================
// 5. LÓGICA DE MÉTODO DE PAGO Y RESALTADO DE BOTONES
// ==========================================================================
function togglePaymentFields(method) {
    const cashBox = document.getElementById("cashFields");
    const transferBox = document.getElementById("transferFields");
    
    const optCash = document.getElementById("opt-Efectivo");
    const optTransfer = document.getElementById("opt-Transferencia");

    if (method === 'Efectivo') {
        cashBox.style.display = "block";
        transferBox.style.display = "none";
        
        if (optCash) optCash.classList.add("active");
        if (optTransfer) optTransfer.classList.remove("active");
    } else {
        cashBox.style.display = "none";
        transferBox.style.display = "block";
        
        if (optTransfer) optTransfer.classList.add("active");
        if (optCash) optCash.classList.remove("active");
    }
}

function calculateChange() {
    const subtotal = calculateSubtotal();
    const grandTotal = subtotal + shippingCost;
    
    const cashInput = document.getElementById("cashAmount");
    const changeText = document.getElementById("changeText");
    if (!cashInput || !changeText) return;

    const cashValue = parseFloat(cashInput.value) || 0;
    
    if (cashValue >= grandTotal && grandTotal > 0) {
        const cambio = cashValue - grandTotal;
        changeText.innerHTML = `Cambio estimado: <strong>$${cambio.toFixed(2)}</strong>`;
    } else if (cashValue > 0) {
        changeText.innerHTML = `Paga con: <strong>$${cashValue.toFixed(2)}</strong> (Faltan $${(grandTotal - cashValue).toFixed(2)})`;
    } else {
        changeText.innerHTML = `Cambio estimado: <strong>$0.00</strong>`;
    }
}

function copyCLABE() {
    const clabeText = document.getElementById("clabeNumber").innerText;
    navigator.clipboard.writeText(clabeText).then(() => {
        const status = document.getElementById("copyStatus");
        status.innerText = "¡CLABE copiada al portapapeles!";
        setTimeout(() => { status.innerText = ""; }, 3000);
    }).catch(err => {
        console.error("Error al copiar: ", err);
    });
}

// ==========================================================================
// 6. CÁLCULO DE DISTANCIA Y GPS
// ==========================================================================
async function fetchDrivingDistanceMeters(lat1, lon1, lat2, lon2) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === "Ok" && data.routes && data.routes.length > 0) {
            return data.routes[0].distance;
        } else {
            return calculateFallbackDistance(lat1, lon1, lat2, lon2);
        }
    } catch (error) {
        console.error("Error al consultar API OSRM, usando respaldo:", error);
        return calculateFallbackDistance(lat1, lon1, lat2, lon2);
    }
}

function calculateFallbackDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c) * 1.35;
}

function calculateShippingFee(distanceMeters) {
    if (distanceMeters <= 300) return 0;
    let costoCalculado = (distanceMeters / 100) * 2.00;
    if (costoCalculado < 20.00) costoCalculado = 20.00;
    return Math.ceil(costoCalculado);
}

function getLocation() {
    const statusText = document.getElementById("gpsStatus"); 
    const gpsBtn = document.getElementById("gpsBtn");
    if (!navigator.geolocation) {
        statusText.innerText = "❌ Su navegador no soporta Geolocalización.";
        return;
    }
    statusText.innerText = "⏳ Trazando ruta por calles y calculando envío..."; 
    gpsBtn.disabled = true;
    
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            
            userCoordinates = `https://www.google.com/maps?q=${userLat},${userLng}`;
            
            deliveryDistanceMeters = await fetchDrivingDistanceMeters(STORE_LAT, STORE_LNG, userLat, userLng);
            shippingCost = calculateShippingFee(deliveryDistanceMeters);
            
            const distKm = (deliveryDistanceMeters / 1000).toFixed(1);
            const costoTexto = shippingCost === 0 ? "¡Envío GRATIS!" : `Costo de envío: $${shippingCost.toFixed(2)}`;

            statusText.innerHTML = `✅ ¡Ubicación capturada! (${distKm} km por calle - ${costoTexto})`; 
            statusText.style.color = "#25D366"; 
            gpsBtn.disabled = false;
            
            updateCartUI();
            calculateChange();
        },
        () => { 
            statusText.innerText = "❌ Error al obtener GPS. Activa la ubicación de tu dispositivo."; 
            statusText.style.color = "#ff3344";
            gpsBtn.disabled = false; 
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

// ==========================================================================
// 7. ENVÍO A GOOGLE SHEETS Y WHATSAPP
// ==========================================================================
function sendOrder(event) {
    event.preventDefault();

    if (tiendaEstaCerrada) return;

    if (!userCoordinates) {
        mostrarAlertaGps(true);
        return; 
    }

    const name = document.getElementById("clientName").value.trim();
    const phoneInput = document.getElementById("clientPhone");
    const phone = phoneInput ? phoneInput.value.trim() : "N/A";
    const address = document.getElementById("clientAddress").value.trim();
    const references = document.getElementById("clientReferences").value.trim();
    const notes = document.getElementById("clientNotes").value.trim() || "Sin instrucciones especiales.";
    
    const paymentMethodEl = document.querySelector('input[name="paymentMethod"]:checked');
    const paymentMethod = paymentMethodEl ? paymentMethodEl.value : "Efectivo";
    const cashAmountInput = document.getElementById("cashAmount").value.trim();

    const subtotal = calculateSubtotal();
    const grandTotal = subtotal + shippingCost;

    let efectivoRecibido = "";
    let cambioEntregar = "";

    let listaProductosExcel = "";
    Object.keys(cart).forEach(id => { 
        const item = cart[id]; 
        const importeItem = item.price * item.quantity;
        listaProductosExcel += `${item.quantity}x ${item.name} ($${item.price.toFixed(2)} c/u = $${importeItem.toFixed(2)}) | `; 
    });

    if (userCoordinates) {
        listaProductosExcel += `1x 🛵 Envío ($${shippingCost.toFixed(2)}) | `;
    }

    listaProductosExcel = listaProductosExcel.slice(0, -3);

    if (paymentMethod === "Efectivo") {
        const pagaCon = parseFloat(cashAmountInput) || grandTotal;
        efectivoRecibido = pagaCon.toFixed(2);
        cambioEntregar = pagaCon >= grandTotal ? (pagaCon - grandTotal).toFixed(2) : "0.00";
    }

    const submitBtn = event.target.querySelector(".submit-order-btn");
    submitBtn.disabled = true;

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", 
        mode: "no-cors", 
        cache: "no-cache", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            nombre: name, 
            telefono: phone, 
            direccion: address, 
            referencias: references, 
            gps: userCoordinates, 
            productos: listaProductosExcel, 
            total: grandTotal, 
            notas: notes,
            metodo_pago: paymentMethod,
            efectivo_recibido: efectivoRecibido,
            cambio: cambioEntregar
        })
    })
    .then(() => { 
        toggleCartModal(false); 
        procesarEnvioWhatsApp(name, phone, address, references, subtotal, grandTotal, notes, paymentMethod, cashAmountInput); 
        mostrarVentanaExito(true); 
    })
    .catch(() => { 
        toggleCartModal(false); 
        procesarEnvioWhatsApp(name, phone, address, references, subtotal, grandTotal, notes, paymentMethod, cashAmountInput); 
        mostrarVentanaExito(true); 
    });
}

function procesarEnvioWhatsApp(name, phone, address, references, subtotal, grandTotal, notes, paymentMethod, cashAmount) {
    let pagoTexto = "";
    if (paymentMethod === "Efectivo") {
        const pagaCon = parseFloat(cashAmount) || grandTotal;
        const cambio = pagaCon >= grandTotal ? (pagaCon - grandTotal).toFixed(2) : "0.00";
        pagoTexto = `💵 *Pago:* Efectivo (Paga con: $${pagaCon.toFixed(2)} | Cambio: $${cambio})`;
    } else {
        pagoTexto = `💳 *Pago:* Transferencia bancaria (Comprobante pendiente)`;
    }

    const distKm = (deliveryDistanceMeters / 1000).toFixed(1);
    const envioTexto = shippingCost === 0 ? "¡GRATIS!" : `$${shippingCost.toFixed(2)}`;

    let m = `🛵 *NUEVO PEDIDO A DOMICILIO* 🛵\n👤 *Cliente:* ${name}\n📞 *Teléfono:* ${phone}\n🏠 *Dirección:* ${address}\n📍 *Referencias:* ${references}\n${pagoTexto}\n💬 *Notas:* ${notes}\n🗺️ *GPS:* ${userCoordinates}\n\n📝 *DETALLE:*\n`;
    Object.keys(cart).forEach(id => { m += `• ${cart[id].quantity}x ${cart[id].name} ($${(cart[id].price * cart[id].quantity).toFixed(2)})\n`; });
    
    m += `\n🍔 *Subtotal Platillos:* $${subtotal.toFixed(2)}`;
    m += `\n🛵 *Costo de Envío (${distKm} km):* ${envioTexto}`;
    m += `\n💰 *TOTAL A PAGAR:* $${grandTotal.toFixed(2)}`;
    
    window.open(`https://api.whatsapp.com/send?phone=${PHONE_NUMBER}&text=${encodeURIComponent(m)}`, '_blank');
}

// FUNCIONES PARA CONTROL DE VENTANAS EMERGENTES (MODALES)
function mostrarAlertaGps(show) { 
    const m = document.getElementById("gpsAlertModal"); 
    if (m) m.style.setProperty("display", show ? "flex" : "none", "important"); 
}

function cerrarAlertaGps() { 
    mostrarAlertaGps(false); 
    const gpsBtn = document.getElementById("gpsBtn");
    if (gpsBtn) gpsBtn.focus();
}

function mostrarVentanaExito(show) { if (document.getElementById("successModal")) document.getElementById("successModal").style.setProperty("display", show ? "flex" : "none", "important"); }
function finalizarYRecargar() { cart = {}; mostrarVentanaExito(false); window.location.reload(); }

function inicializarContadorEnVivo() {
    const text = document.getElementById("counterText"); if (!text) return;
    let pers = Math.floor(Math.random() * 12) + 6;
    setInterval(() => { pers += Math.random() > 0.5 ? 1 : -1; if (pers < 4) pers = 4; text.innerHTML = `🔥 <span style="color:#25D366; font-weight:800;">${pers} personas</span> viendo el menú`; }, 5000);
}