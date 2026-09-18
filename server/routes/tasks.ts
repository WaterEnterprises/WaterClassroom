import { Hono } from "hono";
import { getDb } from "../db";

export const taskRoutes = new Hono();

taskRoutes.get("/", async (c) => {
  const { rows } = await getDb().execute("SELECT * FROM tasks ORDER BY id DESC");
  return c.json(rows);
});

taskRoutes.post("/", async (c) => {
  try {
    const body = await c.req.json();
    const id = `task-${Date.now()}`;
    await getDb().execute({
      sql: `INSERT INTO tasks (id, title, description, category, rewardPoints, status, assignee, createdBy, backersCount) VALUES (?, ?, ?, ?, ?, 'Open', NULL, ?, 1)`,
      args: [id, body.title, body.description, body.category || "Community", body.rewardPoints || 1000, body.createdBy || "Student Builder"],
    });
    return c.json({ id, title: body.title, description: body.description, category: body.category || "Community", rewardPoints: body.rewardPoints || 1000, status: "Open", assignee: null, createdBy: body.createdBy || "Student Builder", backersCount: 1 });
  } catch (err) {
    return c.json({ error: "Failed to create task" }, 400);
  }
});

taskRoutes.patch("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    const body = await c.req.json();
    const sets: string[] = [];
    const args: any[] = [];
    for (const [k, v] of Object.entries(body)) {
      sets.push(`${k} = ?`);
      args.push(v);
    }
    args.push(id);
    await getDb().execute({ sql: `UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, args });
    const { rows } = await getDb().execute({ sql: "SELECT * FROM tasks WHERE id = ?", args: [id] });
    return rows.length > 0 ? c.json(rows[0]) : c.json({ error: "Task not found" }, 404);
  } catch (err) {
    return c.json({ error: "Failed to update task" }, 400);
  }
});
