// ==========================================
// CONFIGURACIÓN DEL NEGOCIO Y ADMINISTRADOR
// ==========================================
const PHONE_NUMBER = "528131151055"; 
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";
const ADMIN_PASSWORD = "gerahj1991"; // Contraseña segura para activar Punto de Venta Local

let products = [];
let cart = {};
let userCoordinates = null;
let clickCount = 0;

// 1. INICIALIZAR APLICACIÓN (EVENTOS DE CARGA UNIFICADOS)
document.addEventListener("DOMContentLoaded", () => {
    cargarProductosDesdeSheets();
    inicializarContadorEnVivo();
    inicializarAccesoOcultoAdmin();
});

// 2. CONEXIÓN CON GOOGLE SHEETS (LECTURA DEL MENÚ)
function cargarProductosDesdeSheets() {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "<p style='text-align:center; padding:40px; color:#ff5500; font-size: 1.2rem;'><i class='fa-solid fa-spinner fa-spin'></i> Cargando el menú delicioso...</p>";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "GET",
        redirect: "follow"
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            container.innerHTML = `<p style='text-align:center; padding:20px; color:#ff3344;'>❌ Error: ${data.error}</p>`;
            return;
        }
        
        products = data.filter(product => {
            return product.id && product.nombre && product.id.toString().trim() !== "" && product.nombre.toString().trim() !== "";
        });

        renderMenu(products);
    })
    .catch(error => {
        console.error("Error de conexión:", error);
        container.innerHTML = "<p style='text-align:center; padding:20px; color:#ff3344;'>❌ No se pudo conectar con la base de datos.</p>";
    });
}

