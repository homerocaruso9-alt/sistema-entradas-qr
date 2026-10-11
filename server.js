const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

let db;

// Configuración de Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar la base de datos
async function initDB() {
  db = await open({
    filename: path.join(__dirname, 'base.db'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      comprador TEXT NOT NULL,
      estado TEXT DEFAULT 'PAGADO',
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      fecha_uso DATETIME
    )
  `);

  console.log('✅ Base de datos SQLite conectada correctamente.');
}

// ----------------------------------------------------
// RUTAS Y ENDPOINTS DE LA API
// ----------------------------------------------------

// 1. Crear tickets/entradas (Soporta múltiples)
app.post('/api/crear-ticket', async (req, res) => {
  const { comprador, cantidad } = req.body;

  if (!comprador) {
    return res.status(400).json({ error: 'Falta el nombre del comprador' });
  }

  const numEntradas = parseInt(cantidad, 10) || 1;
  const ticketsCreados = [];

  try {
    for (let i = 0; i < numEntradas; i++) {
      const id = uuidv4();
      await db.run(
        `INSERT INTO tickets (id, comprador, estado) VALUES (?, ?, 'PAGADO')`,
        [id, comprador]
      );

      const qrDataUrl = await QRCode.toDataURL(id);
      ticketsCreados.push({
        id,
        comprador,
        numeroTicket: i + 1,
        totalTickets: numEntradas,
        qrImage: qrDataUrl
      });
    }

    return res.json({
      mensaje: `Se crearon ${numEntradas} ticket(s) con éxito.`,
      tickets: ticketsCreados
    });
  } catch (err) {
    console.error('Error al crear tickets:', err);
    return res.status(500).json({ error: 'Error al registrar los tickets en la base de datos' });
  }
});

// 2. Descargar imagen QR directamente
app.get('/api/qr/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const qrDataUrl = await QRCode.toDataURL(id);
    const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const imgBuffer = Buffer.from(base64Data, 'base64');

    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename=ticket-${id.slice(0, 8)}.png`
    });
    res.end(imgBuffer);
  } catch (err) {
    console.error('Error al generar QR de descarga:', err);
    res.status(500).send('Error al generar la imagen del QR');
  }
});

// 3. Validar / Escanear un ticket
app.post('/api/escanear', async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ valido: false, mensaje: 'ID de ticket no proporcionado' });
  }

  try {
    const ticket = await db.get(`SELECT * FROM tickets WHERE id = ?`, [id]);

    if (!ticket) {
      return res.status(404).json({ valido: false, mensaje: '❌ TICKET INEXISTENTE O FALSO' });
    }

    if (ticket.estado === 'USADO') {
      return res.status(400).json({
        valido: false,
        mensaje: `⚠️ TICKET YA USADO por ${ticket.comprador} el ${ticket.fecha_uso}`
      });
    }

    // Marcar como usado
    const fechaUso = new Date().toLocaleString();
    await db.run(
      `UPDATE tickets SET estado = 'USADO', fecha_uso = ? WHERE id = ?`,
      [fechaUso, id]
    );

    return res.json({
      valido: true,
      mensaje: `✅ TICKET VÁLIDO. Bienvenido ${ticket.comprador}`
    });
  } catch (err) {
    console.error('Error al escanear ticket:', err);
    return res.status(500).json({ valido: false, mensaje: 'Error interno del servidor' });
  }
});

// 4. Listar todos los tickets registrados
app.get('/api/tickets', async (req, res) => {
  try {
    const tickets = await db.all(`SELECT * FROM tickets ORDER BY fecha_creacion DESC`);
    res.json(tickets);
  } catch (err) {
    console.error('Error al obtener lista de tickets:', err);
    res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

// Arrancar el servidor
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Error al inicializar la base de datos:', err);
});