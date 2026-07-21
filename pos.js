const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

let products = [];
let cart = {};
let totalVenta = 0;

document.addEventListener("DOMContentLoaded", () => {
    cargarProductosPOS();
});

function cargarProductosPOS() {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "<p style='color:#ff5500; text-align:center; padding:40px; font-size:1.1rem;'><i class='fa-solid fa-circle-notch fa-spin'></i> Sincronizando Caja con Google Sheets...</p>";
    
    fetch(GOOGLE_SCRIPT_URL, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        // CORRECCIÓN AQUÍ: Obtenemos el array interno de la nueva estructura
        const listaProductos = data.productos || [];
        
        products = listaProductos.filter(p => p.id && p.nombre);
        generarCategoriasDinamicasPOS(products);
        renderMenuPOS(products);
    })
    .catch(err => {
        console.error("Error en POS de red:", err);
        container.innerHTML = "<p style='color:#ff3344; text-align:center;'>❌ Error de red al enlazar base de datos.</p>";
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

    let htmlBotones = `<button class="category-btn active" onclick="filterCategory('todos')">Todos</button>`;
    categoriasUnicas.forEach(cat => {
        htmlBotones += `<button class="category-btn" onclick="filterCategory('${cat}')">${cat}</button>`;
    });

    nav.innerHTML = htmlBotones;
}

function renderMenuPOS(productsArray) {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "";

    if(productsArray.length === 0) {
        container.innerHTML = "<p style='color:#666; padding:20px;'>No se encontraron productos.</p>";
        return;
    }

    productsArray.forEach(product => {
        const prodId = product.id.toString().trim();
        let precioLimpio = product.precio ? product.precio.toString().replace(/[^0-9.]/g, '') : "0";
        let precioFinal = parseFloat(precioLimpio) || 0;

        const card = document.createElement("div");
        card.className = "pos-card";
        card.id = `product-card-${prodId}`;
        card.onclick = () => agregarAlCarritoPOS(prodId);
        
        card.innerHTML = `
            <h3>${product.nombre}</h3>
            <span class="price">$${precioFinal.toFixed(2)}</span>
        `;
        container.appendChild(card);
    });
}

function buscarProducto() {
    const query = document.getElementById("posSearch").value.toLowerCase().trim();
    const clearBtn = document.getElementById("clearSearchBtn");
    
    if (query !== "") {
        clearBtn.style.display = "block";
    } else {
        clearBtn.style.display = "none";
    }

    const filtrados = products.filter(p => p.nombre.toLowerCase().includes(query));
    renderMenuPOS(filtrados);
}

function limpiarBuscador() {
    document.getElementById("posSearch").value = "";
    document.getElementById("clearSearchBtn").style.display = "none";
    renderMenuPOS(products);
}

function filterCategory(category) {
    const buttons = document.querySelectorAll(".category-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    
    if (typeof event !== 'undefined' && event.target) {
        event.target.classList.add("active");
    }

    if (category === 'todos') {
        renderMenuPOS(products);
    } else {
        const filtrados = products.filter(p => p.categoria && p.categoria.toString().trim().toLowerCase() === category.toLowerCase());
        renderMenuPOS(filtrados);
    }
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

function actualizarUIPOS() {
    const list = document.getElementById("posItemsList");
    list.innerHTML = "";
    totalVenta = 0;

    if (Object.keys(cart).length === 0) {
        list.innerHTML = '<p style="color: #444; text-align: center; padding-top: 40px; font-size:0.95rem;">🎟️ Caja vacía. Selecciona un producto de la izquierda.</p>';
        document.getElementById("posTotal").innerText = "$0.00";
        calcularCambio();
        return;
    }

    Object.keys(cart).forEach(id => {
        const item = cart[id];
        const subtotal = item.price * item.quantity;
        totalVenta += subtotal;

        const row = document.createElement("div");
        row.className = "ticket-row";
        row.innerHTML = `
            <div style="display:flex; flex-direction:column; max-width:65%;">
                <span style="font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.name}</span>
                <span style="font-size:0.85rem; color:#666;">$${item.price.toFixed(2)} c/u</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-weight:700; color:#ff944d;">$${subtotal.toFixed(2)}</span>
                <div class="ticket-controls">
                    <button class="ticket-btn" onclick="cambiarCantidadPOS('${id}', -1)">-</button>
                    <span style="font-size:0.9rem; font-weight:800; min-width:18px; text-align:center; color:#fff;">${item.quantity}</span>
                    <button class="ticket-btn" onclick="cambiarCantidadPOS('${id}', 1)">+</button>
                </div>
            </div>
        `;
        list.appendChild(row);
    });

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

function 快捷Efectivo(denominacion) {
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

function procesarVentaPOS() {
    if (Object.keys(cart).length === 0) return;

    const method = document.getElementById("posPaymentMethod").value;
    const pagaCon = parseFloat(document.getElementById("pagaCon").value) || totalVenta;
    const notas = document.getElementById("posNotes").value.trim() || "Venta mostrador local";

    if (method === "Efectivo" && pagaCon < totalVenta) {
        alert("⚠️ Monto insuficiente.");
        return;
    }

    let productosString = Object.keys(cart).map(id => `${cart[id].quantity}x ${cart[id].name}`).join(" | ");
    const cambioEntregado = method === "Efectivo" ? (pagaCon - totalVenta) : 0;

    const ventaData = {
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

    const btn = document.getElementById("btnRegistrarVenta");
    btn.disabled = true;
    btn.style.background = "#222";
    btn.innerHTML = "<i class='fa-solid fa-circle-notch fa-spin' style='color:#ff5500;'></i> Archivando venta...";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ventaData)
    })
    .then(() => {
        cart = {};
        document.getElementById("posNotes").value = "";
        document.getElementById("pagaCon").value = "";
        actualizarUIPOS();
        btn.disabled = false;
        
        btn.style.background = "#25d366";
        btn.style.color = "#000";
        btn.innerHTML = "<i class='fa-solid fa-circle-check'></i> ¡Venta Registrada!";
        
        setTimeout(() => {
            btn.style.background = "linear-gradient(135deg, #ff5500, #ff8c00)";
            btn.style.color = "#fff";
            btn.innerHTML = "<i class='fa-solid fa-bolt'></i> Completar Registro de Venta";
        }, 2000);
    })
    .catch(err => {
        console.error(err);
        btn.disabled = false;
        btn.style.background = "#ff3344";
        btn.innerHTML = "<i class='fa-solid fa-triangle-exclamation'></i> Reintentar envío";
    });
}