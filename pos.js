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

// TURNO GLOBAL Y CAJA CHICA (SINCRONIZADOS CON LA NUBE)
let turnoPOS = {
    activo: false,
    idTurno: null,
    fondoInicial: 0,
    gastos: [],
    fechaApertura: null
};

let listaVentasGlobalesTurno = [];

document.addEventListener("DOMContentLoaded", () => {
    comprobarSesionPOS();
});

// ==========================================================================
// FUNCIÓN PARSEADORA DE FECHAS (SOPORTA FORMATOS VIEJOS Y NUEVOS)
// ==========================================================================
function parsearFechaUniversal(strFecha) {
    if (!strFecha) return new Date(0);
    
    let timestamp = Date.parse(strFecha);
    if (!isNaN(timestamp)) return new Date(timestamp);

    let partes = strFecha.toString().trim().split(" ");
    if (partes.length >= 1) {
        let fPartes = partes[0].split("-");
        if (fPartes.length === 3) {
            let anio = parseInt(fPartes[0], 10);
            let mes = parseInt(fPartes[1], 10) - 1;
            let dia = parseInt(fPartes[2], 10);
            
            let hora = 0, min = 0, seg = 0;
            if (partes[1]) {
                let hPartes = partes[1].split(":");
                hora = parseInt(hPartes[0], 10) || 0;
                min = parseInt(hPartes[1], 10) || 0;
                seg = parseInt(hPartes[2], 10) || 0;
            }
            return new Date(anio, mes, dia, hora, min, seg);
        }
    }
    return new Date(0);
}

function formatearFechaEspanolBonito(fechaObj) {
    const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    let nomDia = dias[fechaObj.getDay()];
    let numDia = fechaObj.getDate();
    let nomMes = meses[fechaObj.getMonth()];
    let anio = fechaObj.getFullYear();

    return `${nomDia}, ${numDia} de ${nomMes} ${anio}`;
}

