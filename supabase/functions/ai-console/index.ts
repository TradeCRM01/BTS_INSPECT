import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function getAiSettings(companyId: string): Promise<{ apiKey: string; model: string; adminToolsEnabled: boolean }> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from("ai_settings")
    .select("anthropic_api_key, model, admin_tools_enabled")
    .eq("company_id", companyId)
    .maybeSingle();
  return {
    apiKey: data?.anthropic_api_key ?? Deno.env.get("ANTHROPIC_API_KEY") ?? "",
    model: data?.model ?? "claude-opus-4-7",
    adminToolsEnabled: data?.admin_tools_enabled ?? true,
  };
}

// ── System prompts ────────────────────────────────────────────────────────────

const HELP_SYSTEM_PROMPT = `You are a friendly AI assistant embedded inside BTS Inspect — a field inspection and reporting app.

Your role is to help users understand how to use the app and answer questions about inspections, templates, reports, and general workflow. You cannot make changes to the system.

Key features you can explain:
- Creating and managing inspection templates (sections, questions, conditional logic, question types)
- Filling out inspections in the field with photo capture
- Generating and downloading PDF reports
- Managing team members (admin vs inspector roles)
- Understanding job linking (grouping multiple inspections under a job)
- Profile and company settings

Be helpful, concise, and friendly. If a user asks you to make a change to the system, politely explain that only admins have access to that capability. Keep answers focused on how to use BTS Inspect.`;

const ADMIN_SYSTEM_PROMPT = `You are an expert AI console embedded inside BTS Inspect — a field inspection and reporting platform.

You have access to database tools. Only use them when the user is asking about specific data, diagnosing a real issue, or requesting a change — NOT for general how-to questions about the app. If someone asks "how do I do X", answer from your knowledge without touching the database.

When you do use tools, use the minimum number needed. Do not chain multiple tool calls just to gather context for a simple question.

Tech stack:
- Frontend: React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router v7
- Backend: Supabase (PostgreSQL, RLS, Edge Functions, Storage)
- PDF generation: @react-pdf/renderer
- Auth: Supabase email/password

Database tables:
- companies (id, name, logo_url, abn, address, phone, email)
- profiles (id, company_id, name, email, role: admin|inspector, avatar_url)
- templates (id, company_id, name, description, schema: jsonb, renderer_id, is_archived)
- inspections (id, company_id, template_id, inspector_id, job_id, meta: jsonb, answers: jsonb, status: draft|submitted, is_archived)
- inspection_photos (id, inspection_id, question_key, storage_path, caption)
- inspection_reports (id, inspection_id, company_id, report_number, pdf_url, generated_at)
- inspection_renderers (id, company_id, name, renderer_key)
- ai_console_sessions (id, company_id, user_id, title, messages: jsonb)

App workflow knowledge (answer from this, not the database):
- Templates: go to Templates → New Template. Add sections and questions using the editor. Question types include text, number, yes/no, multiple choice, photo, signature, date, and checkbox.
- Inspections: go to Inspections → New Inspection. Select a template, fill in job details, then fill out each section. Submit when complete.
- PDF Reports: open a submitted inspection → click Generate Report. The PDF is built from the inspection answers and your company branding. Download from the report page.
- Team: Settings → Team. Invite members by email. Admins can edit templates and access the AI console; inspectors can fill out inspections.
- Jobs: inspections can be linked to a job number so multiple inspections are grouped together.

Response style:
- Answer conversationally in plain language — no code blocks, no SQL, no JSON unless the user explicitly asks for it.
- Be concise. Step-by-step numbered lists are fine for how-to questions.
- Only show technical details if the user is clearly a developer asking a technical question.

When using tools:
1. Always confirm what you are about to do before making destructive changes
2. Show the results of queries clearly
3. If a query returns no data, say so clearly
4. When making changes, describe exactly what was changed
5. Be careful with UPDATE/DELETE — always include a WHERE clause

Design conventions (when suggesting frontend code):
- Primary color: #0A2540 (dark navy)
- Accent color: #2E75B6 (blue)
- Background: #F9FAFB
- Border: #E5E7EB
- Tailwind CSS throughout

You are talking directly to the admin of this platform. Be direct and technical.`;

