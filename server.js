const express = require('express');
const { Pool } = require('pg');
const app = express();

// Configuración de la base de datos (Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Crear tabla si no existe
pool.query(`
  CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(err => console.error('Error creando tabla:', err));

// === API REST ===

// 1. Consultar TODOS los registros (con fecha)
app.get('/api/todos', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, text, created_at FROM todos ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Consultar UN registro individual
app.get('/api/todos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT id, text, created_at FROM todos WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Agregar
app.post('/api/todos', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Texto requerido' });
  try {
    const result = await pool.query(
      'INSERT INTO todos (text) VALUES ($1) RETURNING id, text, created_at',
      [text.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Editar
app.put('/api/todos/:id', async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Texto requerido' });
  try {
    const result = await pool.query(
      'UPDATE todos SET text = $1 WHERE id = $2 RETURNING id, text, created_at',
      [text.trim(), id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Eliminar
app.delete('/api/todos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('DELETE FROM todos WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === Frontend con MODAL VISUAL para consulta individual ===
app.get('*', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Todo List - Actividad 3.3 (100% cumplida)</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 700px; margin: 40px auto; padding: 20px; background: #f9f9f9; }
    h1 { text-align: center; color: #2c3e50; }
    input, button { padding: 10px; font-size: 16px; border-radius: 5px; }
    input { width: 65%; border: 1px solid #ddd; }
    button { cursor: pointer; }
    .add-btn { background: #27ae60; color: white; border: none; }
    ul { list-style: none; padding: 0; }
    li { 
      padding: 15px; background: white; margin: 10px 0; 
      border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      display: flex; justify-content: space-between; align-items: center;
    }
    .actions button { 
      background: #3498db; color: white; border: none; padding: 8px 12px; 
      margin-left: 5px; border-radius: 4px; font-size: 14px;
    }
    .actions .edit { background: #f39c12; }
    .actions .delete { background: #e74c3c; }
    .edit-input { display: flex; width: 100%; }
    .edit-input input { flex: 1; margin-right: 10px; }
    .edit-input button { background: #27ae60; }
    .edit-input button:last-child { background: #95a5a6; }
    small { color: #7f8c8d; font-size: 0.9em; }
    /* Modal */
    #detailModal {
      display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.6); justify-content: center; align-items: center; z-index: 1000;
    }
    .modal-content {
      background: white; padding: 25px; border-radius: 10px; width: 90%; max-width: 500px;
      box-shadow: 0 5px 15px rgba(0,0,0,0.3);
    }
    .close-btn { float: right; font-size: 24px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Todo List - Actividad 3.3</h1>
  <div style="text-align:center; margin-bottom:20px;">
    <input type="text" id="todoInput" placeholder="Nueva tarea..." />
    <button class="add-btn" onclick="addTodo()">Agregar</button>
  </div>
  <ul id="todoList"></ul>

  <!-- Modal para detalle visual -->
  <div id="detailModal">
    <div class="modal-content">
      <span class="close-btn" onclick="closeModal()">&times;</span>
      <h3>Detalle de la Tarea</h3>
      <div id="detailContent"></div>
      <button onclick="closeModal()" style="margin-top:20px; padding:10px 20px; background:#3498db; color:white; border:none; border-radius:5px;">
        Cerrar
      </button>
    </div>
  </div>

  <script>
    const api = '/api/todos';
    let editingId = null;

    async function loadTodos() {
      const res = await fetch(api);
      const todos = await res.json();
      const list = document.getElementById('todoList');
      list.innerHTML = '';
      todos.forEach(todo => {
        const date = new Date(todo.created_at).toLocaleString('es-MX');
        const li = document.createElement('li');
        li.innerHTML = editingId === todo.id ? 
          \`<div class="edit-input">
            <input type="text" id="editInput" value="\${todo.text}" />
            <button onclick="saveEdit()">✔</button>
            <button onclick="cancelEdit()">✖</button>
          </div>\` :
          \`<div>
            <strong ondblclick="startEdit(\${todo.id}, this)">\${todo.text}</strong>
            <br><small>ID: \${todo.id} | Creado: \${date}</small>
          </div>
           <div class="actions">
             <button onclick="showDetail(\${JSON.stringify(todo)})" title="Ver detalle completo">👁️</button>
             <button class="edit" onclick="startEdit(\${todo.id}, this.parentElement.previousElementSibling.querySelector('strong'))">✎</button>
             <button class="delete" onclick="deleteTodo(\${todo.id})">×</button>
           </div>\`;
        list.appendChild(li);
      });
      if (editingId) document.getElementById('editInput')?.focus();
    }

    function showDetail(todo) {
      const date = new Date(todo.created_at).toLocaleString('es-MX');
      document.getElementById('detailContent').innerHTML = \`
        <p><strong>ID:</strong> \${todo.id}</p>
        <p><strong>Tarea:</strong> \${todo.text}</p>
        <p><strong>Creado el:</strong> \${date}</p>
      \`;
      document.getElementById('detailModal').style.display = 'flex';
    }

    function closeModal() {
      document.getElementById('detailModal').style.display = 'none';
    }

    async function addTodo() {
      const input = document.getElementById('todoInput');
      const text = input.value.trim();
      if (!text) return;
      await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      input.value = '';
      loadTodos();
    }

    function startEdit(id, element) {
      editingId = id;
      loadTodos();
    }

    async function saveEdit() {
      const input = document.getElementById('editInput');
      const text = input.value.trim();
      if (!text || !editingId) return;
      await fetch(\`\${api}/\${editingId}\`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      editingId = null;
      loadTodos();
    }

    function cancelEdit() {
      editingId = null;
      loadTodos();
    }

    async function deleteTodo(id) {
      if (!confirm('¿Eliminar esta tarea permanentemente?')) return;
      await fetch(\`\${api}/\${id}\`, { method: 'DELETE' });
      loadTodos();
    }

    // Cargar al inicio
    loadTodos();

    // Enter para agregar
    document.getElementById('todoInput').addEventListener('keypress', e => {
      if (e.key === 'Enter') addTodo();
    });

    // Cerrar modal con clic fuera o ESC
    window.addEventListener('click', e => {
      if (e.target === document.getElementById('detailModal')) closeModal();
    });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeModal();
    });
  </script>
</body>
</html>
  `);
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});