// ==========================================================================
// 0. SEGURIDAD, LOGIN Y TURNO GLOBAL
// ==========================================================================
function comprobarSesionPOS() {
    const tokenGuardado = localStorage.getItem("POS_TACOS_TOKEN");
    if (tokenGuardado) {
        ocultarLoginPOS();
        consultarTurnoGlobalServidor();
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
            consultarTurnoGlobalServidor();
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

function consultarTurnoGlobalServidor() {
    fetch(`${GOOGLE_SCRIPT_URL}?action=getTurnoGlobal`, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        if (data.turno && data.turno.estado === "ABIERTO") {
            turnoPOS.activo = true;
            turnoPOS.idTurno = data.turno.idTurno;
            turnoPOS.fondoInicial = parseFloat(data.turno.fondoInicial) || 0;
            turnoPOS.fechaApertura = data.turno.fechaApertura;
            turnoPOS.gastos = data.gastos || [];
            
            document.getElementById("modalFondoInicial").style.display = "none";
            iniciarTerminalPOS();
        } else {
            turnoPOS.activo = false;
            document.getElementById("modalFondoInicial").style.display = "flex";
            setTimeout(() => document.getElementById("inputFondoInicial").focus(), 100);
        }
    })
    .catch(err => {
        console.error("Error al verificar turno en la nube", err);
        iniciarTerminalPOS();
    });
}

function guardarFondoInicial(event) {
    event.preventDefault();
    const token = localStorage.getItem("POS_TACOS_TOKEN");
    const monto = parseFloat(document.getElementById("inputFondoInicial").value) || 0;
    
    if (!token) return alert("⚠️ Sesión no válida.");

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "abrirTurnoGlobal", fondoInicial: monto, token: token })
    })
    .then(res => res.json())
    .then(data => {
        if (data.result === "success") {
            turnoPOS.activo = true;
            turnoPOS.idTurno = data.idTurno;
            turnoPOS.fondoInicial = data.fondoInicial;
            turnoPOS.fechaApertura = data.fechaApertura;
            turnoPOS.gastos = [];
            
            document.getElementById("modalFondoInicial").style.display = "none";
            iniciarTerminalPOS();
        } else {
            alert("❌ " + (data.message || "Error al abrir turno."));
        }
    })
    .catch(() => alert("❌ Error de red al registrar el fondo inicial."));
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
// 1. HISTORIAL DE VENTAS CON EDICIÓN DE MÉTODO DE PAGO
// ==========================================================================
function abrirModalHistorialVentas() {
    const container = document.getElementById("containerListaHistorialVentas");
    container.innerHTML = "<p style='color:#ff5500; text-align:center; padding:30px;'><i class='fa-solid fa-spinner fa-spin'></i> Cargando ventas de la nube...</p>";
    document.getElementById("modalHistorialVentas").style.display = "flex";

    fetch(`${GOOGLE_SCRIPT_URL}?action=getPedidos`, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        container.innerHTML = "";
        let pedidos = Array.isArray(data) ? data : [];
        
        listaVentasGlobalesTurno = pedidos.filter(p => p.estatus !== "CANCELADO");

        if (listaVentasGlobalesTurno.length === 0) {
            container.innerHTML = "<p style='color:#666; text-align:center; padding:30px;'>No hay ventas registradas.</p>";
            return;
        }

        const gruposPorFecha = {};
        const hoyObj = new Date();
        const hoyClaveStr = `${hoyObj.getFullYear()}-${(hoyObj.getMonth()+1).toString().padStart(2,'0')}-${hoyObj.getDate().toString().padStart(2,'0')}`;
        
        const ayerObj = new Date(); ayerObj.setDate(ayerObj.getDate() - 1);
        const ayerClaveStr = `${ayerObj.getFullYear()}-${(ayerObj.getMonth()+1).toString().padStart(2,'0')}-${ayerObj.getDate().toString().padStart(2,'0')}`;

        listaVentasGlobalesTurno.forEach((v, indexReal) => {
            let fObj = parsearFechaUniversal(v.fecha);
            let claveFecha = `${fObj.getFullYear()}-${(fObj.getMonth()+1).toString().padStart(2,'0')}-${fObj.getDate().toString().padStart(2,'0')}`;
            
            if (!gruposPorFecha[claveFecha]) {
                gruposPorFecha[claveFecha] = { fechaObj: fObj, ventas: [] };
            }
            gruposPorFecha[claveFecha].ventas.push({ ...v, indexReal: indexReal, fechaObj: fObj });
        });

        const clavesOrdenadas = Object.keys(gruposPorFecha).sort().reverse();

        clavesOrdenadas.forEach(clave => {
            let grupo = gruposPorFecha[clave];
            let totalDia = grupo.ventas.reduce((acc, item) => acc + (parseFloat(item.total) || 0), 0);

            let etiquetaTitulo = "";
            if (clave === hoyClaveStr) etiquetaTitulo = "🔥 HOY - " + formatearFechaEspanolBonito(grupo.fechaObj);
            else if (clave === ayerClaveStr) etiquetaTitulo = "📅 AYER - " + formatearFechaEspanolBonito(grupo.fechaObj);
            else etiquetaTitulo = "📅 " + formatearFechaEspanolBonito(grupo.fechaObj);

            const headerDiv = document.createElement("div");
            headerDiv.style.cssText = "background: rgba(255, 85, 0, 0.12); border-left: 4px solid #ff5500; padding: 8px 12px; border-radius: 8px; margin: 15px 0 10px 0; display: flex; justify-content: space-between; align-items: center;";
            headerDiv.innerHTML = `
                <span style="color: #fff; font-weight: 700; font-size: 0.85rem;">${etiquetaTitulo}</span>
                <span style="color: #ff944d; font-weight: 700; font-size: 0.85rem;">Total: $${totalDia.toFixed(2)}</span>
            `;
            container.appendChild(headerDiv);

            grupo.ventas.sort((a, b) => b.fechaObj - a.fechaObj);

            grupo.ventas.forEach(v => {
                const card = document.createElement("div");
                card.className = "history-item-card";

                let productosCorta = (v.productos || "").replace(/\|/g, ", ");
                let horaCorta = v.fechaObj.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
                
                let mActual = (v.metodo_pago || "Efectivo").toString().trim();
                let fechaEscapada = (v.fecha || "").toString().replace(/'/g, "\\'");

                card.innerHTML = `
                    <div style="display:flex; flex-direction:column; max-width:58%;">
                        <span style="color:#fff; font-weight:700; font-size:0.9rem;">${v.cliente || v.nombre || 'General'}</span>
                        <div style="display:flex; align-items:center; gap:6px; margin: 2px 0;">
                            <span style="color:#888; font-size:0.75rem;">${horaCorta} hs</span>
                            <!-- SELECT EDICIÓN DE MÉTODO DE PAGO EN HISTORIAL ENLAZADO POR FECHA EXACTA DE COLUMNA A -->
                            <select class="select-metodo-historial" onchange="cambiarMetodoPagoHistorial('${fechaEscapada}', this.value, ${v.indexReal})">
                                <option value="Efectivo" ${mActual.includes("Efectivo") ? 'selected' : ''}>💵 Efectivo</option>
                                <option value="Tarjeta" ${mActual.includes("Tarjeta") ? 'selected' : ''}>💳 Tarjeta</option>
                                <option value="Transferencia" ${(mActual.includes("Transferencia") || mActual.includes("SPEI")) ? 'selected' : ''}>📲 SPEI</option>
                            </select>
                        </div>
                        <span style="color:#aaa; font-size:0.75rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${productosCorta}">${productosCorta}</span>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                        <strong style="color:#ff944d; font-size:1rem;">$${parseFloat(v.total || 0).toFixed(2)}</strong>
                        <div style="display:flex; gap:6px;">
                            <button onclick="enviarVentaEspecificaWhatsApp(${v.indexReal})" style="background:#25D366; color:#fff; border:none; padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;" title="Enviar por WhatsApp">
                                <i class="fa-brands fa-whatsapp"></i> WhatsApp
                            </button>
                            <button onclick="reimprimirTicketGenerico(${v.indexReal})" style="background:#222; color:#fff; border:1px solid rgba(255,255,255,0.1); padding:6px 10px; border-radius:8px; font-size:0.75rem; font-weight:700; cursor:pointer;" title="Imprimir Ticket">
                                <i class="fa-solid fa-print"></i>
                            </button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        });
    })
    .catch(() => {
        container.innerHTML = "<p style='color:#ff3344; text-align:center; padding:20px;'>❌ Error al conectar con el servidor.</p>";
    });
}

function cambiarMetodoPagoHistorial(fechaPedido, nuevoMetodo, indexReal) {
    if (listaVentasGlobalesTurno[indexReal]) {
        listaVentasGlobalesTurno[indexReal].metodo_pago = nuevoMetodo;
    }

    const token = localStorage.getItem("POS_TACOS_TOKEN");

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "actualizarMetodoPago",
            fechaPedido: fechaPedido,
            metodoPago: nuevoMetodo,
            token: token
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.result === "success") {
            console.log("✅ Método de pago actualizado correctamente en Google Sheets.");
        } else {
            console.error("❌ No se pudo actualizar:", data.message);
        }
    })
    .catch(err => console.error("Error al guardar cambio en Sheets:", err));
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
    msg += `👤 *Lugar/Cliente:* ${v.cliente || v.nombre || 'General'}\n`;
    msg += `💳 *Método de Pago:* ${v.metodo_pago}\n`;
    if (v.notas && v.notas !== "Venta local") msg += `📝 *Notas:* ${v.notas}\n`;
    msg += `----------------------------------\n`;
    msg += `🛒 *DESGLOSE:*\n${itemsTexto}`;
    msg += `----------------------------------\n`;
    msg += `💰 *TOTAL: $${parseFloat(v.total || 0).toFixed(2)}*\n`;
    if (v.metodo_pago === 'Efectivo') {
        msg += `💵 *Pagó con:* $${parseFloat(v.efectivo_recibido || v.total).toFixed(2)}\n`;
        msg += `🪙 *Cambio:* $${parseFloat(v.cambio || 0).toFixed(2)}\n`;
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
    const v = listaVentasGlobalesTurno[index];
    if (!v) return;
    const textoUrl = generarTextoWhatsAppTicket(v);
    window.open(`https://api.whatsapp.com/send?text=${textoUrl}`, '_blank');
}

function reimprimirTicketGenerico(index) {
    const v = listaVentasGlobalesTurno[index];
    if (v) imprimirTicketPOS(v);
}

// ==========================================================================
// 2. GESTIÓN DE SALIDAS DE EFECTIVO (GASTOS)
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
    const token = localStorage.getItem("POS_TACOS_TOKEN");
    const monto = parseFloat(document.getElementById("gastoMonto").value) || 0;
    const concepto = document.getElementById("gastoConcepto").value.trim();

    if (monto <= 0 || !concepto) return alert("⚠️ Ingresa un monto y concepto válidos.");
    if (!token) return alert("⚠️ Sesión no válida.");

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "registrarGastoGlobal",
            monto: monto,
            concepto: concepto,
            idTurno: turnoPOS.idTurno || "",
            token: token
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.result === "success") {
            turnoPOS.gastos.push({ monto: monto, concepto: concepto, fecha: new Date().toLocaleTimeString() });
            cerrarModalGastoPOS();
            alert(`✅ Salida de $${monto.toFixed(2)} registrada correctamente.`);
        } else {
            alert("❌ " + (data.message || "Error al registrar salida."));
        }
    })
    .catch(() => alert("❌ Error de red al registrar la salida."));
}

// ==========================================================================
// 3. ARQUEO Y CORTE DE CAJA (DESGLOSE DE MONEDAS/BILLETES Y PLATILLO ESTRELLA)
// ==========================================================================
function abrirModalCorteCaja() {
    const modal = document.getElementById("modalCorteCaja");
    modal.style.display = "flex";

    fetch(`${GOOGLE_SCRIPT_URL}?action=getPedidos`, { method: "GET", redirect: "follow" })
    .then(res => res.json())
    .then(data => {
        let pedidos = Array.isArray(data) ? data : [];
        let fechaAperturaObj = parsearFechaUniversal(turnoPOS.fechaApertura);

        let ventasEfectivoTotal = 0;
        let ventasTarjetaTotal = 0;
        let ventasSpeiTotal = 0;

        const conteoPlatillos = {};

        pedidos.forEach(p => {
            if (p.estatus !== "CANCELADO") {
                let fechaPedidoObj = parsearFechaUniversal(p.fecha);
                
                if (fechaPedidoObj >= fechaAperturaObj) {
                    let m = (p.metodo_pago || "").toString().toLowerCase();
                    let tot = parseFloat(p.total) || 0;
                    if (m.includes("efectivo") || m.includes("local") || m === "") ventasEfectivoTotal += tot;
                    else if (m.includes("tarjeta")) ventasTarjetaTotal += tot;
                    else if (m.includes("transferencia") || m.includes("spei")) ventasSpeiTotal += tot;

                    if (p.productos) {
                        p.productos.split("|").forEach(itemRaw => {
                            let item = itemRaw.trim();
                            if (item !== "") {
                                let partes = item.split("x ");
                                if (partes.length >= 2) {
                                    let cant = parseInt(partes[0], 10) || 1;
                                    let nombreProd = partes[1].split(" ($")[0].trim();
                                    
                                    if (!nombreProd.includes("Envío")) {
                                        conteoPlatillos[nombreProd] = (conteoPlatillos[nombreProd] || 0) + cant;
                                    }
                                }
                            }
                        });
                    }
                }
            }
        });

        let platilloEstrella = "Ninguno";
        let maxCantidad = 0;

        Object.keys(conteoPlatillos).forEach(nombre => {
            if (conteoPlatillos[nombre] > maxCantidad) {
                maxCantidad = conteoPlatillos[nombre];
                platilloEstrella = nombre;
            }
        });

        document.getElementById("cortePlatilloEstrella").innerText = platilloEstrella;
        document.getElementById("cortePlatilloEstrellaCant").innerText = `${maxCantidad} vendido(s)`;

        let totalGastos = 0;
        if (turnoPOS.gastos) turnoPOS.gastos.forEach(g => totalGastos += (parseFloat(g.monto) || 0));

        const efectivoEsperado = (turnoPOS.fondoInicial || 0) + ventasEfectivoTotal - totalGastos;

        document.getElementById("corteFondo").innerText = `$${(turnoPOS.fondoInicial || 0).toFixed(2)}`;
        document.getElementById("corteVentasEfectivo").innerText = `$${ventasEfectivoTotal.toFixed(2)}`;
        document.getElementById("corteGastos").innerText = `$${totalGastos.toFixed(2)}`;
        document.getElementById("corteEfectivoEsperado").innerText = `$${efectivoEsperado.toFixed(2)}`;

        document.getElementById("corteTarjeta").innerText = `$${ventasTarjetaTotal.toFixed(2)}`;
        document.getElementById("corteSpei").innerText = `$${ventasSpeiTotal.toFixed(2)}`;

        document.querySelectorAll(".input-denominacion").forEach(inp => inp.value = "");
        document.getElementById("lblTotalEfectivoContado").innerText = "$0.00";
        document.getElementById("lblDiferenciaCaja").innerText = "";
    });
}

function cerrarModalCorteCaja() {
    document.getElementById("modalCorteCaja").style.display = "none";
}

function calcularDesgloseEfectivo() {
    let totalContado = 0;
    document.querySelectorAll(".input-denominacion").forEach(inp => {
        let cant = parseInt(inp.value, 10) || 0;
        let valor = parseFloat(inp.getAttribute("data-valor")) || 0;
        totalContado += (cant * valor);
    });

    document.getElementById("lblTotalEfectivoContado").innerText = `$${totalContado.toFixed(2)}`;

    let totalGastos = 0;
    if (turnoPOS.gastos) turnoPOS.gastos.forEach(g => totalGastos += (parseFloat(g.monto) || 0));

    let ventasEfectivo = parseFloat(document.getElementById("corteVentasEfectivo").innerText.replace("$", "")) || 0;
    const efectivoEsperado = (turnoPOS.fondoInicial || 0) + ventasEfectivo - totalGastos;

    const lblDif = document.getElementById("lblDiferenciaCaja");
    const diferencia = totalContado - efectivoEsperado;

    if (totalContado === 0) {
        lblDif.innerText = "";
        return;
    }

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
            let m = parseFloat(g.monto) || 0;
            totalGastos += m;
            gastosHTML += `<div>- ${g.concepto}: $${m.toFixed(2)}</div>`;
        });
    } else {
        gastosHTML = `<div>Ninguna salida registrada</div>`;
    }

    let ventasEfectivo = parseFloat(document.getElementById("corteVentasEfectivo").innerText.replace("$", "")) || 0;
    let ventasTarjeta = document.getElementById("corteTarjeta").innerText;
    let ventasSpei = document.getElementById("corteSpei").innerText;

    const efectivoEsperado = (turnoPOS.fondoInicial || 0) + ventasEfectivo - totalGastos;
    
    let contado = 0;
    let desgloseHTML = "";
    document.querySelectorAll(".input-denominacion").forEach(inp => {
        let cant = parseInt(inp.value, 10) || 0;
        let valor = parseFloat(inp.getAttribute("data-valor")) || 0;
        if (cant > 0) {
            let sub = cant * valor;
            contado += sub;
            desgloseHTML += `<div>• $${valor.toFixed(2)} x ${cant} = $${sub.toFixed(2)}</div>`;
        }
    });

    const diferencia = contado - efectivoEsperado;
    const platilloEstrella = document.getElementById("cortePlatilloEstrella").innerText;
    const cantEstrella = document.getElementById("cortePlatilloEstrellaCant").innerText;

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
            <div><b>Apertura Turno:</b> ${turnoPOS.fechaApertura || 'N/A'}</div>
            <div><b>Fecha Corte:</b> ${new Date().toLocaleString('es-MX')}</div>
            <div class="line"></div>
            <div><b>⭐ Platillo Estrella:</b></div>
            <div>${platilloEstrella} (${cantEstrella})</div>
            <div class="line"></div>
            <div>Fondo Inicial: $${(turnoPOS.fondoInicial || 0).toFixed(2)}</div>
            <div>Ventas Efectivo: $${ventasEfectivo.toFixed(2)}</div>
            <div>Salidas / Gastos: $${totalGastos.toFixed(2)}</div>
            ${gastosHTML}
            <div class="line"></div>
            <div class="bold">EFECTIVO ESPERADO: $${efectivoEsperado.toFixed(2)}</div>
            <div><b>Efectivo Contado:</b> $${contado.toFixed(2)}</div>
            ${desgloseHTML !== "" ? `<div style="font-size:10px; margin:4px 0;">${desgloseHTML}</div>` : ''}
            <div class="bold">Diferencia: $${diferencia.toFixed(2)}</div>
            <div class="line"></div>
            <div>Ventas Tarjeta: ${ventasTarjeta}</div>
            <div>Ventas SPEI: ${ventasSpei}</div>
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
    if (!confirm("⚠️ ¿Estás seguro de cerrar el turno actual? Se cerrará la caja en la nube y la sesión.")) return;
    const token = localStorage.getItem("POS_TACOS_TOKEN");

    fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "cerrarTurnoGlobal", token: token })
    })
    .then(() => {
        localStorage.removeItem("POS_TACOS_TOKEN");
        location.reload();
    })
    .catch(() => {
        localStorage.removeItem("POS_TACOS_TOKEN");
        location.reload();
    });
}

