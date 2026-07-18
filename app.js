const PHONE_NUMBER = "528129411481"; 
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

let products = [];
let cart = {};
let userCoordinates = null;

document.addEventListener("DOMContentLoaded", () => {
    cargarProductosDesdeSheets();
    inicializarContadorEnVivo();
});

function cargarProductosDesdeSheets() {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "<p style='text-align:center; padding:40px; color:#ff5500; font-size: 1.2rem;'><i class='fa-solid fa-spinner fa-spin'></i> Cargando el menú delicioso...</p>";

    fetch(GOOGLE_SCRIPT_URL, { method: "GET", redirect: "follow" })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            container.innerHTML = `<p style='text-align:center; padding:20px; color:#ff3344;'>❌ Error: ${data.error}</p>`;
            return;
        }
        
        // 1. REVISAR EL INTERRUPTOR DE TIENDA CERRADA
        const tiendaCerrada = data.estado && data.estado === "CERRADO";
        const banner = document.getElementById("bannerCerrado");
        const cartBar = document.getElementById("cartBar");
        
        if (tiendaCerrada) {
            if(banner) banner.style.display = "block";
            if(cartBar) cartBar.style.setProperty("display", "none", "important");
        } else {
            if(banner) banner.style.display = "none";
        }

        // 2. EXTRAER LOS PRODUCTOS
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
    let htmlBotones = `<button class="category-btn active" onclick="filterCategory('todos')">Todos</button>`;
    categoriasUnicas.forEach(cat => { htmlBotones += `<button class="category-btn" onclick="filterCategory('${cat}')">${cat}</button>`; });
    nav.innerHTML = htmlBotones;
}

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
        
        // Control de cierre maestro
        if (estaTiendaCerrada) {
            controlsHTML = `<span class="txt-agotado" style="color: #ff3344; background: rgba(255,51,68,0.1); padding: 6px 12px; border-radius: 8px; font-weight:700;">Cerrado</span>`;
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
            ${estaAgotado ? '<span class="badge-agotado">Agotado</span>' : ''}
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

function filterCategory(category) {
    const buttons = document.querySelectorAll(".category-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    if (typeof event !== 'undefined' && event.target) {
        const btnActivo = event.target.closest('.category-btn');
        if (btnActivo) btnActivo.classList.add("active");
    }
    // Verificamos si la tienda está cerrada globalmente para volver a renderizar de forma correcta
    const banner = document.getElementById("bannerCerrado");
    const tiendaEstaCerrada = banner && banner.style.display === "block";

    if (category === 'todos') {
        renderMenuModificado(products, tiendaEstaCerrada);
    } else {
        const filtered = products.filter(p => p.categoria && p.categoria.toString().trim().toLowerCase() === category.toLowerCase());
        renderMenuModificado(filtered, tiendaEstaCerrada);
    }
}

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

function getLocation() {
    const statusText = document.getElementById("gpsStatus"); const gpsBtn = document.getElementById("gpsBtn");
    if (!navigator.geolocation) return;
    statusText.innerText = "⏳ Localizando con precisión..."; gpsBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(
        (position) => {
            userCoordinates = `https://www.google.com/maps?q=${position.coords.latitude},${position.coords.longitude}`;
            statusText.innerHTML = `✅ ¡Ubicación guardada!`; statusText.style.color = "#25D366"; gpsBtn.disabled = false;
        },
        () => { statusText.innerText = "❌ Error GPS."; gpsBtn.disabled = false; },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

function sendOrder(event) {
    event.preventDefault();
    const name = document.getElementById("clientName").value.trim();
    const address = document.getElementById("clientAddress").value.trim();
    const references = document.getElementById("clientReferences").value.trim();
    const notes = document.getElementById("clientNotes").value.trim() || "Sin instrucciones especiales.";
    let listaProductosExcel = "", total = 0;
    Object.keys(cart).forEach(id => { const item = cart[id]; total += item.price * item.quantity; listaProductosExcel += `${item.quantity}x ${item.name} | `; });
    listaProductosExcel = listaProductosExcel.slice(0, -3);

    const submitBtn = event.target.querySelector(".submit-order-btn");
    submitBtn.disabled = true;

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST", mode: "no-cors", cache: "no-cache", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: name, direccion: address, referencias: references, gps: userCoordinates || "No compartido", productos: listaProductosExcel, total: total, notas: notes })
    })
    .then(() => { toggleCartModal(false); procesarEnvioWhatsApp(name, address, references, total, notes); mostrarVentanaExito(true); })
    .catch(() => { toggleCartModal(false); procesarEnvioWhatsApp(name, address, references, total, notes); mostrarVentanaExito(true); });
}

function procesarEnvioWhatsApp(name, address, references, total, notes) {
    let m = `🛵 *NUEVO PEDIDO A DOMICILIO* 🛵\n👤 *Cliente:* ${name}\n🏠 *Dirección:* ${address}\n📍 *Referencias:* ${references}\n💬 *Notas:* ${notes}\n🗺️ *GPS:* ${userCoordinates || 'No compartida'}\n📝 *DETALLE:*\n`;
    Object.keys(cart).forEach(id => { m += `• ${cart[id].quantity}x ${cart[id].name} ($${(cart[id].price * cart[id].quantity).toFixed(2)})\n`; });
    m += `\n💰 *Total:* $${total.toFixed(2)}`;
    window.open(`https://api.whatsapp.com/send?phone=${PHONE_NUMBER}&text=${encodeURIComponent(m)}`, '_blank');
}

function mostrarVentanaExito(show) { if (document.getElementById("successModal")) document.getElementById("successModal").style.setProperty("display", show ? "flex" : "none", "important"); }
function finalizarYRecargar() { cart = {}; mostrarVentanaExito(false); window.location.reload(); }

function inicializarContadorEnVivo() {
    const text = document.getElementById("counterText"); if (!text) return;
    let pers = Math.floor(Math.random() * 15) + 8;
    setInterval(() => { pers += Math.random() > 0.5 ? 1 : -1; if (pers < 5) pers = 5; text.innerHTML = `🔥 <span style="color:#25D366; font-weight:800;">${pers} personas</span> viendo el menú`; }, 5000);
}