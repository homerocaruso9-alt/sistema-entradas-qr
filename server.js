const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const initDB = require('./database'); // Importa la conexión a Supabase

const app = express();
const PORT = process.env.PORT || 3000;

let db;

// Configuración de Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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
      // PostgreSQL usa $1, $2 en lugar de ?
      await db.query(
        `INSERT INTO tickets (id, comprador, estado) VALUES ($1, $2, 'PAGADO')`,
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
    // Con PostgreSQL, el resultado viene en .rows[0]
    const result = await db.query(`SELECT * FROM tickets WHERE id = $1`, [id]);
    const ticket = result.rows[0];

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
    await db.query(
      `UPDATE tickets SET estado = 'USADO', fecha_uso = $1 WHERE id = $2`,
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
    // Con PostgreSQL, obtenemos las filas con .rows
    const result = await db.query(`SELECT * FROM tickets ORDER BY fecha_creacion DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener lista de tickets:', err);
    res.status(500).json({ error: 'Error al consultar la base de datos' });
  }
});

// Arrancar el servidor conectando primero a Supabase
initDB().then((pool) => {
  db = pool;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ejecutándose en http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('Error al inicializar la base de datos:', err);
});