// ==========================================================================
// 4. GESTIÓN DE MESAS Y CATÁLOGO (CON INTEGRACIÓN DE PROMOCIONES ACTIVAS)
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
        // 1. Productos regulares
        let productosBase = (data.productos || []).filter(p => p.id && p.nombre);

        // 2. Mapear promociones activas como productos en la categoría "Promociones"
        let promosBase = (data.promociones || [])
            .filter(pr => (pr.activo || "").toUpperCase() === "SI" && pr.titulo)
            .map((pr, index) => {
                return {
                    id: `PROMO_${pr.filaExcel || index}`,
                    nombre: `🔥 ${pr.titulo}`,
                    categoria: "Promociones",
                    precio: pr.precioOferta || pr.precioLista || 0,
                    descripcion: pr.descripcion || pr.subtitulo || "",
                    agotado: "NO"
                };
            });

        // 3. Unir productos y promociones en el arreglo global
        products = [...promosBase, ...productosBase];

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
                    <span style="font-size:0.85rem; font-weight:700; min-width:16px; text-align:center; color:#fff;">${item.quantity}</span>
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
            <div><b>Lugar:</b> ${v.nombre || v.cliente || 'Mostrador'}</div>
            <div><b>Pago:</b> ${v.metodo_pago}</div>
            <div><b>Notas:</b> ${v.notas}</div>
            <div class="line"></div>
            ${itemsHTML}
            <div class="line"></div>
            <div style="font-size:14px;" class="bold">TOTAL: $${parseFloat(v.total).toFixed(2)}</div>
            ${v.metodo_pago === 'Efectivo' ? `<div>Paga Con: $${parseFloat(v.efectivo_recibido || v.total).toFixed(2)}</div><div>Cambio: $${parseFloat(v.cambio || 0).toFixed(2)}</div>` : ''}
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