// ── Admin tools ───────────────────────────────────────────────────────────────

const ADMIN_TOOLS = [
  {
    name: "query_database",
    description: "Execute a read-only SQL SELECT query against the database. Use this to inspect data, count records, check settings, diagnose issues. Only SELECT statements are allowed.",
    input_schema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "A valid PostgreSQL SELECT statement. Must start with SELECT. No INSERT, UPDATE, DELETE, DROP, or DDL allowed here — use execute_sql for writes.",
        },
      },
      required: ["sql"],
    },
  },
  {
    name: "execute_sql",
    description: "Execute a data modification SQL statement (INSERT, UPDATE, DELETE) against the database. Use this carefully to fix data issues, update records, or correct configuration. Always include a WHERE clause for UPDATE/DELETE.",
    input_schema: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "A valid PostgreSQL statement. Can be INSERT, UPDATE, or DELETE. No DROP, TRUNCATE, or DDL. Always include WHERE for UPDATE/DELETE.",
        },
        confirm_intent: {
          type: "string",
          description: "A brief description of what this change does and why it is safe, e.g. 'Updating company name from old to new for company_id X'",
        },
      },
      required: ["sql", "confirm_intent"],
    },
  },
  {
    name: "list_tables",
    description: "List all tables in the public schema with their column names and types. Useful for exploring the database structure.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_company_context",
    description: "Get the current admin's company details, team members, template count, and recent inspection activity. Good starting point for diagnosing company-specific issues.",
    input_schema: { type: "object", properties: {} },
  },
  // ── Real-world agent tools ───────────────────────────────────────
  {
    name: "send_email",
    description: "Send an email on behalf of the user's company. Requires the company to have email/SMTP settings configured (Resend). Use this to send client follow-ups, compliance reminders, invoice chasing, or any business email. Always confirm with the user before sending.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "array", items: { type: "string" }, description: "Recipient email addresses" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body as plain text. The system wraps it in a branded HTML template." },
        cc: { type: "array", items: { type: "string" }, description: "Optional CC recipients" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "create_job",
    description: "Create a new scheduled job in the system. Use this when the user asks to book, schedule, or create a job. Requires a title. Optionally link to a client by client_id, set priority, scheduled date, start/end time, and address.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short job title" },
        client_id: { type: "string", description: "UUID of the client to link (optional)" },
        description: { type: "string", description: "Longer description of the work" },
        priority: { type: "string", enum: ["low", "medium", "high"], description: "Job priority (default medium)" },
        scheduled_date: { type: "string", description: "Date the job is booked for (YYYY-MM-DD)" },
        start_time: { type: "string", description: "Start time HH:MM" },
        end_time: { type: "string", description: "End time HH:MM" },
        address: { type: "string", description: "Job site address if different from client" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_reminder",
    description: "Create a reminder that will surface on the user's dashboard. Use this when the user asks to 'remind me to...', 'follow up on...', or 'make a note to...'. Reminders have an optional due date.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "The reminder text, e.g. 'Follow up on overdue invoice INV-0042'" },
        due_date: { type: "string", description: "When the reminder should fire (ISO datetime, e.g. 2026-08-10T09:00:00Z). Optional." },
        related_type: { type: "string", description: "Optional: 'invoice', 'job', 'compliance', 'client'" },
        related_id: { type: "string", description: "Optional UUID of the related record" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_compliance_item",
    description: "Create a new compliance/recurring-work item tracked for a client. Use this when the user says 'add a compliance item', 'track this inspection annually', or 'set up a recurring service'. Requires a client_id, title, and recurrence interval/unit.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "UUID of the client this compliance item belongs to" },
        title: { type: "string", description: "e.g. 'Annual Fire Extinguisher Service'" },
        description: { type: "string", description: "Scope of work / details" },
        standard_or_regulation: { type: "string", description: "e.g. 'AS 1851', 'NZ Building Code'" },
        recurrence_interval: { type: "integer", description: "How many units between services (default 12)" },
        recurrence_unit: { type: "string", enum: ["days", "weeks", "months", "years"], description: "Unit of recurrence (default months)" },
        first_due_date: { type: "string", description: "First due date YYYY-MM-DD" },
        reminder_days_before: { type: "integer", description: "Days before due date to send reminder (default 30)" },
      },
      required: ["client_id", "title", "first_due_date"],
    },
  },
  {
    name: "web_search",
    description: "Search the web for current information — regulations, supplier pricing, material availability, news, or anything not in the database. Returns titles, snippets, and URLs. Use this when the user asks about something external or real-time.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query" },
        max_results: { type: "integer", description: "Max results to return (default 5, max 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_dashboard_summary",
    description: "Get a live summary of the business right now: active jobs, inspections today, overdue invoices, upcoming compliance deadlines, low stock items, and recent agent actions. Use this when the user asks 'what needs my attention' or 'summarise my day'.",
    input_schema: { type: "object", properties: {} },
  },
];

