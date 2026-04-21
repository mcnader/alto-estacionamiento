import { Router, type IRouter } from "express";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);

router.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Node.js Template</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        background: radial-gradient(circle at top, #1f2937, #0b1020 60%);
        color: #f8fafc;
        padding: 2rem;
      }
      .card {
        max-width: 560px;
        width: 100%;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 16px;
        padding: 2.5rem;
        backdrop-filter: blur(12px);
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      }
      h1 { margin: 0 0 0.5rem; font-size: 1.875rem; }
      p { margin: 0.5rem 0; color: #cbd5e1; line-height: 1.6; }
      .badge {
        display: inline-block;
        background: #16a34a;
        color: white;
        font-size: 0.75rem;
        font-weight: 600;
        padding: 0.25rem 0.625rem;
        border-radius: 999px;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin-bottom: 1rem;
      }
      code {
        background: rgba(148, 163, 184, 0.15);
        padding: 0.125rem 0.375rem;
        border-radius: 4px;
        font-size: 0.875em;
      }
      a { color: #60a5fa; }
      ul { padding-left: 1.25rem; }
      li { margin: 0.35rem 0; }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="badge">Online</span>
      <h1>Hola desde Node.js</h1>
      <p>Tu plantilla de Node.js con Express está funcionando correctamente.</p>
      <p>Endpoints disponibles:</p>
      <ul>
        <li><code>GET /api/</code> — esta página</li>
        <li><code>GET /api/healthz</code> — verificación de estado</li>
      </ul>
      <p>Edita <code>artifacts/api-server/src/routes/</code> para agregar nuevas rutas.</p>
    </main>
  </body>
</html>`);
});

export default router;
