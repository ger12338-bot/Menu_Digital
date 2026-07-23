// ==========================================================================
// CONFIGURACIÓN GENERAL DEL NEGOCIO
// ==========================================================================
const PHONE_NUMBER = "528131151055"; 
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

let products = [];
let cart = {};
let userCoordinates = null;

document.addEventListener("DOMContentLoaded", () => {
    cargarProductosDesdeSheets();
    inicializarContadorEnVivo();
});

// ==========================================================================
// 1. CARGAR PRODUCTOS Y ESTADO DE TIENDA
// ==========================================================================
function cargarProductosDesdeSheets() {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "<p style='text-align:center; padding:40px; color:#ff5500; font-size: 1.1rem;'><i class='fa-solid fa-spinner fa-spin'></i> Cargando menú...</p>";

    fetch(GOOGLE_SCRIPT_URL, { method: "GET", redirect: "follow" })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            container.innerHTML = `<p style='text-align:center; padding:20px; color:#ff3344;'>❌ Error: ${data.error}</p>`;
            return;
        }
        
        const tiendaCerrada = data.estado && data.estado === "CERRADO";
        const banner = document.getElementById("bannerCerrado");
        const cartBar = document.getElementById("cartBar");
        
        if (tiendaCerrada) {
            if(banner) banner.style.display = "block";
            if(cartBar) cartBar.style.setProperty("display", "none", "important");
        } else {
            if(banner) banner.style.display = "none";
        }

        const listaProductos = data.productos || [];
        products = listaProductos.filter(product => {
            return product.id && product.nombre && product.id.toString().trim() !== "";
        });

        generarCategoriasDinamicas(products);
        renderMenuModificado(products, tiendaCerrada);
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
// 2. RENDERIZADO DE TARJETAS
// ==========================================================================
function renderMenuModificado(productsArray, estaTiendaCerrada) {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "";

    if (!productsArray || productsArray.length === 0) {
        container.innerHTML = "<p style='text-align:center; padding:20px; color:#9e9e9e;'>No hay productos disponibles por el momento.</p>";
        return;
    }

    productsArray.forEach(product => {
        const prodId = product.id.toString().trim();
        const isInCart = cart[prodId];
        const estaAgotado = product.agotado && product.agotado.toString().trim().toUpperCase() === "SI";
        
        let controlsHTML = "";
        
        if (estaTiendaCerrada) {
            controlsHTML = `<span class="txt-agotado">Cerrado</span>`;
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
        card.className = `product-card ${estaAgotado || estaTiendaCerrada ? 'agotado-card' : ''}`;
        
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
    
    const banner = document.getElementById("bannerCerrado");
    const tiendaEstaCerrada = banner && banner.style.display === "block";

    if (category === 'todos') {
        renderMenuModificado(products, tiendaEstaCerrada);
    } else {
        const filtered = products.filter(p => p.categoria && p.categoria.toString().trim().toLowerCase() === category.toLowerCase());
        renderMenuModificado(filtered, tiendaEstaCerrada);
    }
}

// ==========================================================================
// 3. CARRITO
// ==========================================================================
function addToCart(productId) {
    const idClave = productId.toString().trim();
    const product = products.find(p => p.id.toString().trim() === idClave);
    if (!product) return;
    let precioNumerico = parseFloat(product.precio.toString().replace(/[^0-9.]/g, '')) || 0;
    cart[idClave] = { name: product.nombre, price: precioNumerico, quantity: 1 };
    updateCartUI();
    refreshProductCardControl(idClave);
}

function updateQuantity(productId, change) {
    const idClave = productId.toString().trim();
    if (!cart[idClave]) return;
    cart[idClave].quantity += change;
    if (cart[idClave].quantity <= 0) delete cart[idClave];
    updateCartUI();
    refreshProductCardControl(idClave);
}

function removeProductFromCart(productId) {
    const idClave = productId.toString().trim();
    if (cart[idClave]) { delete cart[idClave]; updateCartUI(); refreshProductCardControl(idClave); }
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

function updateCartUI() {
    let totalItems = 0, totalPrice = 0;
    Object.keys(cart).forEach(id => { totalItems += cart[id].quantity; totalPrice += cart[id].price * cart[id].quantity; });
    const cartBar = document.getElementById("cartBar"); if (!cartBar) return;
    if (totalItems > 0) {
        cartBar.style.setProperty("display", "block", "important");
        document.getElementById("cartCount").innerText = `${totalItems} ítems`;
        document.getElementById("cartTotalHeader").innerText = `$${totalPrice.toFixed(2)}`;
    } else { cartBar.style.display = "none"; toggleCartModal(false); }
    if (document.getElementById("cartModalTotal")) document.getElementById("cartModalTotal").innerText = `$${totalPrice.toFixed(2)}`;
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
    }
}

function toggleCartModal(show) { const m = document.getElementById("cartModal"); if (m) m.style.setProperty("display", show ? "flex" : "none", "important"); }

// ==========================================================================
// 4. GPS Y ENVÍO A WHATSAPP
// ==========================================================================
function getLocation() {
    const statusText = document.getElementById("gpsStatus"); 
    const gpsBtn = document.getElementById("gpsBtn");
    if (!navigator.geolocation) {
        statusText.innerText = "❌ Su navegador no soporta Geolocalización.";
        return;
    }
    statusText.innerText = "⏳ Localizando..."; 
    gpsBtn.disabled = true;
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            userCoordinates = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
            statusText.innerHTML = `✅ ¡Ubicación capturada correctamente!`; 
            statusText.style.color = "#25D366"; 
            gpsBtn.disabled = false;
        },
        () => { 
            statusText.innerText = "❌ Error al obtener GPS. Activa la ubicación de tu dispositivo."; 
            statusText.style.color = "#ff3344";
            gpsBtn.disabled = false; 
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

function sendOrder(event) {
    event.preventDefault();

    // 1. VALIDACIÓN STRICTA DE GPS CON MODAL EMERGENTE
    if (!userCoordinates) {
        mostrarAlertaGps(true);
        return; 
    }

    // 2. CAPTURA DE DATOS DEL FORMULARIO
    const name = document.getElementById("clientName").value.trim();
    const phoneInput = document.getElementById("clientPhone");
    const phone = phoneInput ? phoneInput.value.trim() : "N/A";
    const address = document.getElementById("clientAddress").value.trim();
    const references = document.getElementById("clientReferences").value.trim();
    const notes = document.getElementById("clientNotes").value.trim() || "Sin instrucciones especiales.";
    
    let listaProductosExcel = "", total = 0;
    Object.keys(cart).forEach(id => { 
        const item = cart[id]; 
        total += item.price * item.quantity; 
        listaProductosExcel += `${item.quantity}x ${item.name} | `; 
    });
    listaProductosExcel = listaProductosExcel.slice(0, -3);

    const submitBtn = event.target.querySelector(".submit-order-btn");
    submitBtn.disabled = true;

    // 3. ENVÍO A GOOGLE APPS SCRIPT
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
            total: total, 
            notas: notes 
        })
    })
    .then(() => { 
        toggleCartModal(false); 
        procesarEnvioWhatsApp(name, phone, address, references, total, notes); 
        mostrarVentanaExito(true); 
    })
    .catch(() => { 
        toggleCartModal(false); 
        procesarEnvioWhatsApp(name, phone, address, references, total, notes); 
        mostrarVentanaExito(true); 
    });
}

function procesarEnvioWhatsApp(name, phone, address, references, total, notes) {
    let m = `🛵 *NUEVO PEDIDO A DOMICILIO* 🛵\n👤 *Cliente:* ${name}\n📞 *Teléfono:* ${phone}\n🏠 *Dirección:* ${address}\n📍 *Referencias:* ${references}\n💬 *Notas:* ${notes}\n🗺️ *GPS:* ${userCoordinates}\n📝 *DETALLE:*\n`;
    Object.keys(cart).forEach(id => { m += `• ${cart[id].quantity}x ${cart[id].name} ($${(cart[id].price * cart[id].quantity).toFixed(2)})\n`; });
    m += `\n💰 *Total:* $${total.toFixed(2)}`;
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