// ── Auth helpers ──────────────────────────────────────────────────────────────

async function getUser(authHeader: string): Promise<{ userId: string; companyId: string; role: string } | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile) return null;
    return { userId: user.id, companyId: profile.company_id, role: profile.role };
  } catch {
    return null;
  }
}

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  toolInput: Record<string, string>,
  companyId: string,
  userId: string,
): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (toolName === "list_tables") {
      const { data, error } = await supabase.rpc("list_tables_info" as never).select?.() ?? { data: null, error: null };
      // Fallback: query information_schema directly
      const { data: cols, error: colErr } = await supabase
        .from("information_schema.columns" as never)
        .select("table_name, column_name, data_type, is_nullable")
        .eq("table_schema", "public")
        .order("table_name")
        .order("ordinal_position");
      if (colErr) throw new Error(colErr.message);
      const grouped: Record<string, Array<{ column: string; type: string }>> = {};
      for (const row of (cols as Array<{ table_name: string; column_name: string; data_type: string }>) ?? []) {
        if (!grouped[row.table_name]) grouped[row.table_name] = [];
        grouped[row.table_name].push({ column: row.column_name, type: row.data_type });
      }
      return JSON.stringify(grouped, null, 2);
    }

    if (toolName === "get_company_context") {
      const [companyRes, profilesRes, templatesRes, inspectionsRes] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).maybeSingle(),
        supabase.from("profiles").select("id, name, email, role").eq("company_id", companyId),
        supabase.from("templates").select("id, name, is_archived").eq("company_id", companyId),
        supabase.from("inspections").select("id, status, is_archived, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(10),
      ]);
      return JSON.stringify({
        company: companyRes.data,
        team: profilesRes.data,
        templates: templatesRes.data,
        recent_inspections: inspectionsRes.data,
      }, null, 2);
    }

    if (toolName === "query_database") {
      const sql = (toolInput.sql ?? "").trim();
      if (!/^SELECT/i.test(sql)) {
        return "Error: Only SELECT statements are allowed in query_database. Use execute_sql for modifications.";
      }
      // Inject company filter hint as a comment for safety
      const { data, error } = await supabase.rpc("admin_query" as never, { query_sql: sql } as never);
      if (error) {
        // Fallback: run via pg_query if available, else return error
        return `Query error: ${error.message}`;
      }
      return JSON.stringify(data, null, 2);
    }

    if (toolName === "execute_sql") {
      const sql = (toolInput.sql ?? "").trim();
      if (/^(DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)/i.test(sql)) {
        return "Error: DDL statements (DROP, TRUNCATE, ALTER, CREATE, GRANT, REVOKE) are not allowed for safety.";
      }
      const { data, error } = await supabase.rpc("admin_execute" as never, { exec_sql: sql } as never);
      if (error) {
        return `Execution error: ${error.message}`;
      }
      return JSON.stringify({ success: true, result: data, intent: toolInput.confirm_intent }, null, 2);
    }

    if (toolName === "get_dashboard_summary") {
      const today = new Date().toISOString().slice(0, 10);
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const [jobs, inspToday, overdueInv, compliance, lowStock, recentActions] = await Promise.all([
        supabase.from("jobs").select("id,title,status,priority,scheduled_date", { count: "exact", head: true }).in("status", ["scheduled", "in_progress"]),
        supabase.from("inspections").select("*", { count: "exact", head: true }).gte("created_at", today),
        supabase.from("invoices").select("*", { count: "exact", head: true }).eq("status", "overdue"),
        supabase.from("compliance_items").select("id,title,next_due_date,status").gte("next_due_date", today).lte("next_due_date", in30).order("next_due_date", { ascending: true }).limit(10),
        supabase.from("stock_items").select("id,name,quantity,reorder_level").eq("archived", false).limit(10),
        supabase.from("agent_actions").select("action_type,summary,status,created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(5),
      ]);
      const overdue = (lowStock.data ?? []).filter((r: Record<string, number>) => Number(r.quantity ?? 0) <= Number(r.reorder_level ?? 0));
      return JSON.stringify({
        active_jobs: jobs.count ?? 0,
        inspections_today: inspToday.count ?? 0,
        overdue_invoices: overdueInv.count ?? 0,
        upcoming_compliance: compliance.data ?? [],
        low_stock_items: overdue,
        recent_agent_actions: recentActions.data ?? [],
      }, null, 2);
    }

    if (toolName === "send_email") {
      const to = Array.isArray(toolInput.to) ? toolInput.to as string[] : [String(toolInput.to ?? "")];
      const subject = String(toolInput.subject ?? "").trim();
      const body = String(toolInput.body ?? "").trim();
      if (!to.length || !subject || !body) return "Error: to, subject, and body are all required.";
      const { data: settings } = await supabase.from("email_settings").select("smtp_host,smtp_pass,from_name,from_email").eq("company_id", companyId).maybeSingle();
      if (!settings || !String(settings.smtp_host).includes("resend")) {
        return "Error: Email sending requires Resend to be configured in Settings → Email Settings. Please set up email before I can send on your behalf.";
      }
      const fromHeader = `${settings.from_name} <${settings.from_email}>`;
      const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;"><p style="color:#4A5568;font-size:15px;line-height:1.6;white-space:pre-wrap;">${body.replace(/</g, "&lt;")}</p><p style="color:#9CA3AF;font-size:12px;margin-top:24px;">Sent via BTS Inspect AI Agent</p></div>`;
      const cc = Array.isArray(toolInput.cc) ? toolInput.cc as string[] : [];
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.smtp_pass}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromHeader, to, cc: cc.length ? cc : undefined, subject, html }),
      });
      if (!res.ok) {
        const errText = await res.text();
        let msg = `Resend API error (${res.status})`;
        try { const j = JSON.parse(errText); msg = j.message ?? j.error ?? msg; } catch { if (errText) msg = errText.slice(0, 200); }
        await logAction(supabase, companyId, userId, "send_email", "send_email", `Failed to send email "${subject}"`, { to, subject, error: msg }, "failed");
        return `Error sending email: ${msg}`;
      }
      await logAction(supabase, companyId, userId, "send_email", "send_email", `Sent email "${subject}" to ${to.join(", ")}`, { to, cc, subject, body }, "success");
      return `Email sent successfully to ${to.join(", ")}. Subject: "${subject}".`;
    }

    if (toolName === "create_job") {
      const title = String(toolInput.title ?? "").trim();
      if (!title) return "Error: title is required to create a job.";
      const insert: Record<string, unknown> = { company_id: companyId, title, created_by: userId };
      if (toolInput.client_id) insert.client_id = toolInput.client_id;
      if (toolInput.description) insert.description = toolInput.description;
      if (toolInput.priority) insert.priority = toolInput.priority;
      if (toolInput.scheduled_date) insert.scheduled_date = toolInput.scheduled_date;
      if (toolInput.start_time) insert.start_time = toolInput.start_time;
      if (toolInput.end_time) insert.end_time = toolInput.end_time;
      if (toolInput.address) insert.address = toolInput.address;
      const { data, error } = await supabase.from("jobs").insert(insert).select("id,title").single();
      if (error) {
        await logAction(supabase, companyId, userId, "create_job", "create_job", `Failed to create job "${title}"`, { title, error: error.message }, "failed");
        return `Error creating job: ${error.message}`;
      }
      await logAction(supabase, companyId, userId, "create_job", "create_job", `Created job "${title}"`, { job_id: data?.id, title }, "success");
      return `Job created successfully: "${title}" (id: ${data?.id}). It is now visible on the Jobs page and dashboard.`;
    }

    if (toolName === "create_reminder") {
      const title = String(toolInput.title ?? "").trim();
      if (!title) return "Error: title is required for a reminder.";
      const insert: Record<string, unknown> = { company_id: companyId, user_id: userId, title };
      if (toolInput.due_date) insert.due_date = toolInput.due_date;
      if (toolInput.related_type) insert.related_type = toolInput.related_type;
      if (toolInput.related_id) insert.related_id = toolInput.related_id;
      const { data, error } = await supabase.from("agent_reminders").insert(insert).select("id").single();
      if (error) {
        await logAction(supabase, companyId, userId, "create_reminder", "create_reminder", `Failed to create reminder "${title}"`, { title, error: error.message }, "failed");
        return `Error creating reminder: ${error.message}`;
      }
      await logAction(supabase, companyId, userId, "create_reminder", "create_reminder", `Created reminder "${title}"`, { reminder_id: data?.id, title, due_date: toolInput.due_date ?? null }, "success");
      return `Reminder created: "${title}"${toolInput.due_date ? ` due ${toolInput.due_date}` : ""}. It will appear on your dashboard.`;
    }

    if (toolName === "create_compliance_item") {
      const clientId = String(toolInput.client_id ?? "").trim();
      const title = String(toolInput.title ?? "").trim();
      const firstDue = String(toolInput.first_due_date ?? "").trim();
      if (!clientId || !title || !firstDue) return "Error: client_id, title, and first_due_date are required.";
      const interval = Number(toolInput.recurrence_interval ?? 12);
      const unit = String(toolInput.recurrence_unit ?? "months");
      const insert: Record<string, unknown> = {
        company_id: companyId, client_id: clientId, title, first_due_date: firstDue, next_due_date: firstDue,
        recurrence_interval: interval, recurrence_unit: unit, reminder_days_before: Number(toolInput.reminder_days_before ?? 30),
      };
      if (toolInput.description) insert.description = toolInput.description;
      if (toolInput.standard_or_regulation) insert.standard_or_regulation = toolInput.standard_or_regulation;
      const { data, error } = await supabase.from("compliance_items").insert(insert).select("id").single();
      if (error) {
        await logAction(supabase, companyId, userId, "create_compliance_item", "create_compliance_item", `Failed to create compliance item "${title}"`, { title, error: error.message }, "failed");
        return `Error creating compliance item: ${error.message}`;
      }
      await logAction(supabase, companyId, userId, "create_compliance_item", "create_compliance_item", `Created compliance item "${title}" for client ${clientId}`, { item_id: data?.id, title }, "success");
      return `Compliance item "${title}" created, recurring every ${interval} ${unit}, first due ${firstDue}. Visible on the Compliance page.`;
    }

    if (toolName === "web_search") {
      const query = String(toolInput.query ?? "").trim();
      if (!query) return "Error: query is required for web search.";
      const max = Math.min(Number(toolInput.max_results ?? 5), 10);
      const apiKey = Deno.env.get("TAVILY_API_KEY") ?? "";
      if (!apiKey) {
        return "Error: Web search is not configured. Set a TAVILY_API_KEY secret to enable web search.";
      }
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, max_results: max, include_answer: true }),
      });
      if (!res.ok) { const t = await res.text(); return `Web search error: ${res.status} ${t.slice(0, 200)}`; }
      const json = await res.json();
      await logAction(supabase, companyId, userId, "web_search", "web_search", `Searched the web for "${query}"`, { query, results: (json.results ?? []).slice(0, max) }, "success");
      const results = (json.results ?? []).slice(0, max).map((r: Record<string, string>, i: number) =>
        `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content?.slice(0, 300) ?? ""}`
      ).join("\n\n");
      return `Web search results for "${query}":\n\n${json.answer ? `Summary: ${json.answer}\n\n` : ""}${results}`;
    }

    return `Unknown tool: ${toolName}`;
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// ── Streaming chat with optional tool use ────────────────────────────────────

