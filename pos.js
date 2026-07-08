const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzkuwrgkl3Vv68AZ8xZg2JspV_oDmwr_bSmtb-pq6HN9FqF8QIUtbvofZ-dCWucekjS/exec";

let products = [];
let cart = {};
let totalVenta = 0;

document.addEventListener("DOMContentLoaded", () => {
    cargarProductosPOS();
});

function cargarProductosPOS() {
    const container = document.getElementById("menuContainer");
    container.innerHTML = "<p style='color:#ff5500; text-align:center; padding:20px;'><i class='fa-solid fa-spinner fa-spin'></i> Sincronizando catálogo...</p>";
    
    fetch(GOOGLE_SCRIPT_URL, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        products = data.filter(p => p.id && p.nombre);
        
        // Ejecuta la lectura dinámica de tus categorías del Excel en el POS
        generarCategoriasDinamicasPOS(products);
        renderMenuPOS(products);
    })
    .catch(err => {
        console.error(err);
        container.innerHTML = "<p style='color:#ff3344;'>❌ Error de enlace a Sheets.</p>";
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

    productsArray.forEach(product => {
        const prodId = product.id.toString().trim();
        let precioLimpio = product.precio ? product.precio.toString().replace(/[^0-9.]/g, '') : "0";
        let precioFinal = parseFloat(precioLimpio) || 0;

        const card = document.createElement("div");
        card.className = "product-card";
        card.style.cursor = "pointer";
        card.onclick = () => agregarAlCarritoPOS(prodId);
        
        card.innerHTML = `
            <div class="product-info" style="padding: 16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                    <h3 style="font-size: 1.1rem; margin:0;">${product.nombre}</h3>
                    <span style="color: #ff944d; font-weight: 800; font-size: 1.15rem;">$${precioFinal.toFixed(2)}</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function buscarProducto() {
    const query = document.getElementById("posSearch").value.toLowerCase().trim();
    const filtrados = products.filter(p => p.nombre.toLowerCase().includes(query));
    renderMenuPOS(filtrados);
}

function filterCategory(category) {
    const buttons = document.querySelectorAll(".category-btn");
    buttons.forEach(btn => btn.classList.remove("active"));
    if (typeof event !== 'undefined' && event.target) event.target.classList.add("active");

    if (category === 'todos') {
        renderMenuPOS(products);
    } else {
        const filtrados = products.filter(p => p.categoria && p.categoria.toString().trim().toLowerCase() === category.toLowerCase());
        renderMenuPOS(filtrados);
    }
}

function agregarAlCarritoPOS(productId) {
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
        list.innerHTML = '<p style="color: #555; text-align: center; padding: 20px;">La cuenta está vacía.</p>';
        document.getElementById("posTotal").innerText = "$0.00";
        calcularCambio();
        return;
    }

    Object.keys(cart).forEach(id => {
        const item = cart[id];
        const subtotal = item.price * item.quantity;
        totalVenta += subtotal;

        const row = document.createElement("div");
        row.className = "cart-item";
        row.style.padding = "10px 0";
        row.innerHTML = `
            <span>${item.quantity}x ${item.name}</span>
            <div style="display:flex; align-items:center; gap:12px;">
                <span>$${subtotal.toFixed(2)}</span>
                <button class="qty-btn" style="padding: 2px 8px; border-radius:6px; background:#222;" onclick="cambiarCantidadPOS('${id}', -1)">-</button>
                <button class="qty-btn" style="padding: 2px 8px; border-radius:6px; background:#222;" onclick="cambiarCantidadPOS('${id}', 1)">+</button>
            </div>
        `;
        list.appendChild(row);
    });

    document.getElementById("posTotal").innerText = `$${totalVenta.toFixed(2)}`;
    calcularCambio();
}

function alternarCamposEfectivo() {
    const method = document.getElementById("posPaymentMethod").value;
    const section = document.getElementById("efectivoSection");
    if (method === "Efectivo") {
        section.style.display = "block";
    } else {
        section.style.display = "none";
        document.getElementById("pagaCon").value = "";
        document.getElementById("cambioAEntregar").innerText = "$0.00";
    }
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
    if (Object.keys(cart).length === 0) {
        alert("⚠️ Añade productos a la cuenta primero.");
        return;
    }

    const method = document.getElementById("posPaymentMethod").value;
    const pagaCon = parseFloat(document.getElementById("pagaCon").value) || totalVenta;
    const notas = document.getElementById("posNotes").value.trim() || "Venta mostrador local";

    if (method === "Efectivo" && pagaCon < totalVenta) {
        alert("⚠️ El monto recibido es menor que el total de la venta.");
        return;
    }

    let productosString = Object.keys(cart).map(id => `${cart[id].quantity}x ${cart[id].name}`).join(" | ");
    const cambioEntregado = method === "Efectivo" ? (pagaCon - totalVenta) : 0;

    const ventaData = {
        nombre: "Venta Local Mostrador",
        direccion: `Sucursal (${method})`,
        referencias: "POS Local",
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
    btn.innerText = "⏳ Archivando Venta...";

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        cache: "no-cache",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ventaData)
    })
    .then(() => {
        alert("✅ Venta Guardada con éxito en Google Sheets");
        cart = {};
        document.getElementById("posNotes").value = "";
        document.getElementById("pagaCon").value = "";
        actualizarUIPOS();
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Guardar e Imprimir Venta`;
    })
    .catch(err => {
        console.error(err);
        alert("❌ Ocurrió un error al guardar en la nube.");
        btn.disabled = false;
    });
}