// 3. RENDERIZAR PRODUCTOS (MAQUETACIÓN VERTICAL PREMIUM)
function renderMenu(productsArray) {
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
        if (estaAgotado) {
            controlsHTML = `<span class="txt-agotado">No disponible</span>`;
        } else {
            controlsHTML = isInCart 
                ? `<div class="quantity-controls">
                    <button type="button" class="qty-btn" onclick="updateQuantity('${prodId}', -1)">-</button>
                    <span class="qty-number">${cart[prodId].quantity}</span>
                    <button type="button" class="qty-btn" onclick="updateQuantity('${prodId}', 1)">+</button>
                   </div>`
                : `<button type="button" class="add-btn" onclick="addToCart('${prodId}')">Agregar +</button>`;
        }

        const imgUrl = product.imagen || "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?auto=format&fit=crop&w=500&q=80";
        let precioLimpio = product.precio ? product.precio.toString().replace(/[^0-9.]/g, '') : "0";
        let precioFinal = parseFloat(precioLimpio);
        if(isNaN(precioFinal)) precioFinal = 0;

        const card = document.createElement("div");
        card.className = `product-card ${estaAgotado ? 'agotado-card' : ''}`;
        
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
                    <div id="controls-${prodId}">
                        ${controlsHTML}
                    </div>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

// 4. FILTRAR POR CATEGORÍAS (CON CONTROL SEGURO DE PARAMETRO)
function filterCategory(category) {
    const buttons = document.querySelectorAll(".category-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    
    if (typeof event !== 'undefined' && event.target) {
        const btnActivo = event.target.closest('.category-btn');
        if (btnActivo) btnActivo.classList.add("active");
    }

    if (category === 'todos') {
        renderMenu(products);
    } else {
        const filtered = products.filter(p => p.categoria && p.categoria.toString().trim().toLowerCase() === category.toLowerCase());
        renderMenu(filtered);
    }
}

// 5. LÓGICA DEL CARRITO
function addToCart(productId) {
    const idClave = productId.toString().trim();
    const product = products.find(p => p.id.toString().trim() === idClave);
    if (!product) return;

    let precioLimpio = product.precio.toString().replace(/[^0-9.]/g, '');
    let precioNumerico = parseFloat(precioLimpio);
    if (isNaN(precioNumerico)) precioNumerico = 0;

    cart[idClave] = {
        name: product.nombre,
        price: precioNumerico,
        quantity: 1
    };
    
    updateCartUI();
    refreshProductCardControl(idClave);
}

function updateQuantity(productId, change) {
    const idClave = productId.toString().trim();
    if (!cart[idClave]) return;
    
    cart[idClave].quantity += change;
    if (cart[idClave].quantity <= 0) {
        delete cart[idClave];
    }
    
    updateCartUI();
    refreshProductCardControl(idClave);
}

function removeProductFromCart(productId) {
    const idClave = productId.toString().trim();
    if (cart[idClave]) {
        delete cart[idClave];
        updateCartUI();
        refreshProductCardControl(idClave);
    }
}

function refreshProductCardControl(productId) {
    const idClave = productId.toString().trim();
    const controlContainer = document.getElementById(`controls-${idClave}`);
    if (!controlContainer) return;

    if (cart[idClave]) {
        controlContainer.innerHTML = `
            <div class="quantity-controls">
                <button type="button" class="qty-btn" onclick="updateQuantity('${idClave}', -1)">-</button>
                <span class="qty-number">${cart[idClave].quantity}</span>
                <button type="button" class="qty-btn" onclick="updateQuantity('${idClave}', 1)">+</button>
            </div>
        `;
    } else {
        controlContainer.innerHTML = `<button type="button" class="add-btn" onclick="addToCart('${idClave}')">Agregar +</button>`;
    }
}

function updateCartUI() {
    let totalItems = 0;
    let totalPrice = 0;

    Object.keys(cart).forEach(id => {
        totalItems += cart[id].quantity;
        totalPrice += cart[id].price * cart[id].quantity;
    });

    const cartBar = document.getElementById("cartBar");
    if (!cartBar) return;

    if (totalItems > 0) {
        cartBar.style.setProperty("display", "block", "important");
        document.getElementById("cartCount").innerText = `${totalItems} ${totalItems === 1 ? 'ítem' : 'ítems'}`;
        document.getElementById("cartTotalHeader").innerText = `$${totalPrice.toFixed(2)}`;
    } else {
        cartBar.style.display = "none";
        toggleCartModal(false);
    }

    const modalTotal = document.getElementById("cartModalTotal");
    if (modalTotal) modalTotal.innerText = `$${totalPrice.toFixed(2)}`;
    
    const listContainer = document.getElementById("cartItemsList");
    if (listContainer) {
        listContainer.innerHTML = "";
        Object.keys(cart).forEach(id => {
            const item = cart[id];
            const itemRow = document.createElement("div");
            itemRow.className = "cart-item";
            itemRow.innerHTML = `
                <div class="cart-item-left">
                    <span>${item.quantity}x ${item.name}</span>
                </div>
                <div class="cart-item-right">
                    <span>$${(item.price * item.quantity).toFixed(2)}</span>
                    <button type="button" class="delete-item-btn" onclick="removeProductFromCart('${id}')">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            `;
            listContainer.appendChild(itemRow);
        });
    }
}

function toggleCartModal(show) {
    const modal = document.getElementById("cartModal");
    if (!modal) return;
    modal.style.setProperty("display", show ? "flex" : "none", "important");
}

// 6. GEOLOCALIZACIÓN
function getLocation() {
    const statusText = document.getElementById("gpsStatus");
    const gpsBtn = document.getElementById("gpsBtn");
    if (!navigator.geolocation) return;

    statusText.innerText = "⏳ Localizando con precisión...";
    statusText.style.color = "#ff5500";
    gpsBtn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            const accuracy = position.coords.accuracy;
            
            userCoordinates = `https://www.google.com/maps?q=${lat},${lon}`;
            statusText.innerHTML = `✅ ¡Ubicación guardada! (Precisión: +/- ${Math.round(accuracy)}m)`;
            statusText.style.color = "#25D366";
            gpsBtn.disabled = false;
        },
        (error) => {
            console.error("Error GPS:", error);
            statusText.innerText = "❌ Permiso denegado o error de señal GPS.";
            gpsBtn.disabled = false;
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

// 7. ENVIAR PEDIDO ESTÁNDAR (CLIENTE POR WHATSAPP)
function sendOrder(event) {
    event.preventDefault();
    const name = document.getElementById("clientName").value.trim();
    const address = document.getElementById("clientAddress").value.trim();
    const references = document.getElementById("clientReferences").value.trim();
    const notes = document.getElementById("clientNotes").value.trim() || "Sin instrucciones especiales.";

    let listaProductosExcel = "";
    let total = 0;
    
    Object.keys(cart).forEach(id => {
        const item = cart[id];
        const subtotal = item.price * item.quantity;
        total += subtotal;
        listaProductosExcel += `${item.quantity}x ${item.name} | `;
    });
    listaProductosExcel = listaProductosExcel.slice(0, -3);

    const pedidoData = {
        nombre: name,
        direccion: address,
        referencias: references,
        gps: userCoordinates || "No compartido",
        productos: listaProductosExcel,
        total: total,
        notas: notes
    };

    const submitBtn = event.target.querySelector(".submit-order-btn");
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando pedido...`;
    submitBtn.disabled = true;

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedidoData)
    })
    .then(() => {
        toggleCartModal(false);
        procesarEnvioWhatsApp(name, address, references, total, notes);
        mostrarVentanaExito(true, false); 
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    })
    .catch(error => {
        console.error("Error al guardar:", error);
        toggleCartModal(false);
        procesarEnvioWhatsApp(name, address, references, total, notes);
        mostrarVentanaExito(true, false);
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    });
}

function procesarEnvioWhatsApp(name, address, references, total, notes) {
    // Corregidos los saltos de línea usando '\n' limpio para que WhatsApp los reconozca bien
    let message = `🛵 *NUEVO PEDIDO A DOMICILIO* 🛵\n`;
    message += `--------------------------------\n`;
    message += `👤 *Cliente:* ${name}\n`;
    message += `🏠 *Dirección:* ${address}\n`;
    message += `📍 *Referencias:* ${references}\n`;
    message += `💬 *Notas:* ${notes}\n`; 
    message += `🗺️ *Ubicación GPS:* ${userCoordinates || 'No compartida'}\n`;
    message += `--------------------------------\n`;
    message += `📝 *DETALLE DEL PEDIDO:*\n`;

    Object.keys(cart).forEach(id => {
        const item = cart[id];
        message += `• ${item.quantity}x ${item.name} ($${(item.price * item.quantity).toFixed(2)})\n`;
    });

    message += `\n💰 *Total a Pagar:* $${total.toFixed(2)}\n`;
    message += `--------------------------------`;

    // El encodeURIComponent se encargará de transformar los '\n' reales en saltos de línea espaciados para la API
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://api.whatsapp.com/send?phone=${PHONE_NUMBER}&text=${encodedMessage}`, '_blank');
}
// 8. MÓDULO OCULTO PUNTO DE VENTA (VENTAS EN SUCURSAL / MOSTRADOR)
function inicializarAccesoOcultoAdmin() {
    const heroTitle = document.querySelector(".hero-overlay h1");
    if (heroTitle) {
        heroTitle.style.cursor = "pointer";
        heroTitle.addEventListener("click", () => {
            clickCount++;
            if (clickCount === 3) {
                verificarAccesoAdmin();
                clickCount = 0; 
            }
            setTimeout(() => { clickCount = 0; }, 2000);
        });
    }
}

function verificarAccesoAdmin() {
    const adminPanel = document.getElementById("adminPanel");
    
    if (adminPanel && adminPanel.style.display === "block") {
        toggleAdminMode();
        return;
    }

    const passwordInput = prompt("🔑 Ingrese la contraseña de administrador para activar el Modo Caja:");
    if (passwordInput === null) return; 

    if (passwordInput === ADMIN_PASSWORD) {
        toggleAdminMode();
    } else {
        alert("❌ Contraseña incorrecta. Acceso denegado.");
    }
}

function toggleAdminMode() {
    const adminPanel = document.getElementById("adminPanel");
    const clientName = document.getElementById("clientName");
    const clientAddress = document.getElementById("clientAddress");
    const clientReferences = document.getElementById("clientReferences");
    const gpsContainer = document.querySelector(".gps-container");
    const whatsappBtn = document.querySelector(".submit-order-btn[type='submit']");

    if (adminPanel.style.display === "none" || adminPanel.style.display === "") {
        adminPanel.style.display = "block";
        whatsappBtn.style.display = "none"; 
        if (gpsContainer) gpsContainer.style.setProperty("display", "none", "important"); 
        
        clientName.placeholder = "Nombre del cliente local (Opcional)";
        clientName.required = false;
        clientAddress.style.display = "none";
        clientAddress.required = false;
        clientReferences.style.display = "none";
        clientReferences.required = false;
        
        alert("🔥 ¡Modo Caja Activado con éxito! Listo para registrar pedidos presenciales.");
    } else {
        adminPanel.style.display = "none";
        whatsappBtn.style.display = "block";
        if (gpsContainer) gpsContainer.style.setProperty("display", "block", "important");
        
        clientName.placeholder = "Nombre completo (¿A nombre de quién?)";
        clientName.required = true;
        clientAddress.style.display = "block";
        clientAddress.required = true;
        clientReferences.style.display = "block";
        clientReferences.required = true;
        
        alert("ℹ️ Regresando al Menú Digital estándar para clientes.");
    }
}

function sendLocalOrder() {
    let total = 0;
    let listaProductosExcel = "";
    
    if (Object.keys(cart).length === 0) {
        alert("⚠️ El carrito está vacío. Agrega productos antes de registrar la venta.");
        return;
    }

    Object.keys(cart).forEach(id => {
        const item = cart[id];
        total += item.price * item.quantity;
        listaProductosExcel += `${item.quantity}x ${item.name} | `;
    });
    listaProductosExcel = listaProductosExcel.slice(0, -3);

    const name = document.getElementById("clientName").value.trim() || "Cliente Local Mostrador";
    const payment = document.getElementById("paymentMethod").value;
    const notes = document.getElementById("clientNotes").value.trim() || "Venta presencial en sucursal.";

    const pedidoData = {
        nombre: name,
        direccion: `Venta Local (${payment})`, 
        referencias: "Mostrador / Sucursal",
        gps: "No aplica (Presencial)",
        productos: listaProductosExcel,
        total: total,
        notes: notes
    };

    const localBtn = document.querySelector("#adminPanel button");
    const originalLocalText = localBtn.innerHTML;
    localBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando en Sheet...`;
    localBtn.disabled = true;

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pedidoData)
    })
    .then(() => {
        toggleCartModal(false);
        mostrarVentanaExito(true, true); 
        localBtn.innerHTML = originalLocalText;
        localBtn.disabled = false;
    })
    .catch(error => {
        console.error("Error al registrar venta local:", error);
        toggleCartModal(false);
        mostrarVentanaExito(true, true);
        localBtn.innerHTML = originalLocalText;
        localBtn.disabled = false;
    });
}

// 9. CONTROL DE VENTANAS EMERGENTES (ÉXITO DINÁMICO)
function mostrarVentanaExito(show, isAdminSale = false) {
    const successModal = document.getElementById("successModal");
    if (!successModal) return;
    
    if (show) {
        const titleEl = successModal.querySelector("h2");
        const msgEl = document.getElementById("successModalMessage");
        const timeBoxEl = document.getElementById("deliveryTimeBox");

        if (isAdminSale) {
            if (titleEl) titleEl.innerText = "¡Venta Registrada con Éxito!";
            if (msgEl) msgEl.innerText = "La orden presencial fue almacenada correctamente en el archivo de Google Sheets de tu negocio.";
            if (timeBoxEl) timeBoxEl.style.setProperty("display", "none", "important");
        } else {
            if (titleEl) titleEl.innerText = "¡Pedido Enviado con Éxito!";
            if (msgEl) msgEl.innerText = "Tu orden ha sido registrada correctamente y te redirigimos a WhatsApp para terminar de procesarla con el repartidor.";
            if (timeBoxEl) timeBoxEl.style.setProperty("display", "flex", "important");
        }
        successModal.style.setProperty("display", "flex", "important");
    } else {
        successModal.style.display = "none";
    }
}

function finalizarYRecargar() {
    cart = {};
    mostrarVentanaExito(false);
    window.location.reload();
}

// 10. COMPONENTE CONTADOR EN VIVO REALISTA
function inicializarContadorEnVivo() {
    const counterText = document.getElementById("counterText");
    if (!counterText) return;

    let personasActivas = Math.floor(Math.random() * (22 - 8 + 1)) + 8;
    
    function actualizarPantalla() {
        counterText.innerHTML = `🔥 <span style="color:#25D366; font-weight:800;">${personasActivas} personas</span> viendo el menú ahora`;
    }

    actualizarPantalla();

    setInterval(() => {
        const cambio = Math.random() > 0.5 ? 1 : -1;
        personasActivas += cambio;

        if (personasActivas < 5) personasActivas = 5;
        if (personasActivas > 30) personasActivas = 30;

        actualizarPantalla();
    }, 5000);
}
