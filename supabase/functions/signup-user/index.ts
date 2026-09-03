import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SignupRequest {
  email: string;
  password: string;
  name: string;
  company_name?: string;
}

async function findAuthUserByEmail(
  adminClient: ReturnType<typeof createClient>,
  email: string
) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as SignupRequest;

    const { email, password, name } = payload;
    const companyName = (payload.company_name || "").trim() || `${name.trim()}'s company`;

    if (!email || !password || !name) {
      throw new Error("Missing required fields");
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || ""
    );

    // 1. Check if user already exists (paged — do not load every auth user)
    const existingUser = await findAuthUserByEmail(adminClient, email);

    let userId: string;

    if (existingUser) {
      // User already exists in auth
      userId = existingUser.id;

      // Check if profile already exists
      const { data: existingProfile } = await adminClient
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (existingProfile) {
        // Profile already exists - just return success
        const { data: sessionData } = await userClient.auth.signInWithPassword({
          email,
          password,
        });

        return new Response(
          JSON.stringify({
            success: true,
            user: { id: userId, email },
            session: sessionData?.session,
            message: "User already exists",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      // Create new user
      const { data: authData, error: signupError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (signupError) {
        throw new Error(`Auth error: ${signupError.message}`);
      }

      if (!authData.user) {
        throw new Error("User creation failed");
      }

      userId = authData.user.id;
    }

    // 2. Each signup is a new tenant. Team invites join an existing company.
    const trialEnds = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    let companyId: string;
    const tenantInsert = await adminClient
      .from("companies")
      .insert({
        name: companyName,
        email,
        access_status: "active",
        billing_status: "trial",
        plan: "crew",
        trial_ends_at: trialEnds,
        seat_limit: 5,
        created_by: userId,
      })
      .select("id")
      .single();

    if (tenantInsert.error || !tenantInsert.data) {
      const fallback = await adminClient
        .from("companies")
        .insert({ name: companyName, email, created_by: userId })
        .select("id")
        .single();
      if (fallback.error || !fallback.data) {
        throw new Error(`Failed to create company: ${tenantInsert.error?.message || fallback.error?.message}`);
      }
      companyId = fallback.data.id as string;
    } else {
      companyId = tenantInsert.data.id as string;
    }

    const role = "admin";
    const templateAccess = "edit";

    try {
      await adminClient.from("platform_operator_events").insert({
        actor_id: userId,
        actor_email: email,
        company_id: companyId,
        action: "signup",
        detail: { company_name: companyName },
      });
    } catch {
      // SQL 067 not applied yet
    }

    // 3. Create profile (using service role to bypass RLS)
    const { error: profileError } = await adminClient
      .from("profiles")
      .insert({
        id: userId,
        email,
        name,
        company_id: companyId,
        role,
        template_access: templateAccess,
      });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    // 4. Generate session token for immediate login
    const { data: sessionData, error: sessionError } = await userClient.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) {
      console.error("Session error:", sessionError);
      throw new Error(`Failed to create session: ${sessionError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email,
          name,
        },
        session: sessionData.session,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Signup error:", message);
    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
