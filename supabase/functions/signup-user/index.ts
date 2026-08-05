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
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as SignupRequest;

    const { email, password, name } = payload;

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

    // 1. Check if user already exists
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === email);

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

    // 2. Get the BTS company (all users belong to same company)
    const { data: companies, error: companyQueryError } = await adminClient
      .from("companies")
      .select("id")
      .limit(1);

    if (companyQueryError || !companies || companies.length === 0) {
      throw new Error("No company found");
    }

    const companyId = companies[0].id;

    // 3. Create profile (using service role to bypass RLS)
    const { error: profileError } = await adminClient
      .from("profiles")
      .insert({
        id: userId,
        email,
        name,
        company_id: companyId,
        role: "member",
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
