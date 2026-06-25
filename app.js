// ==========================================
// CONFIGURACIÓN DEL NEGOCIO
// ==========================================
const PHONE_NUMBER = "528129411481"; 
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

let products = [];
let cart = {};
let userCoordinates = null;

// 1. INICIALIZAR APLICACIÓN
document.addEventListener("DOMContentLoaded", () => {
    cargarProductosDesdeSheets();
});

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

// 2. RENDERIZAR PRODUCTOS (MAQUETACIÓN VERTICAL PREMIUM)
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
                    <button class="qty-btn" onclick="updateQuantity('${prodId}', -1)">-</button>
                    <span class="qty-number">${cart[prodId].quantity}</span>
                    <button class="qty-btn" onclick="updateQuantity('${prodId}', 1)">+</button>
                   </div>`
                : `<button class="add-btn" onclick="addToCart('${prodId}')">Agregar +</button>`;
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

// 3. FILTRAR POR CATEGORÍAS
function filterCategory(category) {
    const buttons = document.querySelectorAll(".category-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    
    if (event && event.target) {
        // Soporte si hacen click en el icono interno del botón
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

// 4. LÓGICA DEL CARRITO
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
                <button class="qty-btn" onclick="updateQuantity('${idClave}', -1)">-</button>
                <span class="qty-number">${cart[idClave].quantity}</span>
                <button class="qty-btn" onclick="updateQuantity('${idClave}', 1)">+</button>
            </div>
        `;
    } else {
        controlContainer.innerHTML = `<button class="add-btn" onclick="addToCart('${idClave}')">Agregar +</button>`;
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
                    <button class="delete-item-btn" onclick="removeProductFromCart('${id}')">
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
        gps: userCoordinates,
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
        mostrarVentanaExito(true);
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    })
    .catch(error => {
        console.error("Error al guardar:", error);
        toggleCartModal(false);
        procesarEnvioWhatsApp(name, address, references, total, notes);
        mostrarVentanaExito(true);
        submitBtn.innerHTML = originalBtnText;
        submitBtn.disabled = false;
    });
}

function procesarEnvioWhatsApp(name, address, references, total, notes) {
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

    const encodedMessage = encodeURIComponent(message);
    window.open(`https://api.whatsapp.com/send?phone=${PHONE_NUMBER}&text=${encodedMessage}`, '_blank');
}

function mostrarVentanaExito(show) {
    const successModal = document.getElementById("successModal");
    if (successModal) {
        successModal.style.setProperty("display", show ? "flex" : "none", "important");
    }
}

function finalizarYRecargar() {
    cart = {};
    mostrarVentanaExito(false);
    window.location.reload();
}

// ==========================================================================
// CONTROLADOR DEL CONTADOR DE PERSONAS EN VIVO
// ==========================================================================
function inicializarContadorEnVivo() {
    const counterText = document.getElementById("counterText");
    if (!counterText) return;

    // Generamos un número base realista de personas viendo según la hora (ej: entre 8 y 22 personas)
    let personasActivas = Math.floor(Math.random() * (22 - 8 + 1)) + 8;
    
    // Función para actualizar el texto en pantalla
    function actualizarPantalla() {
        counterText.innerHTML = `🔥 <span style="color:#25D366; font-weight:800;">${personasActivas} personas</span> viendo el menú ahora`;
    }

    actualizarPantalla();

    // Cada 5 segundos simulamos de forma orgánica que entra o sale alguien del menú
    setInterval(() => {
        const cambio = Math.random() > 0.5 ? 1 : -1;
        personasActivas += cambio;

        // Mantener el número en un rango coherente (mínimo 5, máximo 30) para que sea creíble
        if (personasActivas < 5) personasActivas = 5;
        if (personasActivas > 30) personasActivas = 30;

        actualizarPantalla();
    }, 5000);
}

// Modificamos ligeramente la inicialización para arrancar el contador
document.addEventListener("DOMContentLoaded", () => {
    cargarProductosDesdeSheets();
    inicializarContadorEnVivo(); // <-- Activa el contador al cargar la página
});