async function streamChat(
  messages: Array<{ role: string; content: string | unknown[] }>,
  isAdmin: boolean,
  companyId: string,
  userId: string,
  onChunk: (bytes: Uint8Array) => void,
  aiSettings: { apiKey: string; model: string; adminToolsEnabled: boolean },
): Promise<string> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const systemPrompt = isAdmin ? ADMIN_SYSTEM_PROMPT : HELP_SYSTEM_PROMPT;
  const tools = (isAdmin && aiSettings.adminToolsEnabled) ? ADMIN_TOOLS : undefined;

  let fullText = "";
  let currentMessages = [...messages];

  // Agentic loop: keep calling Claude until no more tool calls
  for (let iteration = 0; iteration < 10; iteration++) {
    const supportsThinking = aiSettings.model.includes("opus");
    const body: Record<string, unknown> = {
      model: aiSettings.model,
      max_tokens: 8192,
      stream: true,
      system: systemPrompt,
      messages: currentMessages,
    };
    if (supportsThinking) body.thinking = { type: "adaptive" };
    if (tools) body.tools = tools;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": aiSettings.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "interleaved-thinking-2025-05-14",
      },
      body: JSON.stringify(body),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(errText);
    }

    // Parse the full streamed response to detect tool calls
    let responseText = "";
    const toolUses: Array<{ id: string; name: string; input_json: string }> = [];
    let currentToolUse: { id: string; name: string; input_json: string } | null = null;
    let stopReason = "end_turn";

    const reader = anthropicRes.body!.getReader();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Stream SSE bytes through to the client
      onChunk(value);

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try {
          const data = JSON.parse(raw);
          if (data.type === "content_block_start" && data.content_block?.type === "tool_use") {
            currentToolUse = { id: data.content_block.id, name: data.content_block.name, input_json: "" };
          }
          if (data.type === "content_block_delta") {
            if (data.delta?.type === "text_delta") {
              responseText += data.delta.text;
              fullText += data.delta.text;
            }
            if (data.delta?.type === "input_json_delta" && currentToolUse) {
              currentToolUse.input_json += data.delta.partial_json;
            }
          }
          if (data.type === "content_block_stop" && currentToolUse) {
            toolUses.push(currentToolUse);
            currentToolUse = null;
          }
          if (data.type === "message_delta" && data.delta?.stop_reason) {
            stopReason = data.delta.stop_reason;
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    // If no tool calls, we're done
    if (stopReason !== "tool_use" || toolUses.length === 0) break;

    // Build assistant content block for the agentic loop
    const assistantContent: unknown[] = [];
    if (responseText) assistantContent.push({ type: "text", text: responseText });
    for (const tu of toolUses) {
      let parsedInput = {};
      try { parsedInput = JSON.parse(tu.input_json || "{}"); } catch { /* ignore */ }
      assistantContent.push({ type: "tool_use", id: tu.id, name: tu.name, input: parsedInput });
    }

    // Execute tools and build results
    const toolResults: unknown[] = [];
    for (const tu of toolUses) {
      let parsedInput: Record<string, string> = {};
      try { parsedInput = JSON.parse(tu.input_json || "{}"); } catch { /* ignore */ }

      // Stream a tool-call indicator to the client
      const toolMsg = `\n\n_[Calling tool: ${tu.name}...]_\n\n`;
      onChunk(encoder.encode(`data: ${JSON.stringify({
        type: "content_block_delta",
        delta: { type: "text_delta", text: toolMsg },
      })}\n\n`));
      fullText += toolMsg;

      const result = await executeTool(tu.name, parsedInput, companyId, userId);

      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: result,
      });
    }

    // Append to conversation for next iteration
    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: assistantContent },
      { role: "user", content: toolResults },
    ];

    // Reset for next iteration
    responseText = "";
  }

  return fullText;
}

// ── Action logging helper ─────────────────────────────────────────────────────

async function logAction(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  userId: string,
  actionType: string,
  toolName: string,
  summary: string,
  details: Record<string, unknown>,
  status: "success" | "failed" | "pending" = "success",
): Promise<void> {
  try {
    await supabase.from("agent_actions").insert({
      company_id: companyId,
      user_id: userId,
      action_type: actionType,
      tool_name: toolName,
      summary,
      details,
      status,
    });
  } catch { /* swallow — logging is best-effort */ }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userCtx = await getUser(authHeader);
    if (!userCtx) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/ai-console\/?/, "");
    const isAdmin = userCtx.role === "admin";

    // Load AI settings from DB (falls back to env var for backwards compat)
    const aiSettings = await getAiSettings(userCtx.companyId);
    if (!aiSettings.apiKey) {
      return new Response(JSON.stringify({ error: "No API key configured. Go to Settings → AI Settings to add your Anthropic API key." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET /sessions ─────────────────────────────────────────────────────────
    if (req.method === "GET" && (!path || path === "sessions")) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await supabase
        .from("ai_console_sessions")
        .select("id, title, created_at, updated_at")
        .eq("user_id", userCtx.userId)
        .order("updated_at", { ascending: false })
        .limit(50);
      return new Response(JSON.stringify({ sessions: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET /sessions/:id ─────────────────────────────────────────────────────
    if (req.method === "GET" && path.startsWith("sessions/")) {
      const sessionId = path.replace("sessions/", "");
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await supabase
        .from("ai_console_sessions")
        .select("*")
        .eq("id", sessionId)
        .eq("user_id", userCtx.userId)
        .maybeSingle();
      if (!data) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE /sessions/:id ──────────────────────────────────────────────────
    if (req.method === "DELETE" && path.startsWith("sessions/")) {
      const sessionId = path.replace("sessions/", "");
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from("ai_console_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", userCtx.userId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET /actions ──────────────────────────────────────────────────────────
    if (req.method === "GET" && path === "actions") {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await supabase
        .from("agent_actions")
        .select("id,action_type,tool_name,summary,status,created_at")
        .eq("company_id", userCtx.companyId)
        .order("created_at", { ascending: false })
        .limit(20);
      return new Response(JSON.stringify({ actions: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET /reminders ─────────────────────────────────────────────────────────
    if (req.method === "GET" && path === "reminders") {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await supabase
        .from("agent_reminders")
        .select("id,title,due_date,completed,related_type,created_at")
        .eq("company_id", userCtx.companyId)
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(20);
      return new Response(JSON.stringify({ reminders: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── POST /reminders/:id/complete ───────────────────────────────────────────
    if (req.method === "POST" && path.match(/^reminders\/[^/]+\/complete$/)) {
      const reminderId = path.split("/")[1];
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from("agent_reminders")
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq("id", reminderId)
        .eq("company_id", userCtx.companyId);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── POST /chat ────────────────────────────────────────────────────────────
    if (req.method === "POST" && (!path || path === "chat")) {
      const body = await req.json();
      const { messages, sessionId } = body as {
        messages: Array<{ role: string; content: string }>;
        sessionId?: string;
      };

      if (!Array.isArray(messages) || messages.length === 0) {
        return new Response(JSON.stringify({ error: "messages required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const encoder = new TextEncoder();
      let fullText = "";

      const stream = new ReadableStream({
        async start(controller) {
          try {
            fullText = await streamChat(
              messages,
              isAdmin,
              userCtx.companyId,
              userCtx.userId,
              (chunk) => controller.enqueue(chunk),
              aiSettings,
            );
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: "content_block_delta",
              delta: { type: "text_delta", text: `\n\nError: ${errMsg}` },
            })}\n\n`));
          } finally {
            controller.close();

            // Persist conversation
            EdgeRuntime.waitUntil(
              (async () => {
                try {
                  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                  const allMessages = [
                    ...messages,
                    { role: "assistant", content: fullText },
                  ];
                  const title = messages[0]?.content?.toString().slice(0, 80) ?? "New conversation";

                  if (sessionId) {
                    await supabase
                      .from("ai_console_sessions")
                      .update({ messages: allMessages, updated_at: new Date().toISOString() })
                      .eq("id", sessionId)
                      .eq("user_id", userCtx.userId);
                  } else {
                    await supabase.from("ai_console_sessions").insert({
                      company_id: userCtx.companyId,
                      user_id: userCtx.userId,
                      title,
                      messages: allMessages,
                    });
                  }
                } catch {
                  // swallow
                }
              })()
            );
          }
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
